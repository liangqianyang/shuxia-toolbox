<?php

declare(strict_types=1);

namespace App\Service\Adventure;

use App\Exception\BizException;
use App\Model\AdventureRoom;
use App\Service\FeatureFlagService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use Hyperf\DbConnection\Db;
use RuntimeException;

/**
 * 枫趣冒险联机房间：服务端权威，完整对局快照存 MySQL（重启不丢局，saved 可跨天续局）。
 *
 * 所有写操作走事务 + 行锁；提交后经 AdventureWsPusher 按请求者视角广播（有隐藏信息：
 * 道具手牌/埋伏归属/决斗暗出，serialize 视角裁剪）。
 *
 * 回合是一个可暂停的流水线：act（掷骰 20s）→ resolve（道具+确认 10s）→ 位移机关链 →
 * 选择窗（岔路/埋伏/商店/山神/擂台 8s）→ 决斗窗（10s）→ 推进。任何窗口到期由两层机制推进——
 * 1) 写操作前懒检查 applyDueTimeoutIfNeeded（带请求者放行，防活跃玩家 422 软锁）；
 * 2) AdventureTurnSweepListener 每秒清扫（WS 模式下客户端不轮询）。
 *
 * 单一 deadline 列复用所有窗口（nextDeadline 按 pending 状态取时长）。
 *
 * 存档：status=saved 时清扫器跳过、deadline 清空、所有窗口暂停；续局时 deadline 重置满额。
 * 全员离线守卫：清扫器推进到期回合前若房内零人在线 → 自动转 saved，绝不让托管通宵自走。
 */
final class AdventureRoomService
{
    /** 房间闲置多久（秒）后懒清理（waiting/finished；saved 由 7 天过期管）。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 掷骰阶段时限（秒）。 */
    public const int TURN_SECONDS = 20;

    /** 掷骰后道具+确认窗口（秒）。 */
    public const int RESOLVE_SECONDS = 10;

    /** 选择窗（岔路/埋伏/商店/山神/擂台）时限（秒）。 */
    public const int CHOICE_SECONDS = 8;

    /** 决斗（选人/出招/暗标）时限（秒）。 */
    public const int DUEL_SECONDS = 10;

    /** 连续超时多少次进入挂机（挂机阶段 5s 自动，任何真实操作解除）。 */
    public const int IDLE_LIMIT = 3;

    /** 挂机阶段时限（秒）。 */
    private const int IDLE_TURN_SECONDS = 5;

    /** drainAuto 单次最多执行的回合数（bug 兜底）。 */
    private const int AUTO_TURN_CAP = 24;

    /** state.events 环形数组保留条数。 */
    public const int EVENTS_KEEP = 16;

    /** 其他玩家全部离线超过多久（秒）判最后在线者获胜（last_man）。 */
    private const int OFFLINE_FORFEIT_SECONDS = 120;

    /** saved 房过期天数。 */
    private const int SAVED_EXPIRE_SECONDS = 7 * 86400;

    /** 房主失联多久（秒）后任意成员可续局。 */
    private const int RESUME_HOST_MIA_SECONDS = 3 * 86400;

    /** 聊天冷却（秒）/ 环形保留条数。 */
    private const int CHAT_COOLDOWN_SECONDS = 3;

