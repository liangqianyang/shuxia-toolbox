<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use App\Model\AnniversaryEvent;
use App\Model\AnniversarySubscription;
use Carbon\Carbon;

/** 纪念日工具：用户事件的云同步、校验和格式化。 */
final class AnniversaryService
{
    private const SCENE_TYPES = ['birthday', 'relationship', 'wedding', 'travel', 'deadline', 'baby', 'habit', 'custom'];
    private const CALENDAR_TYPES = ['solar', 'lunar'];
    private const REPEAT_TYPES = ['none', 'yearly'];
    private const COUNT_MODES = ['countdown', 'countup'];
    private const REMIND_DAYS = [0, 1, 3, 7, 14, 30];
    private const CARD_TEMPLATES = ['minimal', 'calendar', 'photo', 'boarding', 'certificate', 'progress', 'festival'];
    private const CARD_TONES = ['warm', 'fresh', 'classic', 'rose', 'ink'];

    public function __construct(
        private readonly WechatSubscribeMessageService $subscribeMessages,
        private readonly WechatUserService $wechatUsers,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function events(int $userId): array
    {
        return AnniversaryEvent::query()
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn(AnniversaryEvent $event): array => $this->format($event))
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function save(int $userId, array $payload): array
    {
        $id = (int) ($payload['id'] ?? 0);
        $data = $this->normalize($payload);

        if ($id > 0) {
            /** @var null|AnniversaryEvent $event */
            $event = AnniversaryEvent::query()
                ->where('user_id', $userId)
                ->where('id', $id)
                ->first();
            if ($event === null) {
                throw new BizException(404, '纪念日不存在');
            }
            $event->fill($data);
            $event->save();
            return $this->format($event);
        }

        $maxSort = (int) AnniversaryEvent::query()->where('user_id', $userId)->max('sort_order');
        /** @var AnniversaryEvent $event */
        $event = AnniversaryEvent::query()->create([
            ...$data,
            'user_id' => $userId,
            'sort_order' => $maxSort + 10,
        ]);
        return $this->format($event);
    }

    public function delete(int $userId, int $id): void
    {
        $deleted = AnniversaryEvent::query()
            ->where('user_id', $userId)
            ->where('id', $id)
            ->delete();
        if ($deleted < 1) {
            throw new BizException(404, '纪念日不存在');
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function markCalendarAdded(int $userId, int $id, string $repeatType): array
    {
        /** @var null|AnniversaryEvent $event */
        $event = AnniversaryEvent::query()
            ->where('user_id', $userId)
            ->where('id', $id)
            ->first();
        if ($event === null) {
            throw new BizException(404, '纪念日不存在');
        }
        $event->calendar_added_at = Carbon::now()->format('Y-m-d H:i:s');
        $event->calendar_repeat_type = in_array($repeatType, self::REPEAT_TYPES, true) ? $repeatType : 'none';
        $event->save();
        return $this->format($event);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalize(array $payload): array
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
        $remindDaysBefore = (int) ($payload['remindDaysBefore'] ?? $payload['remind_days_before'] ?? 1);
        if (! in_array($remindDaysBefore, self::REMIND_DAYS, true)) {
            $remindDaysBefore = 1;
        }

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
            'remind_days_before' => $remindDaysBefore,
            'cover_image' => mb_substr(trim((string) ($payload['coverImage'] ?? $payload['cover_image'] ?? '')), 0, 600),
            'card_template' => $this->oneOf((string) ($payload['cardTemplate'] ?? $payload['card_template'] ?? 'minimal'), self::CARD_TEMPLATES, 'minimal'),
            'card_tone' => $this->oneOf((string) ($payload['cardTone'] ?? $payload['card_tone'] ?? 'warm'), self::CARD_TONES, 'warm'),
        ];
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
     * @return array<string, mixed>
     */
    private function format(AnniversaryEvent $event): array
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
            'remindDaysBefore' => (int) $event->remind_days_before,
            'calendarAddedAt' => $event->calendar_added_at === null ? '' : (string) $event->calendar_added_at,
            'calendarRepeatType' => (string) $event->calendar_repeat_type,
            'coverImage' => (string) $event->cover_image,
            'cardTemplate' => (string) $event->card_template,
            'cardTone' => (string) $event->card_tone,
            'sortOrder' => (int) $event->sort_order,
            'createdAt' => (string) $event->created_at,
            'updatedAt' => (string) $event->updated_at,
        ];
    }

    /** 记录一次订阅消息授权。 */
    public function subscribe(int $userId, int $eventId, string $templateId, string $nextOccurrenceDate = ''): void
    {
        $event = AnniversaryEvent::query()
            ->where('user_id', $userId)
            ->where('id', $eventId)
            ->first();
        if ($event === null) {
            throw new BizException(404, '纪念日不存在');
        }

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

    /** 定时任务：扫描待发送的订阅，到期则推送微信消息。 */
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

            // 计算下一个提醒日期：优先使用前端预计算的准确日期（处理农历年变）
            $reminderDate = $this->resolveReminderDate($event, $sub);
            if ($reminderDate === null || $today->lt($reminderDate)) {
                continue; // 还没到提醒日
            }

            // 获取用户 openid
            $user = $this->wechatUsers->findUser((int) $sub->user_id);
            if ($user === null) {
                $errors[] = "subscription#{$sub->id}: 用户不存在";
                continue;
            }

            // 构造消息内容
            $templateId = (string) $sub->template_id;
            $data = $this->buildReminderData($event);
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

    /** 解析提醒日期：有前端预计算值则直接使用，否则走后端估算（公历事件可用，农历事件会偏）。 */
    private function resolveReminderDate(AnniversaryEvent $event, AnniversarySubscription $sub): ?Carbon
    {
        $daysBefore = (int) $event->remind_days_before;

        if ($sub->next_occurrence_date !== null) {
            // 前端预计算值，农历事件准确
            return Carbon::parse((string) $sub->next_occurrence_date)->startOfDay()->subDays($daysBefore);
        }

        // 回退到后端估算
        return $this->nextReminderDate($event);
    }

    /** 计算纪念日下一次提醒日期（考虑提前提醒天数）。非农历事件可用，农历会偏差。 */
    private function nextReminderDate(AnniversaryEvent $event): ?Carbon
    {
        $daysBefore = (int) $event->remind_days_before;
        $eventDate = Carbon::parse((string) $event->event_date)->startOfDay();
        $today = Carbon::today();

        if ($event->repeat_type === 'yearly') {
            // 今年的纪念日
            $thisYear = Carbon::create($today->year, $eventDate->month, $eventDate->day)->startOfDay();
            if ($thisYear->lt($today)) {
                $thisYear = Carbon::create($today->year + 1, $eventDate->month, $eventDate->day)->startOfDay();
            }
            return $thisYear->subDays($daysBefore)->startOfDay();
        }

        // 不重复：如果 eventDate 已过就不再提醒
        if ($eventDate->lt($today)) {
            return null;
        }

        return $eventDate->subDays($daysBefore)->startOfDay();
    }

    /** 构造订阅消息的 data 字段。 */
    private function buildReminderData(AnniversaryEvent $event): array
    {
        $daysBefore = (int) $event->remind_days_before;
        $eventDate = (string) $event->event_date;
        $title = (string) $event->title;

        $copy = match ((string) $event->scene_type) {
            'travel' => '把期待装进口袋，' . ($daysBefore > 0 ? "{$daysBefore} 天后出发。" : '今天出发！'),
            'birthday' => $daysBefore > 0 ? "还有 {$daysBefore} 天，准备一份心意。" : '今天值得被好好记住。',
            'relationship', 'wedding' => '是时间留下的温柔记号。',
            'habit' => '每一天都算数。',
            'deadline' => $daysBefore > 0 ? "还有 {$daysBefore} 天，把节奏稳住。" : '今天就是目标日。',
            default => $daysBefore > 0 ? "还有 {$daysBefore} 天。" : '就是今天。',
        };

        return [
            'thing1' => ['value' => mb_substr($title, 0, 20)],
            'date2' => ['value' => str_replace('-', '.', $eventDate)],
            'thing3' => ['value' => mb_substr($copy, 0, 20)],
        ];
    }
}
