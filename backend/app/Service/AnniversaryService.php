<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use App\Model\AnniversaryEvent;
use App\Model\AnniversaryInvite;
use App\Model\AnniversaryMember;
use App\Model\AnniversarySubscription;
use Carbon\Carbon;
use Hyperf\DbConnection\Db;

/** 纪念日工具：用户事件的云同步、校验、格式化，以及多人共享（成员/邀请/每人一份偏好）。 */
final class AnniversaryService
{
    private const SCENE_TYPES = ['birthday', 'relationship', 'wedding', 'travel', 'deadline', 'baby', 'habit', 'custom'];
    private const CALENDAR_TYPES = ['solar', 'lunar'];
    private const REPEAT_TYPES = ['none', 'yearly'];
    private const COUNT_MODES = ['countdown', 'countup'];
    private const REMIND_DAYS = [0, 1, 3, 7, 14, 30];
    private const CARD_TEMPLATES = ['minimal', 'calendar', 'photo', 'boarding', 'certificate', 'progress', 'festival'];
    private const CARD_TONES = ['warm', 'fresh', 'classic', 'rose', 'ink'];
    private const INVITE_ROLES = ['editor', 'viewer'];
    private const INVITE_TTL_SECONDS = 86400;

    public function __construct(
        private readonly WechatSubscribeMessageService $subscribeMessages,
        private readonly WechatUserService $wechatUsers,
    ) {}

    /**
     * 成员视角的事件列表：owner 的 + 被共享的，各带自己的偏好与角色。
     *
     * @return array<int, array<string, mixed>>
     */
    public function events(int $userId): array
    {
        $members = AnniversaryMember::query()
            ->where('user_id', $userId)
            ->get()
            ->keyBy('anniversary_event_id');
        if ($members->isEmpty()) {
            return [];
        }
        $eventIds = $members->keys()->all();

        $events = AnniversaryEvent::query()
            ->whereIn('id', $eventIds)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        // 展示排序：今年未到的由远到近，跨年的排在今年之后，已过沉底且近的在前。
        // 放在后端做，已发布小程序不发版即可调整顺序；农历年的下次发生日为估算，可能有少量偏差。
        $events = $events
            ->values()
            ->sortBy(fn(AnniversaryEvent $event): array => $this->listSortKey($event), SORT_REGULAR)
            ->values();

        $counts = AnniversaryMember::query()
            ->whereIn('anniversary_event_id', $eventIds)
            ->selectRaw('anniversary_event_id, COUNT(*) AS c')
            ->groupBy('anniversary_event_id')
            ->pluck('c', 'anniversary_event_id');

        return $events
            ->map(fn(AnniversaryEvent $event): array => $this->format(
                $event,
                $members->get($event->id),
                (int) ($counts[$event->id] ?? 1),
            ))
            ->all();
    }

    /**
     * 新建 / 更新。payload 拆两类：
     * - 公共字段（带 title）：owner / editor 才能改；
     * - 个人偏好（myPrefs 嵌套或旧 flat 顶层键）：任意成员改自己那份，旧前端零改动兼容。
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function save(int $userId, array $payload): array
    {
        $id = (int) ($payload['id'] ?? 0);
        $hasPublicEdit = array_key_exists('title', $payload);

        if ($id <= 0) {
            return $this->createEvent($userId, $payload);
        }

        $member = $this->requireMember($userId, $id);
        $event = AnniversaryEvent::query()->where('id', $id)->first();
        if ($event === null) {
            throw new BizException(404, '纪念日不存在');
        }

        if ($hasPublicEdit) {
            if (! in_array($member->role, ['owner', 'editor'], true)) {
                throw new BizException(403, '你只有查看权限，不能编辑这个日子');
            }
            $event->fill($this->normalizePublic($payload));
            $event->save();
        }

        $prefs = $this->normalizeMyPrefs($payload, $member);
        if ($prefs !== []) {
            $member->fill($prefs);
            $member->save();
        }

        return $this->format($event, $member, $this->memberCount($id));
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function createEvent(int $userId, array $payload): array
    {
        $data = $this->normalizePublic($payload);
        $prefs = $this->normalizeMyPrefs($payload, null);

        $maxSort = (int) AnniversaryEvent::query()->where('user_id', $userId)->max('sort_order');
        /** @var AnniversaryEvent $event */
        $event = AnniversaryEvent::query()->create([
            ...$data,
            // 兼容镜像：新事件的偏好同时写入事件旧列，便于极端情况下回滚旧版后端
            'remind_days_before' => (int) ($prefs['remind_days_before'] ?? 1),
            'card_template' => (string) ($prefs['card_template'] ?? 'minimal'),
            'card_tone' => (string) ($prefs['card_tone'] ?? 'warm'),
            'cover_image' => (string) ($prefs['cover_image'] ?? ''),
            'user_id' => $userId,
            'sort_order' => $maxSort + 10,
        ]);