    public const int CHAT_KEEP = 50;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly AdventureWsPusher $pusher,
        private readonly FeatureFlagService $flags,
        private readonly WechatContentSecurityService $security,
    ) {}

    // ---------------------------------------------------------------- 房间基础

    /**
     * 创建房间：创建者坐 0 号位（房主）。
     *
     * @return array<string, mixed>
     */
    public function create(int $userId): array
    {
        AdventureRoom::query()->where('status', '!=', 'saved')
            ->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new AdventureRoom();
            $room->code = $this->newCode();
            $room->status = 'waiting';
            $room->seats = [$userId];
            $room->state = ['scores' => [(string) $userId => 0]];
            $room->version = 1;
            $room->seen_at = [(string) $userId => date('Y-m-d H:i:s')];
            $room->save();
            return $room;
        });

        return $this->serialize($room, $userId);
    }

    /**
     * 加入房间：本人重进幂等；等待中且未满 6 人入座；满员/已开局为旁观者。
     *
     * @return array<string, mixed>
     */
    public function join(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($this->seatOf($room->seats, $userId) !== null) {
                $this->touchSeenAt($room, $userId);
                return $room;
            }
            if ($room->status === 'waiting' && count($room->seats) < AdventureRule::MAX_PLAYERS) {
                $seats = $room->seats;
                $seats[] = $userId;
                $room->seats = $seats;
                $state = $room->state;
                $state['scores'][(string) $userId] = 0;
                $room->state = $state;
                $this->touchSeenAt($room, $userId);
                $room->version++;
                $room->save();
            }
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 开局：仅房主，2-6 人。天气牌库洗好、预报公开、先手随机。
     *
     * @return array<string, mixed>
     */
    public function start(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($this->seatOf($room->seats, $userId) !== 0) {
                throw new BizException(403, '只有房主能开局');
            }
            if ($room->status !== 'waiting') {
                throw new BizException(422, '本局已开始');
            }
            $count = count($room->seats);
            if ($count < 2 || $count > AdventureRule::MAX_PLAYERS) {
                throw new BizException(422, '2-6 人才能开局');
            }
            $old = $room->state;
            $state = AdventureRule::setupGame($room->seats);
            foreach ($room->seats as $uid) {
                $state['scores'][(string) $uid] = (int) ($old['scores'][(string) $uid] ?? 0);
            }
            $state = $this->carryChat($old, $state);
            $state = $this->pushEvent($state, ['t' => 'start', 'seat' => (int) $state['currentSeat']]);
            $room->state = $state;
            $room->status = 'playing';
            $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 读取房间状态（轮询同步用）。since 已是最新时只回 {changed:false}。
     *
     * @return array<string, mixed>
     */
    public function state(string $code, int $userId, int $since): array
    {
        $room = $this->findActive($code);
        $this->touchSeenAt($room, $userId);
        if ($since >= $room->version) {
            return ['changed' => false, 'version' => $room->version];
        }
        return ['changed' => true] + $this->serialize($room, $userId);
    }

    /**
     * 我的对局（重连/续局入口）：在座且未关闭的最近房间。
     *
     * @return array<int, array<string, mixed>>
     */
    public function myRooms(int $userId): array
    {
        $rooms = AdventureRoom::query()
            ->whereRaw('JSON_CONTAINS(seats, ?)', [json_encode($userId)])
            ->whereIn('status', ['waiting', 'playing', 'saved'])
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();
        $out = [];
        foreach ($rooms as $room) {
            $out[] = [
                'code' => (string) $room->code,
                'status' => (string) $room->status,
                'playerCount' => count($room->seats ?? []),
                'updatedAt' => (string) $room->updated_at,
            ];
        }
        return $out;
    }

    // ---------------------------------------------------------------- 回合动作

    /**
     * 掷骰：act 阶段专属。双骰之和同点（双骰同点）额外 +2 枚枫叶。
     *
     * @return array<string, mixed>
     */
    public function roll(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state] = $this->requireMyPhase($room, $userId, 'act');

            $dice = [random_int(1, 6), random_int(1, 6)];
            $state['roll'] = $dice;
            $state['phase'] = 'resolve';
            $state['idleStrikes'][(string) $userId] = 0;
            $state = $this->pushEvent($state, ['t' => 'roll', 'seat' => $seat, 'v' => $dice]);
            if ($dice[0] === $dice[1]) {
                $uid = (string) $userId;
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 2;
                $state = $this->pushEvent($state, ['t' => 'doubles', 'seat' => $seat]);
            }

            $room->state = $state;
            $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 打道具：resolve 窗口内（登山镐/大风咒/雪球/换位斗篷/缆车票）或自己回合任意阶段
     * （滑雪板/枫叶袋/改天换地）。大雾天气全禁。
     *
     * @return array<string, mixed>
     */
    public function playItem(string $code, int $userId, string $itemId, ?int $targetSeat): array
    {
        $room = Db::transaction(function () use ($code, $userId, $itemId, $targetSeat) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            $seat = $this->requireMyTurn($room, $userId);
            $state = $room->state;
            $seats = $room->seats;

            $def = AdventureBoard::ITEMS[$itemId] ?? null;
            if ($def === null) {
                throw new BizException(422, '道具不存在');
            }
            if (AdventureRule::weatherActive($state, 'fog')) {
                throw new BizException(422, '大雾弥漫，本轮不能用道具');
            }
            if ($def['when'] === 'resolve' && (string) $state['phase'] !== 'resolve') {
                throw new BizException(422, '这个道具要在掷骰之后使用');
            }
            $uid = (string) $userId;
            $hand = $state['items'][$uid] ?? [];
            if (! in_array($itemId, $hand, true)) {
                throw new BizException(422, '你没有这张道具');
            }
            if ($itemId === 'cablecar') {
                if (AdventureRule::weatherActive($state, 'cablehalt')) {
                    throw new BizException(422, '缆车停运中，缆车票用不了');
                }
                $ahead = false;
                foreach (AdventureBoard::CABLE_STATIONS as $station) {
                    if ($station > (int) $state['positions'][$seat]) {
                        $ahead = true;
                        break;
                    }
                }
                if (! $ahead) {
                    throw new BizException(422, '前方已经没有缆车站了');
                }
            }
            if ($def['target']) {
                if ($targetSeat === null || $targetSeat < 0 || $targetSeat >= count($seats)
                    || $targetSeat === $seat || AdventureRule::seatInactive($state, (int) $targetSeat)) {
                    throw new BizException(422, '道具目标不正确');
                }
            }

            $state['idleStrikes'][$uid] = 0;
            $events = AdventureRule::applyItem($state, $seats, $seat, $itemId, $def['target'] ? (int) $targetSeat : null);
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }

            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 确认走子：resolve 阶段专属。位移 → 机关链 → 选择窗/决斗 → 推进。
     *
     * @return array<string, mixed>
     */
    public function move(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state] = $this->requireMyPhase($room, $userId, 'resolve');

            $state['idleStrikes'][(string) $userId] = 0;
            $state['turnCtx'] = ['seat' => $seat, 'duelDone' => false];
            $steps = AdventureRule::computeMoveSteps($state, $seat);
            $events = AdventureRule::applyDisplacement($state, $room->seats, $seat, $steps, 'dice');
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }
            $this->continueTurn($room, $state);

            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 选择窗提交：岔路 key / 埋伏 yes-no / 商店 yes-no / 山神奖励 / 擂台目标座位。
     *
     * @return array<string, mixed>
     */
    public function choose(string $code, int $userId, string $value): array
    {
        $room = Db::transaction(function () use ($code, $userId, $value) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state, $choice] = $this->requireMyChoice($room, $userId);
            $seats = $room->seats;

            switch ((string) $choice['kind']) {
                case 'fork':
                    $cell = AdventureBoard::cell((int) $choice['cell']);
                    $valid = false;
                    foreach (($cell['options'] ?? []) as $opt) {
                        if ((string) $opt['key'] === $value) {
                            $valid = true;
                            break;
                        }
                    }
                    if (! $valid) {
                        throw new BizException(422, '岔路选项不正确');
                    }
                    break;
                case 'ambush':
                case 'shop':
                    if (! in_array($value, ['yes', 'no'], true)) {
                        throw new BizException(422, '选项不正确');
                    }
                    break;
                case 'shrine':
                    if (! in_array($value, ['forward', 'item', 'leaves'], true)) {
                        throw new BizException(422, '山神奖励选项不正确');
                    }
                    break;
                case 'arena':
                    if (! in_array((int) $value, AdventureRule::arenaCandidates($state, $seats, $seat), true)) {
                        throw new BizException(422, '挑战目标不正确');
                    }
                    break;
            }

            $state['idleStrikes'][(string) $userId] = 0;
            $events = AdventureRule::applyChoice($state, $seats, $seat, $value);
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }
            if ($state['pendingDuel'] !== null) {
                // 擂台：决斗窗开启，等待双方
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            } else {
                $this->continueTurn($room, $state);
            }

            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 决斗输入：选人阶段（挑战者）选对手；出招阶段出拳（r/p/s）或暗标（0..min(5,枫叶)）。
     *
     * @return array<string, mixed>
     */
    public function duel(string $code, int $userId, mixed $value): array
    {
        $room = Db::transaction(function () use ($code, $userId, $value) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $seats = $room->seats;
            $duel = $state['pendingDuel'] ?? null;
            if ($duel === null) {
                throw new BizException(422, '现在没有进行中的决斗');
            }
            if ((int) $duel['a'] !== $seat && (int) ($duel['b'] ?? -1) !== $seat) {
                throw new BizException(422, '你不是这场决斗的参与者');
            }

            if (($duel['phase'] ?? '') === 'pick') {
                if ((int) $duel['a'] !== $seat) {
                    throw new BizException(422, '由挑战者选择对手');
                }
                if (! in_array((int) $value, AdventureRule::duelCandidates($state, $seats, $seat), true)) {
                    throw new BizException(422, '对手不在这格');
                }
                $input = (int) $value;
            } elseif ((string) $duel['format'] === 'rps') {
                $map = ['r' => 0, 'p' => 1, 's' => 2];
                if (! is_string($value) || ! isset($map[$value])) {
                    throw new BizException(422, '出拳不正确');
                }
                $input = $map[$value];
            } else { // bid
                if (! is_numeric($value) || (int) $value < 0) {
                    throw new BizException(422, '暗标不正确');
                }
                $input = min((int) $value, 5, (int) ($state['leaves'][(string) $userId] ?? 0));
            }

            $state['idleStrikes'][(string) $userId] = 0;
            $events = AdventureRule::submitDuelInput($state, $seats, $seat, $input);
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }
            if ($state['pendingDuel'] === null) {
                $this->continueTurn($room, $state);
            } else {
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            }

            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 决斗押注：非参战在座玩家花 1 枫叶押某一方，押中返还 3。
     *
     * @return array<string, mixed>
     */
    public function bet(string $code, int $userId, int $onSeat): array
    {
        $room = Db::transaction(function () use ($code, $userId, $onSeat) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $seats = $room->seats;
            $duel = $state['pendingDuel'] ?? null;
            if ($duel === null) {
                throw new BizException(422, '现在没有可以押注的决斗');
            }
            if (AdventureRule::seatInactive($state, $seat)) {
                throw new BizException(422, '你已离开或登顶，不能押注');
            }
            if ((int) $duel['a'] === $seat || (int) ($duel['b'] ?? -1) === $seat) {
                throw new BizException(422, '决斗参与者不能押注');
            }
            foreach (($duel['bets'] ?? []) as $bet) {
                if ((int) $bet['uid'] === $userId) {
                    throw new BizException(422, '每场决斗只能押一注');
                }
            }
            if ((int) $duel['a'] !== $onSeat && (int) ($duel['b'] ?? -1) !== $onSeat) {
                throw new BizException(422, '押注目标不正确');
            }
            $uid = (string) $userId;
            if ((int) ($state['leaves'][$uid] ?? 0) < AdventureRule::BET_STAKE) {
                throw new BizException(422, '枫叶不够押注');
            }

            $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) - AdventureRule::BET_STAKE;
            $duel['bets'][] = ['uid' => $userId, 'seat' => $seat, 'on' => $onSeat];
            $state['pendingDuel'] = $duel;
            $state = $this->pushEvent($state, ['t' => 'bet', 'seat' => $seat, 'on' => $onSeat]);

            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 托管开关：开启后轮到本人时立即由服务端代走。
     *
     * @return array<string, mixed>
     */
    public function toggleAuto(string $code, int $userId, bool $on): array
    {
        $room = Db::transaction(function () use ($code, $userId, $on) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status === 'playing' && in_array($seat, $room->state['leftSeats'] ?? [], true)) {
                throw new BizException(403, '你已离开本局');
            }
            $state = $room->state;
            $uid = (string) $userId;
            if ($on) {
                $state['auto'][$uid] = true;
            } else {
                unset($state['auto'][$uid]);
            }
            $state = $this->pushEvent($state, ['t' => $on ? 'autoOn' : 'autoOff', 'seat' => $seat]);
            $room->state = $state;
            if ($on && $room->status === 'playing' && (int) $state['currentSeat'] === $seat) {
                $this->drainAuto($room, $state);
            }
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    // ---------------------------------------------------------------- 存档/续局

    /**
     * 房主保存对局：status=saved、冻结一切窗口（已暗出的拳保留在 state）。
     *
     * @return array<string, mixed>
     */
    public function save(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '只有进行中的对局能保存');
            }
            if ($seat !== 0) {
                throw new BizException(403, '只有房主能保存对局');
            }
            $state = $this->pushEvent($room->state, ['t' => 'save']);
            $room->state = $state;
            $room->status = 'saved';
            $room->paused_at = date('Y-m-d H:i:s');
            $room->turn_deadline_at = null;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 续局：房主（失联超 3 天则任意成员）恢复对局，所有窗口 deadline 重置满额。
     *
     * @return array<string, mixed>
     */
    public function resume(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'saved') {
                throw new BizException(422, '只有已保存的对局能继续');
            }
            $hostMia = $room->paused_at !== null
                && strtotime((string) $room->paused_at) < time() - self::RESUME_HOST_MIA_SECONDS;
            if ($seat !== 0 && ! $hostMia) {
                throw new BizException(403, '房主三天未回来前，只有房主能继续对局');
            }
            $state = $this->pushEvent($room->state, ['t' => 'resume']);
            $room->state = $state;
            $room->status = 'playing';
            $room->paused_at = null;
            $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    // ---------------------------------------------------------------- 聊天

    /**
     * 房间聊天：phrase（快捷句 id）/ emoji（表情字符）/ sticker（贴纸 id）/ text（自由文字，过审）。
     *
     * @return array<string, mixed>
     */
    public function chat(string $code, int $userId, string $kind, ?string $id, ?string $text): array
    {
        if ($kind === 'phrase') {
            $content = AdventureChat::phraseText((string) $id);
            if ($content === null) {
                throw new BizException(422, '快捷句不存在');
            }
        } elseif ($kind === 'emoji') {
            $content = (string) $id;
            if (! AdventureChat::isEmoji($content)) {
                throw new BizException(422, '表情不存在');
            }
        } elseif ($kind === 'sticker') {
            $content = (string) $id;
            if (! AdventureChat::isSticker($content)) {
                throw new BizException(422, '贴纸不存在');
            }
        } elseif ($kind === 'text') {
            $this->flags->requireAdventureChatTextEnabled();
            $content = trim((string) $text);
            $content = (string) preg_replace('/\s+/u', ' ', $content);
            if ($content === '') {
                throw new BizException(422, '消息不能为空');
            }
            if (mb_strlen($content) > AdventureChat::TEXT_MAX_LENGTH) {
                throw new BizException(422, '最多 ' . AdventureChat::TEXT_MAX_LENGTH . ' 个字');
            }
            $user = $this->users->findUser($userId);
            $openid = (string) ($user['openid'] ?? '');
            if ($openid === '') {
                throw new BizException(422, '账号信息缺失，发不出文字消息');
            }
            try {
                // fail-closed：审核接口异常时宁可拒发（事务外执行，不能持行锁等 8s 外呼）
                if (! $this->security->checkText($content, $openid)) {
                    throw new BizException(422, '消息未通过内容审核，换个说法试试');
                }
            } catch (RuntimeException) {
                throw new BizException(422, '内容审核暂时不可用，稍后再试');
            }
        } else {
            throw new BizException(422, '消息类型不正确');
        }

        $room = Db::transaction(function () use ($code, $userId, $kind, $content) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            $state = $room->state;
            $now = time();
            if ($now - (int) ($state['chatLastAt'][(string) $userId] ?? 0) < self::CHAT_COOLDOWN_SECONDS) {
                throw new BizException(422, '发太快啦，歇一下');
            }
            $chat = isset($state['chat']) && is_array($state['chat']) ? $state['chat'] : [];
            $seq = (int) ($state['chatSeq'] ?? 0) + 1;
            $chat[] = ['seq' => $seq, 'uid' => $userId, 'seat' => $seat, 'kind' => $kind, 'text' => $content, 'ts' => $now];
            if (count($chat) > self::CHAT_KEEP) {
                $chat = array_slice($chat, -self::CHAT_KEEP);
            }
            $state['chat'] = $chat;
            $state['chatSeq'] = $seq;
            $state['chatLastAt'][(string) $userId] = $now;
            $room->state = $state;
            $this->touchSeenAt($room, $userId);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    // ---------------------------------------------------------------- 再来一局/离开

    /**
     * 再来一局：终局后任一入座玩家发起；离开者不带回，胜场与聊天保留。
     *
     * @return array<string, mixed>
     */
    public function rematch(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->requireSeated($room, $userId);
            if ($room->status !== 'finished') {
                throw new BizException(422, '对局结束后才能再来一局');
            }
            $old = $room->state;
            $left = $old['leftSeats'] ?? [];
            $seats = [];
            foreach ($room->seats as $i => $uid) {
                if (! in_array($i, $left, true)) {
                    $seats[] = $uid;
                }
            }
            if (count($seats) < 2) {
                throw new BizException(422, '至少 2 人才能再来一局');
            }
            $state = AdventureRule::resetForRematch($old, array_values($seats));
            $state = $this->carryChat($old, $state);
            $state = $this->pushEvent($state, ['t' => 'start', 'seat' => (int) $state['currentSeat'], 'v' => 'rematch']);
            $room->seats = array_values($seats);
            $room->state = $state;
            $room->status = 'playing';
            $room->winner_user_id = null;
            $room->win_reason = null;
            $room->paused_at = null;
            $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待中移出座位（空房关闭）；对局中快照进度并标记离开（排名恒在存活者之后）；
     * 恰好剩 2 人则逃跑判负终局。离开者持有的悬挂窗口（决斗/选择）就地清理。
     *
     * @return array<string, mixed>
     */
    public function leave(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $seat = $this->seatOf($room->seats, $userId);
            if ($seat === null || $room->status === 'finished' || $room->status === 'closed') {
                return $room;
            }
            $state = $room->state;
            $seats = $room->seats;

            if ($room->status === 'waiting') {
                unset($seats[$seat]);
                $seats = array_values($seats);
                if ($seats === []) {
                    $room->status = 'closed';
                } else {
                    $room->seats = $seats;
                }
            } elseif (in_array($seat, $state['leftSeats'] ?? [], true)) {
                return $room; // 已离开过，幂等
            } else {
                $state['leftSeats'][] = $seat;
                $state['leftProgress'][$seat] = (int) ($state['positions'][$seat] ?? 0);
                unset($state['auto'][(string) $userId]);
                $state = $this->pushEvent($state, ['t' => 'leave', 'seat' => $seat]);

                // 清理离开者持有的悬挂窗口：选择窗直接丢弃；决斗选人阶段取消、出招阶段随机代出
                if (($state['pendingChoice']['seat'] ?? null) === $seat) {
                    $state['pendingChoice'] = null;
                }
                if (($state['pendingDuel'] ?? null) !== null) {
                    $duel = $state['pendingDuel'];
                    if ((int) $duel['a'] === $seat && ($duel['phase'] ?? '') === 'pick') {
                        $state['pendingDuel'] = null;
                    } elseif ((int) $duel['a'] === $seat || (int) ($duel['b'] ?? -1) === $seat) {
                        $other = (int) $duel['a'] === $seat ? (int) $duel['b'] : (int) $duel['a'];
                        $input = (string) $duel['format'] === 'rps' ? random_int(0, 2) : random_int(0, 3);
                        $events = AdventureRule::submitDuelInput($state, $seats, $seat, $input);
                        foreach ($events as $event) {
                            $state = $this->pushEvent($state, $event);
                        }
                        unset($other); // 结算事件已携带双方
                    }
                }

                $activeCount = count($seats) - count($state['leftSeats'] ?? []);
                if ($activeCount <= 1) {
                    $room->state = $state;
                    $this->finishGame($room, $state, 'forfeit');
                } elseif ((int) $state['currentSeat'] === $seat || (int) ($state['turnCtx']['seat'] ?? $seat) === $seat) {
                    // 我的回合/我的回合途中离开：直接推进（不补掷）
                    $state['phase'] = 'act';
                    $state['roll'] = null;
                    $state['turnBonus'] = 0;
                    $state['turnCtx'] = null;
                    $events = AdventureRule::advanceTurn($state, $seats);
                    foreach ($events as $event) {
                        $state = $this->pushEvent($state, $event);
                    }
                    if (AdventureRule::isGameOver($state, $seats)) {
                        $this->finishGame($room, $state, 'finish');
                    } else {
                        $this->afterAdvance($room, $state);
                    }
                } elseif (($state['pendingChoice'] ?? null) !== null || ($state['pendingDuel'] ?? null) !== null) {
                    // 窗口还在（属于别人）：保持等待，刷新 deadline
                    $room->turn_deadline_at = $this->nextDeadline($state, $seats);
                }
                $room->state = $state;
            }
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    // ---------------------------------------------------------------- 清扫（Timer 入口）

    /**
     * 到期房间推进。全员离线守卫：房内零人在线时自动转 saved（绝不让托管通宵自走）。
     */
    public function sweepDueRooms(): int
    {
        $codes = AdventureRoom::query()
            ->where('status', 'playing')
            ->whereNotNull('turn_deadline_at')
            ->where('turn_deadline_at', '<=', date('Y-m-d H:i:s'))
            ->limit(50)
            ->pluck('code');
        $swept = 0;
        foreach ($codes as $code) {
            $room = Db::transaction(function () use ($code) {
                $room = $this->lockByCode((string) $code);
                if ($room->status !== 'playing' || $room->turn_deadline_at === null
                    || strtotime((string) $room->turn_deadline_at) > time()) {
                    return null;
                }
                if (! $this->anyoneOnline($room)) {
                    // 全员离线守卫：自动存档（区别于房主手动保存，事件带 auto 标记）
                    $state = $this->pushEvent($room->state, ['t' => 'save', 'v' => 'auto']);
                    $room->state = $state;
                    $room->status = 'saved';
                    $room->paused_at = date('Y-m-d H:i:s');
                    $room->turn_deadline_at = null;
                    $room->version++;
                    $room->save();
                    return null;
                }
                if (! $this->applyDueTimeoutIfNeeded($room)) {
                    return null;
                }
                $room->version++;
                $room->save();
                return $room;
            });
            if ($room instanceof AdventureRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * 「只剩一人在线」的进行中对局判 last_man（其他人划走没点离开的场景）。
     */
    public function sweepLonelyRooms(): int
    {
        $rooms = AdventureRoom::query()->where('status', 'playing')->limit(50)->get();
        $ended = 0;
        foreach ($rooms as $room) {
            $changed = Db::transaction(function () use ($room) {
                $room = $this->lockByCode((string) $room->code);
                if ($room->status !== 'playing') {
                    return null;
                }
                $state = $room->state;
                $seats = $room->seats;
                $active = [];
                foreach ($seats as $i => $uid) {
                    if (! in_array($i, $state['leftSeats'] ?? [], true) && ! in_array($i, $state['finishedOrder'] ?? [], true)) {
                        $active[$i] = (int) $uid;
                    }
                }
                if (count($active) < 2) {
                    return null;
                }
                $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
                $seenAt = $room->seen_at ?? [];
                $now = time();
                $online = [];
                $othersGone = true;
                foreach ($active as $i => $uid) {
                    $fresh = isset($seenAt[(string) $uid]) ? strtotime((string) $seenAt[(string) $uid]) : 0;
                    $isOnline = in_array($uid, $onlineIds, true) || $fresh >= $now - self::ONLINE_SECONDS;
                    if ($isOnline) {
                        $online[] = $i;
                        continue;
                    }
                    if ($fresh >= $now - self::OFFLINE_FORFEIT_SECONDS) {
                        $othersGone = false; // 刚离线不久，可能切后台马上回来
                    }
                }
                if (count($online) !== 1 || ! $othersGone) {
                    return null;
                }
                $winnerSeat = $online[0];
                $state = $this->pushEvent($state, ['t' => 'win', 'seat' => $winnerSeat, 'reason' => 'last_man']);
                $room->state = $state;
                $this->finishGame($room, $state, 'last_man');
                $room->version++;
                $room->save();
                return $room;
            });
            if ($changed instanceof AdventureRoom) {
                $this->broadcast($changed);
                ++$ended;
            }
        }
        return $ended;
    }

    /** saved 房 7 天过期关闭。 */
    public function sweepSavedRooms(): int
    {
        return AdventureRoom::query()
            ->where('status', 'saved')
            ->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::SAVED_EXPIRE_SECONDS))
            ->limit(50)
            ->update(['status' => 'closed', 'turn_deadline_at' => null, 'version' => Db::raw('version + 1')]);
    }

    // ---------------------------------------------------------------- 序列化

    /**
     * 序列化为对外状态（视角裁剪）：myItems 只给本人、埋伏只给数量、决斗暗出只给自己。
     *
     * @return array<string, mixed>
     */
    public function serialize(AdventureRoom $room, int $requesterId): array
    {
        $state = $room->state ?? [];
        $seats = $room->seats ?? [];
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $mySeat = $this->seatOf($seats, $requesterId);
        $inPlay = $room->status === 'playing' || $room->status === 'saved';
        $seenAt = $room->seen_at ?? [];
        $leftSeats = $state['leftSeats'] ?? [];
        $idleStrikes = $state['idleStrikes'] ?? [];
        $autoFlags = $state['auto'] ?? [];
        $places = $state['places'] ?? null;
        $finishedOrder = $state['finishedOrder'] ?? [];

        $players = [];
        foreach ($seats as $i => $uid) {
            $profile = $this->users->findUser((int) $uid);
            $players[] = [
                'seat' => $i,
                'userId' => (int) $uid,
                'nickname' => (string) (($profile['nickname'] ?? '') ?: '冒险棋友'),
                'avatarUrl' => (string) ($profile['avatarUrl'] ?? ''),
                'online' => in_array((int) $uid, $onlineIds, true)
                    || (isset($seenAt[(string) $uid]) && strtotime((string) $seenAt[(string) $uid]) >= time() - self::ONLINE_SECONDS),
                'left' => in_array($i, $leftSeats, true),
                'finished' => in_array($i, $finishedOrder, true),
                'auto' => ! empty($autoFlags[(string) $uid]),
                'idle' => (int) ($idleStrikes[(string) $uid] ?? 0) >= self::IDLE_LIMIT,
                'place' => is_array($places) ? ($places[$i] ?? null) : null,
                'pos' => (int) ($state['positions'][$i] ?? 0),
                'camp' => (int) ($state['campFloor'][$i] ?? 0),
                'leaves' => (int) ($state['leaves'][(string) $uid] ?? 0),
                'itemCount' => count($state['items'][(string) $uid] ?? []),
                'shield' => ! empty($state['shields'][(string) $uid]),
                'slow' => (int) ($state['slowNext'][$i] ?? 0),
                'skip' => ! empty($state['skipNext'][$i]),
            ];
        }

        // 选择窗：岔路带选项、擂台带候选，全员可见；mine 标记归属
        $pendingChoice = null;
        if (($state['pendingChoice'] ?? null) !== null && $inPlay) {
            $choice = $state['pendingChoice'];
            $pendingChoice = [
                'kind' => (string) $choice['kind'],
                'seat' => (int) $choice['seat'],
                'cell' => (int) ($choice['cell'] ?? 0),
                'mine' => $mySeat !== null && (int) $choice['seat'] === $mySeat,
            ];
            if ((string) $choice['kind'] === 'fork') {
                $cell = AdventureBoard::cell((int) $choice['cell']);
                $pendingChoice['options'] = $cell['options'] ?? [];
            }
            if ((string) $choice['kind'] === 'arena') {
                $pendingChoice['candidates'] = AdventureRule::arenaCandidates($state, $seats, (int) $choice['seat']);
            }
        }

        // 决斗窗：格式/筹码/押注公开，暗出只给本人
        $pendingDuel = null;
        if (($state['pendingDuel'] ?? null) !== null && $inPlay) {
            $duel = $state['pendingDuel'];
            $isParty = $mySeat !== null && ((int) $duel['a'] === $mySeat || (int) ($duel['b'] ?? -1) === $mySeat);
            $pendingDuel = [
                'a' => (int) $duel['a'],
                'b' => $duel['b'] !== null ? (int) $duel['b'] : null,
                'phase' => (string) $duel['phase'],
                'format' => (string) $duel['format'],
                'round' => (int) $duel['round'],
                'arena' => ! empty($duel['arena']),
                'win' => (int) $duel['win'],
                'lose' => (int) $duel['lose'],
                'mine' => $isParty,
                'myPick' => $isParty && isset($duel['picks'][(string) $mySeat]) ? $duel['picks'][(string) $mySeat] : null,
                'bets' => array_values($duel['bets'] ?? []),
            ];
            if (($duel['phase'] ?? '') === 'pick') {
                $pendingDuel['candidates'] = AdventureRule::duelCandidates($state, $seats, (int) $duel['a']);
            }
        }

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'phase' => $inPlay ? (string) ($state['phase'] ?? 'act') : null,
            'mySeat' => $mySeat,
            'ownerSeat' => 0,
            'players' => $players,
            'currentSeat' => $inPlay ? (int) ($state['currentSeat'] ?? 0) : null,
            'roll' => $inPlay ? ($state['roll'] ?? null) : null,
            'myItems' => $mySeat !== null && $inPlay ? array_values($state['items'][(string) $requesterId] ?? []) : [],
            'trapCount' => count($state['traps'] ?? []),
            'pendingChoice' => $pendingChoice,
            'pendingDuel' => $pendingDuel,
            'weather' => [
                'current' => $state['weather']['current'] ?? null,
                'next' => $state['weather']['next'] ?? null,
            ],
            'finishedOrder' => array_values($finishedOrder),
            'places' => $places,
            'turnTtl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'events' => array_values($state['events'] ?? []),
            'lastEvent' => $state['lastEvent'] ?? null,
            'winnerUserId' => $room->winner_user_id,
            'winReason' => $room->win_reason,
            'scores' => $state['scores'] ?? [],
            'chat' => array_values($state['chat'] ?? []),
            'chatSeq' => (int) ($state['chatSeq'] ?? 0),
            'sharePath' => '/pages-adventure/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（按用户视角）。 */
    private function broadcast(AdventureRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn(int $userId): array => $this->serialize($room, $userId));
    }

    // ---------------------------------------------------------------- 回合编排

    /**
     * 位移/选择/决斗落定后的收尾：终局结算 → 悬挂窗口等待 → 碰撞（决斗或顶退）→ 推进回合。
     * 必须在持有 $state 引用且尚未写回 room 时调用。
     */
    private function continueTurn(AdventureRoom $room, array &$state): void
    {
        $seats = $room->seats;
        if (AdventureRule::isGameOver($state, $seats)) {
            $this->finishGame($room, $state, 'finish');
            return;
        }
        if (($state['pendingChoice'] ?? null) !== null || ($state['pendingDuel'] ?? null) !== null) {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return;
        }

        $seat = (int) ($state['turnCtx']['seat'] ?? $state['currentSeat']);
        $pos = (int) ($state['positions'][$seat] ?? 0);
        $occupants = AdventureRule::occupantsAt($state, $seats, $pos, $seat);
        if ($occupants !== [] && ! AdventureBoard::isCamp($pos) && ! AdventureRule::seatInactive($state, $seat)) {
            if (empty($state['turnCtx']['duelDone'])) {
                $target = count($occupants) === 1 ? $occupants[0] : null; // 多人在格进入选人阶段
                $events = AdventureRule::startDuel($state, $seats, $seat, $target);
                foreach ($events as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                if (($state['pendingDuel'] ?? null) !== null || ($state['pendingChoice'] ?? null) !== null) {
                    $room->turn_deadline_at = $this->nextDeadline($state, $seats);
                    return;
                }
                // 比点数格式已即出即结 → 继续收尾
            } else {
                // 一回合一场决斗之后再碰撞：先到者（座位号最小）顶退 2
                $events = [['t' => 'bump', 'seat' => $occupants[0], 'by' => $seat]];
                $events = array_merge($events, AdventureRule::applyDisplacement($state, $seats, (int) $occupants[0], -2, 'item'));
                foreach ($events as $event) {
                    $state = $this->pushEvent($state, $event);
                }
            }
        }

        if (AdventureRule::isGameOver($state, $seats)) {
            $this->finishGame($room, $state, 'finish');
            return;
        }
        if (($state['pendingChoice'] ?? null) !== null || ($state['pendingDuel'] ?? null) !== null) {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return;
        }
        $events = AdventureRule::advanceTurn($state, $seats);
        foreach ($events as $event) {
            $state = $this->pushEvent($state, $event);
        }
        $this->afterAdvance($room, $state);
    }

    /** 推进后的收尾：终局结算 / 托管急切执行 / 刷新 deadline。 */
    private function afterAdvance(AdventureRoom $room, array &$state): void
    {
        $seats = $room->seats;
        if (AdventureRule::isGameOver($state, $seats)) {
            $this->finishGame($room, $state, 'finish');
            return;
        }
        if (($state['pendingChoice'] ?? null) !== null || ($state['pendingDuel'] ?? null) !== null) {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return;
        }
        if ($this->seatIsAuto($state, $seats, (int) $state['currentSeat'])) {
            $this->drainAuto($room, $state);
        } else {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
        }
    }

    /**
     * 托管急切执行：托管座位的整回合（掷+走+窗口默认+决斗随机），真人窗口则停手等输入。
     * 循环上限 AUTO_TURN_CAP。
     */
    private function drainAuto(AdventureRoom $room, array &$state): void
    {
        $seats = $room->seats;
        $iterations = 0;
        while ($room->status === 'playing') {
            // 1) 选择窗：托管座位用默认值
            if (($state['pendingChoice'] ?? null) !== null) {
                $seat = (int) $state['pendingChoice']['seat'];
                if (! $this->seatIsAuto($state, $seats, $seat)) {
                    break;
                }
                $value = AdventureRule::defaultChoiceValue($state, $seats);
                foreach (AdventureRule::applyChoice($state, $seats, $seat, $value) as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                $this->continueTurn($room, $state);
                continue;
            }
            // 2) 决斗窗：托管一方选人/出招，剩下的都是真人输入则停手
            if (($state['pendingDuel'] ?? null) !== null) {
                $duel = $state['pendingDuel'];
                $acted = false;
                if (($duel['phase'] ?? '') === 'pick' && $this->seatIsAuto($state, $seats, (int) $duel['a'])) {
                    $cands = AdventureRule::duelCandidates($state, $seats, (int) $duel['a']);
                    if ($cands !== []) {
                        $events = AdventureRule::submitDuelInput($state, $seats, (int) $duel['a'], $cands[array_rand($cands)]);
                        foreach ($events as $event) {
                            $state = $this->pushEvent($state, $event);
                        }
                        $acted = true;
                    }
                } else {
                    foreach (['a', 'b'] as $k) {
                        $s = $duel[$k] ?? null;
                        if ($s === null) {
                            continue;
                        }
                        if ($this->seatIsAuto($state, $seats, (int) $s) && ! AdventureRule::duelPicked($state['pendingDuel'], (int) $s)) {
                            $input = (string) $duel['format'] === 'rps' ? random_int(0, 2) : random_int(0, 3);
                            $events = AdventureRule::submitDuelInput($state, $seats, (int) $s, $input);
                            foreach ($events as $event) {
                                $state = $this->pushEvent($state, $event);
                            }
                            $acted = true;
                            break;
                        }
                    }
                }
                if (! $acted) {
                    break;
                }
                if (($state['pendingDuel'] ?? null) === null) {
                    $this->continueTurn($room, $state);
                }
                continue;
            }
            // 3) 无窗口：当前座位托管则执行整回合
            if (! $this->seatIsAuto($state, $seats, (int) $state['currentSeat'])) {
                break;
            }
            if (++$iterations > self::AUTO_TURN_CAP) {
                // 诚实 RNG 下不可达的兜底：强推到下一个真人座位
                $n = count($seats);
                for ($i = 1; $i <= $n; ++$i) {
                    $s = ((int) $state['currentSeat'] + $i) % $n;
                    if (! $this->seatIsAuto($state, $seats, $s) && ! AdventureRule::seatInactive($state, $s)) {
                        $state['currentSeat'] = $s;
                        $state['phase'] = 'act';
                        $state['roll'] = null;
                        $state['turnCtx'] = null;
                        break;
                    }
                }
                $state = $this->pushEvent($state, ['t' => 'autoCap']);
                break;
            }
            $this->autoExecuteTurn($room, $state);
        }
        $room->turn_deadline_at = $room->status === 'playing' ? $this->nextDeadline($state, $room->seats) : null;
    }

    /** 托管/超时的整回合执行：自动掷（如需）→ 自动走（不打道具）→ 收尾。 */
    private function autoExecuteTurn(AdventureRoom $room, array &$state): void
    {
        $seats = $room->seats;
        $seat = (int) $state['currentSeat'];
        if (($state['phase'] ?? 'act') === 'act') {
            $dice = [random_int(1, 6), random_int(1, 6)];
            $state['roll'] = $dice;
            $state['phase'] = 'resolve';
            $state = $this->pushEvent($state, ['t' => 'roll', 'seat' => $seat, 'v' => $dice, 'auto' => true]);
            if ($dice[0] === $dice[1]) {
                $uid = (string) $seats[$seat];
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 2;
                $state = $this->pushEvent($state, ['t' => 'doubles', 'seat' => $seat]);
            }
        }
        $state['turnCtx'] = ['seat' => $seat, 'duelDone' => false];
        $steps = AdventureRule::computeMoveSteps($state, $seat);
        $events = AdventureRule::applyDisplacement($state, $seats, $seat, $steps, 'dice');
        foreach ($events as $event) {
            $state = $this->pushEvent($state, $event);
        }
        $this->continueTurn($room, $state);
    }

    /**
     * 懒超时推进（事务内、已持行锁）：当前窗口到期则自动结算一次。返回是否有推进。
     * $exceptUserId：若受影响的正是请求者本人（人来了），不扫掉其窗口，改为刷新 deadline 放行——
     * 否则「懒推进 → 回滚 → 再请求再推进」会把一个活跃玩家软锁在 422 循环里。
     */
    private function applyDueTimeoutIfNeeded(AdventureRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->status !== 'playing' || $room->turn_deadline_at === null) {
            return false;
        }
        if (strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $state = $room->state;
        $seats = $room->seats;

        $affected = [];
        if (($state['pendingDuel'] ?? null) !== null) {
            $affected[] = (int) $state['pendingDuel']['a'];
            if ($state['pendingDuel']['b'] !== null) {
                $affected[] = (int) $state['pendingDuel']['b'];
            }
        } elseif (($state['pendingChoice'] ?? null) !== null) {
            $affected[] = (int) $state['pendingChoice']['seat'];
        } else {
            $affected[] = (int) $state['currentSeat'];
        }
        $exceptSeat = $exceptUserId !== null ? $this->seatOf($seats, $exceptUserId) : null;
        if ($exceptSeat !== null && in_array($exceptSeat, $affected, true)) {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return false;
        }

        if (($state['pendingDuel'] ?? null) !== null) {
            $duel = $state['pendingDuel'];
            if (($duel['phase'] ?? '') === 'pick') {
                $cands = AdventureRule::duelCandidates($state, $seats, (int) $duel['a']);
                $pick = $cands !== [] ? $cands[array_rand($cands)] : null;
                $events = $pick !== null ? AdventureRule::submitDuelInput($state, $seats, (int) $duel['a'], $pick) : [];
            } else {
                $events = [];
                foreach (['a', 'b'] as $k) {
                    $s = $duel[$k] ?? null;
                    if ($s === null || AdventureRule::duelPicked($state['pendingDuel'], (int) $s)) {
                        continue;
                    }
                    $input = (string) $duel['format'] === 'rps' ? random_int(0, 2) : random_int(0, 3);
                    $events = array_merge($events, AdventureRule::submitDuelInput($state, $seats, (int) $s, $input));
                }
            }
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }
            if (($state['pendingDuel'] ?? null) === null) {
                $this->continueTurn($room, $state);
            } else {
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            }
        } elseif (($state['pendingChoice'] ?? null) !== null) {
            $seat = (int) $state['pendingChoice']['seat'];
            $value = AdventureRule::defaultChoiceValue($state, $seats);
            foreach (AdventureRule::applyChoice($state, $seats, $seat, $value) as $event) {
                $state = $this->pushEvent($state, $event);
            }
            if (($state['pendingDuel'] ?? null) !== null) {
                $room->turn_deadline_at = $this->nextDeadline($state, $seats); // 擂台默认挑战开窗
            } else {
                $this->continueTurn($room, $state);
            }
        } else {
            // 回合超时：挂机计数 + 自动整回合
            $seat = (int) $state['currentSeat'];
            $uid = (string) ($seats[$seat] ?? 0);
            $state['idleStrikes'][$uid] = (int) ($state['idleStrikes'][$uid] ?? 0) + 1;
            $state = $this->pushEvent($state, ['t' => 'timeout', 'seat' => $seat]);
            $this->autoExecuteTurn($room, $state);
        }

        $room->state = $state;
        return true;
    }

    /** 终局结算：排名、冠军、胜场 +1、事件。调用方负责后续 version++/save。 */
    private function finishGame(AdventureRoom $room, array &$state, string $reason): void
    {
        $seats = $room->seats;
        $places = AdventureRule::computePlaces($state, $seats);
        $state['places'] = $places;
        $winnerSeat = null;
        foreach ($places as $seat => $place) {
            if ($place === 1) {
                $winnerSeat = (int) $seat;
                break;
            }
        }
        if ($winnerSeat !== null) {
            $uid = (string) ($seats[$winnerSeat] ?? 0);
            if ($uid !== '0') {
                $state['scores'][$uid] = (int) ($state['scores'][$uid] ?? 0) + 1;
            }
            $state = $this->pushEvent($state, ['t' => 'win', 'seat' => $winnerSeat, 'reason' => $reason]);
            $room->winner_user_id = (int) $seats[$winnerSeat];
        } else {
            $state = $this->pushEvent($state, ['t' => 'win', 'seat' => null, 'reason' => $reason]);
        }
        $room->state = $state;
        $room->status = 'finished';
        $room->win_reason = $reason;
        $room->turn_deadline_at = null;
        $room->paused_at = null;
    }

    /** 事件入环：分配 seq/ts，保留最近 EVENTS_KEEP 条，并同步 lastEvent。 */
    private function pushEvent(array $state, array $event): array
    {
        $events = isset($state['events']) && is_array($state['events']) ? $state['events'] : [];
        $event['seq'] = (int) ($state['eventSeq'] ?? 0) + 1;
        $event['ts'] = time();
        $events[] = $event;
        if (count($events) > self::EVENTS_KEEP) {
            $events = array_slice($events, -self::EVENTS_KEEP);
        }
        $state['events'] = $events;
        $state['eventSeq'] = $event['seq'];
        $state['lastEvent'] = $event;
        return $state;
    }

    /** 聊天三件套（chat/chatSeq/chatLastAt）随新 state 带走（开局/重开）。 */
    private function carryChat(array $old, array $fresh): array
    {
        foreach (['chat', 'chatSeq', 'chatLastAt'] as $key) {
            if (array_key_exists($key, $old)) {
                $fresh[$key] = $old[$key];
            }
        }
        return $fresh;
    }

    /** 座位是否托管（按 seats 的 uid 查 auto 标记）。 */
    private function seatIsAuto(array $state, array $seats, int $seat): bool
    {
        $uid = (string) ($seats[$seat] ?? 0);
        return $uid !== '0' && ! empty($state['auto'][$uid]);
    }

    /** 房内是否有人在线（WS 连接 ∪ seen_at 60s）。 */
    private function anyoneOnline(AdventureRoom $room): bool
    {
        if ($this->pusher->onlineUserIds((string) $room->code) !== []) {
            return true;
        }
        $now = time();
        foreach ($room->seats ?? [] as $uid) {
            $fresh = isset($room->seen_at[(string) $uid]) ? strtotime((string) $room->seen_at[(string) $uid]) : 0;
            if ($fresh >= $now - self::ONLINE_SECONDS) {
                return true;
            }
        }
        return false;
    }

    /** 下一窗口 deadline：决斗 10s / 选择 8s / 道具确认 10s / 掷骰 20s；挂机玩家压到 5s（仅自己回合）。 */
    private function nextDeadline(array $state, array $seats): string
    {
        if (($state['pendingDuel'] ?? null) !== null) {
            $seconds = self::DUEL_SECONDS;
        } elseif (($state['pendingChoice'] ?? null) !== null) {
            $seconds = self::CHOICE_SECONDS;
        } else {
            $seconds = ($state['phase'] ?? 'act') === 'resolve' ? self::RESOLVE_SECONDS : self::TURN_SECONDS;
            $uid = (string) ($seats[(int) ($state['currentSeat'] ?? 0)] ?? 0);
            if ((int) ($state['idleStrikes'][$uid] ?? 0) >= self::IDLE_LIMIT) {
                $seconds = min($seconds, self::IDLE_TURN_SECONDS);
            }
        }
        return date('Y-m-d H:i:s', time() + $seconds);
    }

    /** 校验「轮到我、对局进行中、处于指定阶段」，返回 [seat, state]。 */
    private function requireMyPhase(AdventureRoom $room, int $userId, string $phase): array
    {
        $seat = $this->requireMyTurn($room, $userId);
        $state = $room->state;
        if ((string) $state['phase'] !== $phase) {
            throw new BizException(422, $phase === 'act' ? '先掷骰子' : '掷过骰子了，确认走子或用道具');
        }
        return [$seat, $state];
    }

    /** 校验「已入座、进行中、未离开未登顶、轮到我」，返回座位。 */
    private function requireMyTurn(AdventureRoom $room, int $userId): int
    {
        $seat = $this->requireSeated($room, $userId);
        if ($room->status !== 'playing') {
            throw new BizException(422, '对局不在进行中');
        }
        $state = $room->state;
        if (in_array($seat, $state['leftSeats'] ?? [], true)) {
            throw new BizException(403, '你已离开本局');
        }
        if (in_array($seat, $state['finishedOrder'] ?? [], true)) {
            throw new BizException(422, '你已登顶，观战中');
        }
        if ((int) $state['currentSeat'] !== $seat) {
            throw new BizException(422, '还没轮到你');
        }
        return $seat;
    }

    /** 校验「轮到我做当前选择」，返回 [seat, state, choice]。 */
    private function requireMyChoice(AdventureRoom $room, int $userId): array
    {
        $seat = $this->requireSeated($room, $userId);
        if ($room->status !== 'playing') {
            throw new BizException(422, '对局不在进行中');
        }
        $state = $room->state;
        $choice = $state['pendingChoice'] ?? null;
        if ($choice === null) {
            throw new BizException(422, '现在没有等你做的选择');
        }
        if ((int) $choice['seat'] !== $seat) {
            throw new BizException(422, '这个选择不归你');
        }
        return [$seat, $state, $choice];
    }

    /** 必须已入座（含游戏中途离开的），否则 403。 */
    private function requireSeated(AdventureRoom $room, int $userId): int
    {
        $seat = $this->seatOf($room->seats, $userId);
        if ($seat === null) {
            throw new BizException(403, '你不是本局玩家');
        }
        return $seat;
    }

    /** 用户座位号；旁观返回 null。 */
    private function seatOf(array $seats, int $userId): ?int
    {
        $idx = array_search($userId, $seats, true);
        return $idx === false ? null : (int) $idx;
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version，避免心跳搅动同步计数。 */
    private function touchSeenAt(AdventureRoom $room, int $userId): void
    {
        if ($this->seatOf($room->seats, $userId) === null) {
            return;
        }
        $seenAt = $room->seen_at ?? [];
        $seenAt[(string) $userId] = date('Y-m-d H:i:s');
        $room->seen_at = $seenAt;
        $room->save();
    }

    /** 取活跃房间（行锁，事务内使用）；不存在/已关闭抛 404。 */
    private function lockByCode(string $code): AdventureRoom
    {
        $room = AdventureRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof AdventureRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): AdventureRoom
    {
        $room = AdventureRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof AdventureRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; $i++) {
            $code = (string) random_int(1000, 9999);
            $exists = AdventureRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
            if (! $exists) {
                return $code;
            }
        }
        throw new BizException(500, '房间码生成失败');
    }

    /** 房间码只接受 4 位数字。 */
    private function normalizeCode(string $code): string
    {
        $code = trim($code);
        return preg_match('/^[0-9]{4}$/', $code) === 1 ? $code : '';
    }
}