        /** @var AnniversaryMember $member */
        $member = AnniversaryMember::query()->create([
            'anniversary_event_id' => $event->id,
            'user_id' => $userId,
            'role' => 'owner',
            'remind_days_before' => (int) ($prefs['remind_days_before'] ?? 1),
            'remind_time' => (string) ($prefs['remind_time'] ?? '09:00'),
            'card_template' => (string) ($prefs['card_template'] ?? 'minimal'),
            'card_tone' => (string) ($prefs['card_tone'] ?? 'warm'),
            'cover_image' => (string) ($prefs['cover_image'] ?? ''),
        ]);

        return $this->format($event, $member, 1);
    }

    /** 仅 owner 可删除；事务内清理成员行并将未用邀请作废（订阅照旧懒过期）。 */
    public function delete(int $userId, int $id): void
    {
        $member = $this->requireMember($userId, $id);
        if ($member->role !== 'owner') {
            throw new BizException(403, '只有创建者可以删除这个日子');
        }

        Db::transaction(function () use ($id): void {
            $deleted = AnniversaryEvent::query()->where('id', $id)->delete();
            if ($deleted < 1) {
                throw new BizException(404, '纪念日不存在');
            }
            AnniversaryMember::query()->where('anniversary_event_id', $id)->delete();
            AnniversaryInvite::query()
                ->where('anniversary_event_id', $id)
                ->where('status', 'pending')
                ->update(['status' => 'expired', 'updated_at' => date('Y-m-d H:i:s')]);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function markCalendarAdded(int $userId, int $id, string $repeatType): array
    {
        $member = $this->requireMember($userId, $id);
        $event = $this->findEvent($id);

        $member->calendar_added_at = Carbon::now()->format('Y-m-d H:i:s');
        $member->calendar_repeat_type = in_array($repeatType, self::REPEAT_TYPES, true) ? $repeatType : 'none';
        $member->save();
        return $this->format($event, $member, $this->memberCount($id));
    }

    /** 记录一次订阅消息授权（任意成员可为自己订阅）。 */
    public function subscribe(int $userId, int $eventId, string $templateId, string $nextOccurrenceDate = ''): void
    {
        $this->requireMember($userId, $eventId);

        // 避免同一个 event + template 重复订阅
        $exists = AnniversarySubscription::query()
            ->where('user_id', $userId)
            ->where('anniversary_event_id', $eventId)
            ->where('template_id', $templateId)
            ->where('status', 'pending')
            ->exists();
        if ($exists) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        AnniversarySubscription::query()->create([
            'user_id' => $userId,
            'anniversary_event_id' => $eventId,
            'template_id' => $templateId,
            'next_occurrence_date' => $nextOccurrenceDate !== '' ? $nextOccurrenceDate : null,
            'status' => 'pending',
            'subscribed_at' => $now,
            'created_at' => $now,
        ]);
    }

    // ---------------- 共享：邀请 ----------------

    /**
     * owner 生成一次性邀请码（24h 有效），可并存多个 pending。
     *
     * @return array<string, mixed>
     */
    public function createInvite(int $userId, int $eventId, string $role): array
    {
        $member = $this->requireMember($userId, $eventId);
        if ($member->role !== 'owner') {
            throw new BizException(403, '只有创建者可以邀请他人共享');
        }
        if (! in_array($role, self::INVITE_ROLES, true)) {
            throw new BizException(422, '邀请权限只能是查看或编辑');
        }

        $code = $this->newInviteCode();
        $expiresAt = Carbon::now()->addSeconds(self::INVITE_TTL_SECONDS);

        /** @var AnniversaryInvite $invite */
        $invite = AnniversaryInvite::query()->create([
            'code' => $code,
            'anniversary_event_id' => $eventId,
            'inviter_user_id' => $userId,
            'role' => $role,
            'status' => 'pending',
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);

        return [
            'code' => $code,
            'role' => $role,
            'expiresAt' => $invite->expires_at,
            'sharePath' => '/pages/anniversary/index?invite=' . $code,
        ];
    }

    /**
     * 邀请预览：被邀请方确认前看到的内容。
     *
     * @return array<string, mixed>
     */
    public function previewInvite(string $code): array
    {
        $invite = $this->findPendingInvite($code);
        $event = AnniversaryEvent::query()->find((int) $invite->anniversary_event_id);
        if ($event === null) {
            $this->expireInvite($invite);
            throw new BizException(404, '该纪念日已被删除');
        }

        $inviter = $this->wechatUsers->findUser((int) $invite->inviter_user_id);

        return [
            'event' => [
                'title' => (string) $event->title,
                'sceneType' => (string) $event->scene_type,
                'eventDate' => (string) $event->event_date,
                'countMode' => (string) $event->count_mode,
            ],
            'inviter' => [
                'nickname' => (string) ($inviter['nickname'] ?? ''),
                'avatarUrl' => (string) ($inviter['avatar_url'] ?? ''),
            ],
            'role' => (string) $invite->role,
            'expiresAt' => (string) $invite->expires_at,
        ];
    }

    /**
     * 接受邀请：一次性、行锁防并发重复接受；已是成员（含自邀）幂等返回。
     *
     * @return array<string, mixed>
     */
    public function acceptInvite(int $userId, string $code): array
    {
        return Db::transaction(function () use ($userId, $code): array {
            /** @var null|AnniversaryInvite $invite */
            $invite = AnniversaryInvite::query()
                ->where('code', $code)
                ->lockForUpdate()
                ->first();
            if ($invite === null || $invite->status !== 'pending') {
                throw new BizException(404, '邀请已失效或过期');
            }
            if (Carbon::now()->gte(Carbon::parse((string) $invite->expires_at))) {
                $this->expireInvite($invite);
                throw new BizException(404, '邀请已失效或过期');
            }

            $event = AnniversaryEvent::query()->find((int) $invite->anniversary_event_id);
            if ($event === null) {
                $this->expireInvite($invite);
                throw new BizException(404, '该纪念日已被删除');
            }

            $existing = AnniversaryMember::query()
                ->where('anniversary_event_id', $event->id)
                ->where('user_id', $userId)
                ->first();
            if ($existing !== null) {
                // 已是成员（或 owner 自邀）：不改邀请状态，码仍留给真正的受邀人
                return [
                    'event' => $this->format($event, $existing, $this->memberCount((int) $event->id)),
                    'alreadyMember' => true,
                ];
            }

            /** @var AnniversaryMember $member */
            $member = AnniversaryMember::query()->create([
                'anniversary_event_id' => $event->id,
                'user_id' => $userId,
                'role' => (string) $invite->role,
                'remind_days_before' => 1,
                'remind_time' => '09:00',
                // 模板/风格沿用事件当前值作起点；封面是本机路径，跨用户无效，置空
                'card_template' => (string) $event->card_template,
                'card_tone' => (string) $event->card_tone,
                'cover_image' => '',
            ]);

            $invite->status = 'accepted';
            $invite->accepted_by = $userId;
            $invite->accepted_at = date('Y-m-d H:i:s');
            $invite->save();

            return [
                'event' => $this->format($event, $member, $this->memberCount((int) $event->id)),
                'alreadyMember' => false,
            ];
        });
    }

    // ---------------- 共享：成员管理 ----------------

    /**
     * 成员列表（任意成员可看）。
     *
     * @return array<string, mixed>
     */
    public function members(int $userId, int $eventId): array
    {
        $me = $this->requireMember($userId, $eventId);
        $event = $this->findEvent($eventId);

        $rows = AnniversaryMember::query()
            ->where('anniversary_event_id', $eventId)
            ->orderByRaw("role = 'owner' DESC, id")
            ->get();

        $users = [];
        $userIds = $rows->pluck('user_id')->unique()->values()->all();
        if ($userIds !== []) {
            // wechat_users 逐个取（量小），保持与 findUser 一致的返回形态
            foreach ($userIds as $uid) {
                $user = $this->wechatUsers->findUser((int) $uid);
                if ($user !== null) {
                    $users[(int) $uid] = $user;
                }
            }
        }

        $members = $rows->map(function (AnniversaryMember $row) use ($users): array {
            $user = $users[(int) $row->user_id] ?? [];
            return [
                'userId' => (int) $row->user_id,
                'nickname' => (string) ($user['nickname'] ?? ''),
                'avatarUrl' => (string) ($user['avatar_url'] ?? ''),
                'role' => (string) $row->role,
                'joinedAt' => (string) $row->created_at,
            ];
        })->all();

        return [
            'members' => $members,
            'myRole' => (string) $me->role,
            'ownerId' => (int) $event->user_id,
        ];
    }

    /** owner 修改成员权限（不能动 owner 本人）。 */
    public function updateMemberRole(int $userId, int $eventId, int $targetUserId, string $role): array
    {
        $me = $this->requireMember($userId, $eventId);
        $event = $this->findEvent($eventId);
        if ($me->role !== 'owner') {
            throw new BizException(403, '只有创建者可以管理成员');
        }
        if (! in_array($role, self::INVITE_ROLES, true)) {
            throw new BizException(422, '权限只能是查看或编辑');
        }
        if ($targetUserId === (int) $event->user_id) {
            throw new BizException(422, '不能修改创建者的权限');
        }

        /** @var null|AnniversaryMember $target */
        $target = AnniversaryMember::query()
            ->where('anniversary_event_id', $eventId)
            ->where('user_id', $targetUserId)
            ->first();
        if ($target === null) {
            throw new BizException(404, '该成员不存在');
        }
        $target->role = $role;
        $target->save();
        return $this->members($userId, $eventId);
    }

    /** owner 移除成员（不能移除 owner 本人）。 */
    public function removeMember(int $userId, int $eventId, int $targetUserId): array
    {
        $me = $this->requireMember($userId, $eventId);
        $event = $this->findEvent($eventId);
        if ($me->role !== 'owner') {
            throw new BizException(403, '只有创建者可以管理成员');
        }
        if ($targetUserId === (int) $event->user_id) {
            throw new BizException(422, '不能移除创建者');
        }

        $deleted = AnniversaryMember::query()
            ->where('anniversary_event_id', $eventId)
            ->where('user_id', $targetUserId)
            ->delete();
        if ($deleted < 1) {
            throw new BizException(404, '该成员不存在');
        }
        return $this->members($userId, $eventId);
    }

    /** 成员主动退出（owner 只能删除）。 */
    public function leaveEvent(int $userId, int $eventId): void
    {
        $member = $this->requireMember($userId, $eventId);
        $event = $this->findEvent($eventId);
        if ($member->role === 'owner' || (int) $event->user_id === $userId) {
            throw new BizException(422, '创建者不能退出，只能删除这个日子');
        }
        $member->delete();
    }

    // ---------------- 订阅推送 ----------------

    /** 定时任务：扫描待发送的订阅，到期则推送微信消息（提前天数读成员自己的偏好）。 */
    public function sendDueReminders(): array
    {
        $subscriptions = AnniversarySubscription::query()
            ->where('status', 'pending')
            ->get();
        if ($subscriptions->isEmpty()) {
            return ['sent' => 0, 'errors' => []];
        }

        $today = Carbon::today();
        $sent = 0;
        $errors = [];

        foreach ($subscriptions as $sub) {
            /** @var null|AnniversaryEvent $event */
            $event = AnniversaryEvent::query()->find((int) $sub->anniversary_event_id);
            if ($event === null) {
                $sub->status = 'expired';
                $sub->updated_at = date('Y-m-d H:i:s');
                $sub->save();
                continue;
            }

            $member = AnniversaryMember::query()
                ->where('anniversary_event_id', (int) $event->id)
                ->where('user_id', (int) $sub->user_id)
                ->first();
            $daysBefore = (int) ($member->remind_days_before ?? $event->remind_days_before);

            // 计算下一个提醒日期：优先使用前端预计算的准确日期（处理农历年变）
            $reminderDate = $this->resolveReminderDate($event, $sub, $daysBefore);
            if ($reminderDate === null || $today->lt($reminderDate)) {
                continue; // 还没到提醒日
            }

            // 获取用户 openid
            $user = $this->wechatUsers->findUser((int) $sub->user_id);
            if ($user === null) {
                $errors[] = "subscription#{$sub->id}: 用户不存在";
                continue;
            }

            // 构造消息内容：事项时间用本次实际发生日（优先前端预计算的 next_occurrence_date）
            $occurrenceDate = $sub->next_occurrence_date !== null
                ? (string) $sub->next_occurrence_date
                : (string) $event->event_date;
            $templateId = (string) $sub->template_id;
            $data = $this->buildReminderData($event, $occurrenceDate);
            $page = 'pages/anniversary/index';

            $result = $this->subscribeMessages->send(
                (string) $user['openid'],
                $templateId,
                $page,
                $data,
            );

            if ($result === true) {
                $sub->status = 'sent';
                $sub->sent_at = date('Y-m-d H:i:s');
                $sent++;
            } else {
                $errors[] = "subscription#{$sub->id}: {$result}";
            }
            $sub->updated_at = date('Y-m-d H:i:s');
            $sub->save();
        }

        return ['sent' => $sent, 'errors' => $errors];
    }

    // ---------------- 内部工具 ----------------

    /** 找到当前用户的成员行；owner 行缺失（回填遗漏）则自愈补一行。 */
    private function requireMember(int $userId, int $eventId): AnniversaryMember
    {
        /** @var null|AnniversaryMember $member */
        $member = AnniversaryMember::query()
            ->where('anniversary_event_id', $eventId)
            ->where('user_id', $userId)
            ->first();
        if ($member !== null) {
            return $member;
        }

        // 自愈：事件属主缺成员行时按事件旧列补建（偏好兜底迁移）
        /** @var null|AnniversaryEvent $event */
        $event = AnniversaryEvent::query()->where('id', $eventId)->first();
        if ($event !== null && (int) $event->user_id === $userId) {
            /** @var AnniversaryMember $healed */
            $healed = AnniversaryMember::query()->create([
                'anniversary_event_id' => $eventId,
                'user_id' => $userId,
                'role' => 'owner',
                'remind_days_before' => (int) $event->remind_days_before,
                'remind_time' => '09:00',
                'card_template' => (string) $event->card_template,
                'card_tone' => (string) $event->card_tone,
                'cover_image' => (string) $event->cover_image,
                'calendar_added_at' => $event->calendar_added_at,
                'calendar_repeat_type' => (string) $event->calendar_repeat_type,
            ]);
            return $healed;
        }

        throw new BizException(404, '纪念日不存在');
    }

    private function findEvent(int $eventId): AnniversaryEvent
    {
        /** @var null|AnniversaryEvent $event */
        $event = AnniversaryEvent::query()->where('id', $eventId)->first();
        if ($event === null) {
            throw new BizException(404, '纪念日不存在');
        }
        return $event;
    }

    private function memberCount(int $eventId): int
    {
        return (int) AnniversaryMember::query()
            ->where('anniversary_event_id', $eventId)
            ->count();
    }

    private function findPendingInvite(string $code): AnniversaryInvite
    {
        $code = strtolower(trim($code));
        if (! preg_match('/^[a-f0-9]{8}$/', $code)) {
            throw new BizException(404, '邀请已失效或过期');
        }

        /** @var null|AnniversaryInvite $invite */
        $invite = AnniversaryInvite::query()->where('code', $code)->first();
        if ($invite === null) {
            throw new BizException(404, '邀请已失效或过期');
        }
        if ($invite->status !== 'pending' || Carbon::now()->gte(Carbon::parse((string) $invite->expires_at))) {
            if ($invite->status === 'pending') {
                $this->expireInvite($invite);
            }
            throw new BizException(404, '邀请已失效或过期');
        }
        return $invite;
    }

    private function expireInvite(AnniversaryInvite $invite): void
    {
        $invite->status = 'expired';
        $invite->updated_at = date('Y-m-d H:i:s');
        $invite->save();
    }

    private function newInviteCode(): string
    {
        for ($i = 0; $i < 8; $i++) {
            $code = bin2hex(random_bytes(4));
            if (! AnniversaryInvite::query()->where('code', $code)->exists()) {
                return $code;
            }
        }
        throw new BizException(500, '邀请码生成失败，请重试');
    }

    /**
     * 公共字段规范化（不含个人偏好）。
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizePublic(array $payload): array
    {
        $title = mb_substr(trim((string) ($payload['title'] ?? '')), 0, 80);
        if ($title === '') {
            throw new BizException(422, '纪念日标题不能为空');
        }

        $eventDate = $this->normalizeDate((string) ($payload['eventDate'] ?? $payload['event_date'] ?? ''));
        $sceneType = $this->oneOf((string) ($payload['sceneType'] ?? $payload['scene_type'] ?? 'custom'), self::SCENE_TYPES, 'custom');
        $calendarType = $this->oneOf((string) ($payload['calendarType'] ?? $payload['calendar_type'] ?? 'solar'), self::CALENDAR_TYPES, 'solar');
        $repeatType = $this->oneOf((string) ($payload['repeatType'] ?? $payload['repeat_type'] ?? 'none'), self::REPEAT_TYPES, 'none');
        $countMode = $this->oneOf((string) ($payload['countMode'] ?? $payload['count_mode'] ?? 'countdown'), self::COUNT_MODES, 'countdown');

        $lunarYear = $this->nullableInt($payload['lunarYear'] ?? $payload['lunar_year'] ?? null);
        $lunarMonth = $this->nullableInt($payload['lunarMonth'] ?? $payload['lunar_month'] ?? null);
        $lunarDay = $this->nullableInt($payload['lunarDay'] ?? $payload['lunar_day'] ?? null);
        $isLunarLeapMonth = (bool) ($payload['isLunarLeapMonth'] ?? $payload['is_lunar_leap_month'] ?? false);
        if ($calendarType === 'lunar') {
            $eventYear = (int) substr($eventDate, 0, 4);
            $lunarYear = $lunarYear ?: $eventYear;
            if ($lunarYear < 1900 || $lunarYear > 2100 || $lunarMonth < 1 || $lunarMonth > 12 || $lunarDay < 1 || $lunarDay > 30) {
                throw new BizException(422, '农历日期不合法');
            }
        } else {
            $lunarYear = null;
            $lunarMonth = null;
            $lunarDay = null;
            $isLunarLeapMonth = false;
        }

        return [
            'title' => $title,
            'scene_type' => $sceneType,
            'event_date' => $eventDate,
            'calendar_type' => $calendarType,
            'lunar_year' => $lunarYear,
            'lunar_month' => $lunarMonth,
            'lunar_day' => $lunarDay,
            'is_lunar_leap_month' => $isLunarLeapMonth,
            'repeat_type' => $repeatType,
            'count_mode' => $countMode,
        ];
    }

    /**
     * 个人偏好规范化：优先读 myPrefs 嵌套，回退旧 flat 顶层键；
     * 只返回 payload 里实际出现过的键（部分更新）。
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizeMyPrefs(array $payload, ?AnniversaryMember $current): array
    {
        $prefs = [];
        if (is_array($payload['myPrefs'] ?? null)) {
            $prefs = $payload['myPrefs'];
        }

        $pick = static function (string $camel, string $snake) use ($payload, $prefs): mixed {
            if (array_key_exists($camel, $prefs) || array_key_exists($snake, $prefs)) {
                return $prefs[$camel] ?? $prefs[$snake];
            }
            if (array_key_exists($camel, $payload) || array_key_exists($snake, $payload)) {
                return $payload[$camel] ?? $payload[$snake];
            }
            return null;
        };

        $result = [];

        $remindDaysBefore = $pick('remindDaysBefore', 'remind_days_before');
        if ($remindDaysBefore !== null) {
            $remindDaysBefore = (int) $remindDaysBefore;
            $result['remind_days_before'] = in_array($remindDaysBefore, self::REMIND_DAYS, true)
                ? $remindDaysBefore
                : (int) ($current->remind_days_before ?? 1);
        }

        $remindTime = $pick('remindTime', 'remind_time');
        if ($remindTime !== null) {
            $remindTime = trim((string) $remindTime);
            $result['remind_time'] = preg_match('/^\d{2}:\d{2}$/', $remindTime)
                ? $remindTime
                : (string) ($current->remind_time ?? '09:00');
        }

        $coverImage = $pick('coverImage', 'cover_image');
        if ($coverImage !== null) {
            $result['cover_image'] = mb_substr(trim((string) $coverImage), 0, 600);
        }

        $cardTemplate = $pick('cardTemplate', 'card_template');
        if ($cardTemplate !== null) {
            $result['card_template'] = $this->oneOf((string) $cardTemplate, self::CARD_TEMPLATES, $current->card_template ?? 'minimal');
        }

        $cardTone = $pick('cardTone', 'card_tone');
        if ($cardTone !== null) {
            $result['card_tone'] = $this->oneOf((string) $cardTone, self::CARD_TONES, $current->card_tone ?? 'warm');
        }

        return $result;
    }

    private function normalizeDate(string $date): string
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw new BizException(422, '日期格式不正确');
        }
        [$year, $month, $day] = array_map('intval', explode('-', $date));
        if ($year < 1900 || $year > 2100 || ! checkdate($month, $day, $year)) {
            throw new BizException(422, '日期不合法');
        }
        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /**
     * @param array<int, string> $allowed
     */
    private function oneOf(string $value, array $allowed, string $fallback): string
    {
        return in_array($value, $allowed, true) ? $value : $fallback;
    }

    private function nullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        return (int) $value;
    }

    /**
     * 按请求者合并输出：公共字段 + 我的偏好（无成员行时回退事件旧列）+ 共享元信息。
     *
     * @return array<string, mixed>
     */
    private function format(AnniversaryEvent $event, ?AnniversaryMember $member = null, int $memberCount = 1): array
    {
        return [
            'id' => (int) $event->id,
            'title' => (string) $event->title,
            'sceneType' => (string) $event->scene_type,
            'eventDate' => (string) $event->event_date,
            'calendarType' => (string) $event->calendar_type,
            'lunarYear' => $event->lunar_year === null ? null : (int) $event->lunar_year,
            'lunarMonth' => $event->lunar_month === null ? null : (int) $event->lunar_month,
            'lunarDay' => $event->lunar_day === null ? null : (int) $event->lunar_day,
            'isLunarLeapMonth' => (bool) $event->is_lunar_leap_month,
            'repeatType' => (string) $event->repeat_type,
            'countMode' => (string) $event->count_mode,
            'remindDaysBefore' => (int) ($member->remind_days_before ?? $event->remind_days_before),
            'remindTime' => (string) ($member->remind_time ?? '09:00'),
            'calendarAddedAt' => ($member->calendar_added_at ?? $event->calendar_added_at) === null ? '' : (string) ($member->calendar_added_at ?? $event->calendar_added_at),
            'calendarRepeatType' => (string) ($member->calendar_repeat_type ?? $event->calendar_repeat_type ?? ''),
            'coverImage' => (string) ($member->cover_image ?? $event->cover_image),
            'cardTemplate' => (string) ($member->card_template ?? $event->card_template),
            'cardTone' => (string) ($member->card_tone ?? $event->card_tone),
            'sortOrder' => (int) $event->sort_order,
            'role' => (string) ($member->role ?? 'viewer'),
            'ownerId' => (int) $event->user_id,
            'shared' => $memberCount > 1,
            'memberCount' => $memberCount,
            'createdAt' => (string) $event->created_at,
            'updatedAt' => (string) $event->updated_at,
        ];
    }

    /** 解析提醒日期：有前端预计算值则直接使用，否则走后端估算（公历事件可用，农历事件会偏）。 */
    private function resolveReminderDate(AnniversaryEvent $event, AnniversarySubscription $sub, int $daysBefore): ?Carbon
    {
        if ($sub->next_occurrence_date !== null) {
            // 前端预计算值，农历事件准确
            return Carbon::parse((string) $sub->next_occurrence_date)->startOfDay()->subDays($daysBefore);
        }

        // 回退到后端估算
        return $this->nextReminderDate($event, $daysBefore);
    }

    /**
     * 列表排序键，与前端 sortAnniversaryEvents 对齐：
     * 桶 0 今年未到、1 跨年、2 已过；同桶剩余天数大的在前（由远到近 / 刚过去的在前）。
     *
     * @return array{0: int, 1: int, 2: int, 3: int}
     */
    private function listSortKey(AnniversaryEvent $event): array
    {
        $today = Carbon::today();
        $date = Carbon::parse((string) $event->event_date)->startOfDay();
        $next = $event->repeat_type === 'yearly'
            ? $this->nextYearlyOccurrence($date, $today)
            : $date;
        $days = (int) $today->diffInDays($next, false);
        $bucket = $days < 0 ? 2 : ((int) $next->year > (int) $today->year ? 1 : 0);

        return [$bucket, -$days, (int) $event->sort_order, (int) $event->id];
    }

    /** 下一次年度发生日（今年已过则取明年；2 月 29 日非闰年由 Carbon 滚动处理）。 */
    private function nextYearlyOccurrence(Carbon $date, Carbon $today): Carbon
    {
        $thisYear = Carbon::create($today->year, $date->month, $date->day)->startOfDay();
        if ($thisYear->lt($today)) {
            $thisYear = Carbon::create($today->year + 1, $date->month, $date->day)->startOfDay();
        }
        return $thisYear;
    }

    /** 计算纪念日下一次提醒日期（考虑提前提醒天数）。非农历事件可用，农历会偏差。 */
    private function nextReminderDate(AnniversaryEvent $event, int $daysBefore): ?Carbon
    {
        $eventDate = Carbon::parse((string) $event->event_date)->startOfDay();
        $today = Carbon::today();

        if ($event->repeat_type === 'yearly') {
            return $this->nextYearlyOccurrence($eventDate, $today)->subDays($daysBefore)->startOfDay();
        }

        // 不重复：如果 eventDate 已过就不再提醒
        if ($eventDate->lt($today)) {
            return null;
        }

        return $eventDate->subDays($daysBefore)->startOfDay();
    }

    /**
     * 构造订阅消息的 data 字段。
     * 模板「待办事项提醒」(Jy26nV...) 字段：
     *   thing4  事项描述（thing 类型，≤20 字）
     *   time2   事项时间（time 类型，需 Y-m-d H:i:s）
     *   thing12 备注消息（thing 类型，≤20 字）
     *
     * @param string $occurrenceDate 本次纪念日实际发生日期（Y-m-d）
     */
    private function buildReminderData(AnniversaryEvent $event, string $occurrenceDate): array
    {
        $title = (string) $event->title;

        // 文案按"今天到纪念日的实际剩余天数"生成，而非提前提醒天数（remind_days_before）。
        $daysLeft = max(0, Carbon::today()->diffInDays(Carbon::parse($occurrenceDate)->startOfDay(), false));

        $copy = match ((string) $event->scene_type) {
            'travel' => '把期待装进口袋，' . ($daysLeft > 0 ? "{$daysLeft} 天后出发。" : '今天出发！'),
            'birthday' => $daysLeft > 0 ? "还有 {$daysLeft} 天，准备一份心意。" : '今天值得被好好记住。',
            'relationship', 'wedding' => '是时间留下的温柔记号。',
            'habit' => '每一天都算数。',
            'deadline' => $daysLeft > 0 ? "还有 {$daysLeft} 天，把节奏稳住。" : '今天就是目标日。',
            default => $daysLeft > 0 ? "还有 {$daysLeft} 天。" : '就是今天。',
        };

        // time 类型需完整时间；纪念日按全天处理。
        $eventTime = Carbon::parse($occurrenceDate)->format('Y-m-d');

        return [
            'thing4' => ['value' => mb_substr($title, 0, 20)],
            'time2' => ['value' => $eventTime],
            'thing12' => ['value' => mb_substr($copy, 0, 20)],
        ];
    }
}
