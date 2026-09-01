<?php

declare(strict_types=1);

namespace App\Service\Ludo;

use App\Exception\BizException;
use App\Model\LudoRoom;
use App\Service\WechatUserService;
use Hyperf\DbConnection\Db;

/**
 * 飞行棋联机房间：服务端权威，完整对局快照存 MySQL（重启不丢局）。
 *
 * 所有写操作走事务 + 行锁，杜绝双击/竞态分叉棋局；每次提交后经 LudoWsPusher
 * 向房间内 WebSocket 连接广播最新状态。飞行棋无隐藏信息（骰子服务端掷、掷完即公开），
 * serialize 不做视角裁剪，人人可见同一份棋盘 + legalMoves。
 *
 * 两阶段回合：phase=roll（掷骰，20s）→ phase=move（选机走子，20s）→ 推进
 * （掷 6 且未刚完成则同人再掷）。到期由两层机制推进（无 cron）——
 * 1) 本类写操作前的懒检查 applyDueTimeoutIfNeeded（任何请求路过顺手推进）；
 * 2) LudoTurnSweepListener 的 Coordinator Timer 每秒扫到期房间（WS 模式下客户端不轮询）。
 *
 * 托管：座位 auto 标记一开，回合推进落在托管座位时由 drainAuto 在同一事务内
 * 急切执行整个回合（掷+走+额外回合链，循环上限 AUTO_ROLL_CAP 防死循环）——
 * 托管座位在提交时刻绝不持有活跃 deadline，Timer 只是中途崩溃的兜底。
 */
final class LudoRoomService
{
    /** 房间闲置多久（秒）后懒清理。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 掷骰/走子各阶段时限（秒）。 */
    public const int TURN_SECONDS = 20;

    /** 定先手阶段时限（秒）：全员掷单骰点大者先手，超时自动代掷。 */
    public const int OPENING_SECONDS = 10;

    /** 连续超时多少次进入挂机（挂机阶段 5s 自动，任何真实操作解除）。 */
    public const int IDLE_LIMIT = 3;

    /** 挂机阶段时限（秒）。 */
    public const int IDLE_TURN_SECONDS = 5;

    /** drainAuto 单次最多执行的回合数（bug 兜底：诚实 RNG 下不可能触顶）。 */
    private const int AUTO_ROLL_CAP = 24;

    /** state.events 环形数组保留条数。 */
    public const int EVENTS_KEEP = 16;

    /** 其他玩家离线超过多久（秒）视为离场不再回来，判最后在线的人获胜。 */
    private const int OFFLINE_FORFEIT_SECONDS = 120;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly LudoWsPusher $pusher,
    ) {}

    /**
     * 创建房间：创建者坐 0 号位（房主），插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed>
     */
    public function create(int $userId): array
    {
        LudoRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new LudoRoom();
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
     * 加入房间：本人重进幂等；等待中且未满 4 人则入座；满员/已开局为旁观者。
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
            if ($room->status === 'waiting' && count($room->seats) < LudoRule::MAX_PLAYERS) {
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
     * 开局：仅房主（0 号位），2-4 人。座位配色按人数映射，先手随机。
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
            if (count($room->seats) < 2) {
                throw new BizException(422, '至少 2 人才能开局');
            }
            $state = LudoRule::setupGame($room->seats);
            // 保留等待室期间的累计胜场（重开链）
            foreach ($room->seats as $uid) {
                $state['scores'][(string) $uid] = (int) ($room->state['scores'][(string) $uid] ?? 0);
            }
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
     * 掷骰：opening 阶段全员各掷一次单骰定先手；roll 阶段轮到本人掷。
     *
     * @return array<string, mixed>
     */
    public function roll(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);

            if (($room->state['phase'] ?? 'roll') === 'opening') {
                // ── 定先手：该轮到且没掷过的人 ──
                $seat = $this->requireSeated($room, $userId);
                if ($room->status !== 'playing') {
                    throw new BizException(422, '对局不在进行中');
                }
                if (in_array($seat, $room->state['leftSeats'] ?? [], true)) {
                    throw new BizException(403, '你已离开本局');
                }
                if (! in_array($seat, LudoRule::openingPendingSeats($room->state, $room->seats), true)) {
                    throw new BizException(422, '现在不用你掷骰');
                }
                $state = $room->state;
                $state['idleStrikes'][(string) $userId] = 0;
                foreach (LudoRule::rollOpening($state, $room->seats, $seat) as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                $room->state = $state;
                $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
                $this->touchSeenAt($room, $userId);
                $room->version++;
                $room->save();
                return $room;
            }

            [$seat, $state] = $this->requireMyPhase($room, $userId, 'roll');

            $value = random_int(1, 6);
            $state['idleStrikes'][(string) $userId] = 0;
            $state = $this->pushEvent($state, ['t' => 'roll', 'seat' => $seat, 'v' => $value]);

            $moves = LudoRule::legalMoves($state, $room->seats, $seat, $value);
            if ($moves === []) {
                // 无处可走：跳过并推进（掷 6 必有走法，此处正常只覆盖非 6 机场局）
                $state = $this->pushEvent($state, ['t' => 'skip', 'seat' => $seat, 'v' => $value]);
                $this->advanceTurn($state, $room->seats, $seat, $value);
                $this->afterAdvance($room, $state);
            } else {
                $state['phase'] = 'move';
                $state['roll'] = $value;
                $state['legalMoves'] = $moves;
                $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
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
     * 走子：move 阶段专属，plane 必须在 legalMoves 内（服务端权威重算应用）。
     *
     * @return array<string, mixed>
     */
    public function move(string $code, int $userId, int $plane): array
    {
        $room = Db::transaction(function () use ($code, $userId, $plane) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state] = $this->requireMyPhase($room, $userId, 'move');

            $moves = $state['legalMoves'] ?? [];
            $chosen = null;
            foreach ($moves as $item) {
                if ((int) $item['p'] === $plane) {
                    $chosen = $item;
                    break;
                }
            }
            if ($chosen === null) {
                throw new BizException(422, '这架飞机现在不能走');
            }

            $value = (int) $state['roll'];
            $events = LudoRule::applyMove($state, $room->seats, $seat, $plane, $value);
            foreach ($events as $event) {
                $state = $this->pushEvent($state, $event);
            }
            $state['idleStrikes'][(string) $userId] = 0;

            $state['phase'] = 'roll';
            $state['roll'] = null;
            $state['legalMoves'] = null;
            $justFinished = in_array($seat, $state['finishedOrder'], true);
            $this->advanceTurn($state, $room->seats, $seat, $value, $justFinished);
            $this->afterAdvance($room, $state);

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
     * 托管开关：开启后轮到本人时立即由服务端代走（同事务内 drainAuto）。
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
            if ($on && $room->status === 'playing') {
                // 定先手阶段或轮到本人时立即由服务端代走（drainAuto 自己判断场景）
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

    /**
     * 再来一局：终局后由任一入座玩家发起，中途离开者不带回，累计胜场保留。
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
            $oldState = $room->state;
            $left = $oldState['leftSeats'] ?? [];
            $seats = [];
            foreach ($room->seats as $i => $uid) {
                if (! in_array($i, $left, true)) {
                    $seats[] = $uid;
                }
            }
            if (count($seats) < 2) {
                throw new BizException(422, '至少 2 人才能再来一局');
            }
            $state = LudoRule::resetForRematch($oldState, array_values($seats));
            $state = $this->pushEvent($state, ['t' => 'rematch']);
            $room->seats = array_values($seats);
            $room->state = $state;
            $room->status = 'playing';
            $room->winner_user_id = null;
            $room->win_reason = null;
            $this->afterAdvance($room, $state);
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待中移出座位（空房关闭）；对局中若还剩 2 人以上则快照进度、
     * 飞机收回机场、座位标记离开并跳过，恰好 2 人则逃跑判负终局。
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
            } elseif ($this->activeSeats($state, $seats) <= 2) {
                // 只剩 2 人时离开 = 逃跑判负；同样快照进度并标记离开（排名恒在存活者之后）
                $state['leftSeats'][] = $seat;
                $state['leftProgress'][(string) $seat] = $state['planes'][$seat];
                $state['planes'][$seat] = array_fill(0, LudoRule::PLANES, LudoRule::HANGAR);
                $state = $this->pushEvent($state, ['t' => 'leave', 'seat' => $seat]);
                $room->state = $state;
                $this->finishGame($room, $state, 'forfeit');
            } else {
                // 多人局：先快照进度（终局排名用），飞机收回机场，跳过
                $state['leftSeats'][] = $seat;
                $state['leftProgress'][(string) $seat] = $state['planes'][$seat];
                $state['planes'][$seat] = array_fill(0, LudoRule::PLANES, LudoRule::HANGAR);
                unset($state['auto'][(string) $userId]);
                if (($state['phase'] ?? 'roll') === 'opening') {
                    // 定先手阶段离开：其余人都掷完则立即结算先手，否则继续等
                    foreach (LudoRule::resolveOpeningIfNeeded($state, $seats) as $event) {
                        $state = $this->pushEvent($state, $event);
                    }
                } elseif ((int) $state['currentSeat'] === $seat) {
                    // 自己回合离开（含掷 6 的额外回合）：不再补掷，直接推进
                    $state['phase'] = 'roll';
                    $state['roll'] = null;
                    $state['legalMoves'] = null;
                    $this->advanceTurn($state, $seats, $seat, 0, in_array($seat, $state['finishedOrder'], true), true);
                }
                $state = $this->pushEvent($state, ['t' => 'leave', 'seat' => $seat]);
                if (LudoRule::isGameOver($state, $seats)) {
                    $room->state = $state;
                    $this->finishGame($room, $state, 'finish');
                } else {
                    $this->afterAdvance($room, $state);
                    $room->state = $state;
                }
            }
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
     * Timer 清扫入口：把所有「进行中且阶段已到期」的房间自动推进
     * （roll 期到 → 自动掷+自动走；move 期到 → 按合法走法启发式选机）。返回推进的房间数。
     */
    public function sweepDueRooms(): int
    {
        $codes = LudoRoom::query()
            ->where('status', 'playing')
            ->whereNotNull('turn_deadline_at')
            ->where('turn_deadline_at', '<=', date('Y-m-d H:i:s'))
            ->limit(50)
            ->pluck('code');
        $swept = 0;
        foreach ($codes as $code) {
            $room = Db::transaction(function () use ($code) {
                $room = $this->lockByCode((string) $code);
                if (! $this->applyDueTimeoutIfNeeded($room)) {
                    return null;
                }
                $room->version++;
                $room->save();
                return $room;
            });
            if ($room instanceof LudoRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * Timer 清扫入口 2：把所有「只剩一人在线」的进行中对局判负结束——
     * 覆盖「其他人直接划走小程序没点离开」的场景。全部离线的局不动：暂停保留。
     * 返回结束的房间数。
     */
    public function sweepLonelyRooms(): int
    {
        $rooms = LudoRoom::query()->where('status', 'playing')->limit(50)->get();
        $ended = 0;
        foreach ($rooms as $room) {
            $changed = Db::transaction(function () use ($room) {
                $room = $this->lockByCode((string) $room->code);
                if ($room->status !== 'playing') {
                    return null;
                }
                $state = $room->state;
                $seats = $room->seats;
                $left = $state['leftSeats'] ?? [];
                $active = [];
                foreach ($seats as $i => $uid) {
                    if (! in_array($i, $left, true)) {
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
            if ($changed instanceof LudoRoom) {
                $this->broadcast($changed);
                ++$ended;
            }
        }
        return $ended;
    }

    /** 序列化为对外状态；飞行棋无隐藏信息，HTTP 接口与 WS 推送人人同款。 */
    public function serialize(LudoRoom $room, int $requesterId): array
    {
        $state = $room->state ?? [];
        $seats = $room->seats ?? [];
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $mySeat = $this->seatOf($seats, $requesterId);
        $playing = $room->status === 'playing';
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
                'nickname' => (string) (($profile['nickname'] ?? '') ?: '飞行棋友'),
                'avatarUrl' => (string) ($profile['avatarUrl'] ?? ''),
                'online' => in_array((int) $uid, $onlineIds, true)
                    || (isset($seenAt[(string) $uid]) && strtotime((string) $seenAt[(string) $uid]) >= time() - self::ONLINE_SECONDS),
                'left' => in_array($i, $leftSeats, true),
                'color' => isset($state['colors'][$i]) ? (int) $state['colors'][$i] : null,
                'finished' => in_array($i, $finishedOrder, true),
                'finishedCount' => count(array_filter($state['planes'][$i] ?? [], static fn($p) => (int) $p === LudoRule::JOURNEY)),
                'auto' => ! empty($autoFlags[(string) $uid]),
                'idle' => (int) ($idleStrikes[(string) $uid] ?? 0) >= self::IDLE_LIMIT,
                'place' => is_array($places) ? ($places[$i] ?? null) : null,
            ];
        }

        $phase = $playing ? (string) ($state['phase'] ?? 'roll') : null;

        $opening = null;
        if ($playing && $phase === 'opening') {
            $pending = LudoRule::openingPendingSeats($state, $seats);
            $opening = [
                'round' => (int) ($state['opening']['round'] ?? 1),
                'tieSeats' => array_values($state['opening']['tieSeats'] ?? []),
                'rolls' => (object) ($state['opening']['rolls'] ?? []),
                'pending' => $pending,
                'mine' => $mySeat !== null && in_array($mySeat, $pending, true),
            ];
        }

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'phase' => $phase,
            'mySeat' => $mySeat,
            'ownerSeat' => 0,
            'players' => $players,
            'currentSeat' => $playing && $state['currentSeat'] !== null ? (int) $state['currentSeat'] : null,
            'opening' => $opening,
            'roll' => $playing ? ($state['roll'] ?? null) : null,
            'planes' => $state['planes'] ?? [],
            'colors' => $state['colors'] ?? [],
            'legalMoves' => $playing && $phase === 'move' ? ($state['legalMoves'] ?? []) : null,
            'finishedOrder' => array_values($finishedOrder),
            'places' => $places,
            'turnTtl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'events' => array_values($state['events'] ?? []),
            'lastEvent' => $state['lastEvent'] ?? null,
            'winnerUserId' => $room->winner_user_id,
            'winReason' => $room->win_reason,
            'scores' => $state['scores'] ?? [],
            'sharePath' => '/pages-ludo/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态。 */
    private function broadcast(LudoRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn(int $userId): array => $this->serialize($room, $userId));
    }

    /**
     * 回合推进（只改 state，不动 deadline、不递归托管）：
     * 掷 6 且未刚完成且未终局 → 同座位再掷；否则扫下一个活跃座位。
     * $suppressExtra：自己回合离开时即使刚掷 6 也不补掷。
     */
    private function advanceTurn(array &$state, array $seats, int $seat, int $roll, bool $justFinished = false, bool $suppressExtra = false): void
    {
        $again = $roll === LudoRule::TAKEOFF_ROLL && ! $justFinished && ! $suppressExtra
            && ! LudoRule::isGameOver($state, $seats);
        $state['phase'] = 'roll';
        $state['roll'] = null;
        $state['legalMoves'] = null;
        if (! $again) {
            $state['currentSeat'] = LudoRule::nextSeat($state, $seats, (int) $state['currentSeat']);
        }
    }

    /**
     * 推进后的收尾：终局则结算排名，否则当前座位托管则急切代走，真人则刷新 deadline。
     * 必须在持有 $state 引用且尚未写回 room 时调用（内部会写 room->state）。
     */
    private function afterAdvance(LudoRoom $room, array &$state): void
    {
        $seats = $room->seats;
        if (LudoRule::isGameOver($state, $seats)) {
            $this->finishGame($room, $state, 'finish');
            return;
        }
        if (($state['phase'] ?? 'roll') === 'opening') {
            // 定先手：托管自动掷，真人未掷只刷新 deadline
            $this->drainAuto($room, $state);
            return;
        }
        if ($this->seatIsAuto($state, $seats, (int) $state['currentSeat'])) {
            $this->drainAuto($room, $state);
        } else {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
        }
    }

    /**
     * 托管急切执行：当前（及后续连续）托管座位的整个回合（掷+走+额外回合链），
     * 循环上限 AUTO_ROLL_CAP。退出时：真人座位持新鲜 deadline，或已终局（deadline null）。
     * 开启托管时可能正处本座位 move 阶段：沿用已掷的点数与合法走法，不重复掷骰。
     */
    private function drainAuto(LudoRoom $room, array &$state): void
    {
        $seats = $room->seats;
        $iterations = 0;
        while ($room->status === 'playing') {
            // 0) 定先手：托管座位自动掷，剩下真人等输入
            if (($state['phase'] ?? 'roll') === 'opening') {
                foreach (LudoRule::openingPendingSeats($state, $seats) as $s) {
                    if ($this->seatIsAuto($state, $seats, $s)) {
                        foreach (LudoRule::rollOpening($state, $seats, $s) as $event) {
                            $state = $this->pushEvent($state, $event);
                        }
                    }
                }
                if (($state['phase'] ?? 'roll') === 'opening') {
                    break;
                }
                continue; // 定先手完成 → 顶部按当前座位继续
            }
            if (! $this->seatIsAuto($state, $seats, (int) $state['currentSeat'])) {
                break;
            }
            if (++$iterations > self::AUTO_ROLL_CAP) {
                // 诚实 RNG 下不可达的兜底：强推到下一个非托管座位，避免死循环
                $n = count($seats);
                for ($i = 1; $i <= $n; ++$i) {
                    $s = ((int) $state['currentSeat'] + $i) % $n;
                    if (! $this->seatIsAuto($state, $seats, $s) && ! in_array($s, $state['leftSeats'] ?? [], true) && ! in_array($s, $state['finishedOrder'] ?? [], true)) {
                        $state['currentSeat'] = $s;
                        $state['phase'] = 'roll';
                        $state['roll'] = null;
                        $state['legalMoves'] = null;
                        break;
                    }
                }
                $state = $this->pushEvent($state, ['t' => 'autoCap']);
                break;
            }
            $seat = (int) $state['currentSeat'];
            if (($state['phase'] ?? 'roll') === 'move' && (int) ($state['roll'] ?? 0) > 0) {
                $value = (int) $state['roll'];
                $moves = $state['legalMoves'] ?? [];
            } else {
                $value = random_int(1, 6);
                $state = $this->pushEvent($state, ['t' => 'roll', 'seat' => $seat, 'v' => $value, 'auto' => true]);
                $moves = LudoRule::legalMoves($state, $seats, $seat, $value);
            }
            if ($moves === []) {
                $state = $this->pushEvent($state, ['t' => 'skip', 'seat' => $seat, 'v' => $value, 'auto' => true]);
                $this->advanceTurn($state, $seats, $seat, $value);
            } else {
                $pick = (int) LudoRule::pickAuto($moves);
                $events = LudoRule::applyMove($state, $seats, $seat, $pick, $value);
                foreach ($events as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                $justFinished = in_array($seat, $state['finishedOrder'], true);
                $this->advanceTurn($state, $seats, $seat, $value, $justFinished);
            }
            if (LudoRule::isGameOver($state, $seats)) {
                $this->finishGame($room, $state, 'finish');
                return;
            }
        }
        $room->turn_deadline_at = $room->status === 'playing' ? $this->nextDeadline($state, $seats) : null;
    }

    /** 座位是否托管（按 seats 的 uid 查 auto 标记）。 */
    private function seatIsAuto(array $state, array $seats, int $seat): bool
    {
        $uid = (string) ($seats[$seat] ?? 0);
        return $uid !== '0' && ! empty($state['auto'][$uid]);
    }

    /**
     * 懒超时推进（事务内、已持行锁）：当前阶段到期则自动结算一次。返回是否有推进。
     * $exceptUserId：若到期的正是请求者本人（人来了），不扫掉其回合，改为刷新 deadline 放行——
     * 否则「懒推进 → 回滚 → 再请求再推进」会把一个活跃玩家软锁在 422 循环里。
     */
    private function applyDueTimeoutIfNeeded(LudoRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->status !== 'playing' || $room->turn_deadline_at === null) {
            return false;
        }
        if (strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $state = $room->state;
        $seats = $room->seats;

        // 定先手阶段：受影响的是还没掷骰的人；超时自动代掷（不加挂机计数，仪式不罚）
        if (($state['phase'] ?? 'roll') === 'opening') {
            $pending = LudoRule::openingPendingSeats($state, $seats);
            $exceptSeat = $exceptUserId !== null ? $this->seatOf($seats, $exceptUserId) : null;
            if ($exceptSeat !== null && in_array($exceptSeat, $pending, true)) {
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
                return false;
            }
            foreach ($pending as $s) {
                foreach (LudoRule::rollOpening($state, $seats, $s) as $event) {
                    $state = $this->pushEvent($state, $event);
                }
            }
            $room->state = $state;
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return true;
        }

        if ($exceptUserId !== null && (int) ($seats[(int) $state['currentSeat']] ?? 0) === $exceptUserId) {
            $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            return false;
        }

        $seat = (int) $state['currentSeat'];
        $uid = (string) ($seats[$seat] ?? 0);
        $state['idleStrikes'][$uid] = (int) ($state['idleStrikes'][$uid] ?? 0) + 1;

        $value = (int) ($state['roll'] ?? 0);
        if (($state['phase'] ?? 'roll') === 'move' && $value > 0) {
            // move 期超时：按既有合法走法启发式选机
            $moves = $state['legalMoves'] ?? [];
            $pick = LudoRule::pickAuto($moves);
            if ($pick !== null) {
                $events = LudoRule::applyMove($state, $seats, $seat, (int) $pick, $value);
                foreach ($events as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                $state = $this->pushEvent($state, ['t' => 'timeout', 'seat' => $seat, 'p' => (int) $pick]);
                $justFinished = in_array($seat, $state['finishedOrder'], true);
                $this->advanceTurn($state, $seats, $seat, $value, $justFinished);
            } else {
                // 理论不可达（move 阶段必有合法走法）：防御性跳过
                $this->advanceTurn($state, $seats, $seat, $value);
            }
        } else {
            // roll 期超时：自动掷 + 自动走
            $value = random_int(1, 6);
            $state = $this->pushEvent($state, ['t' => 'roll', 'seat' => $seat, 'v' => $value, 'auto' => true]);
            $moves = LudoRule::legalMoves($state, $seats, $seat, $value);
            if ($moves === []) {
                $state = $this->pushEvent($state, ['t' => 'skip', 'seat' => $seat, 'v' => $value, 'auto' => true]);
                $this->advanceTurn($state, $seats, $seat, $value);
            } else {
                $pick = (int) LudoRule::pickAuto($moves);
                $events = LudoRule::applyMove($state, $seats, $seat, $pick, $value);
                foreach ($events as $event) {
                    $state = $this->pushEvent($state, $event);
                }
                $state = $this->pushEvent($state, ['t' => 'timeout', 'seat' => $seat, 'p' => $pick]);
                $justFinished = in_array($seat, $state['finishedOrder'], true);
                $this->advanceTurn($state, $seats, $seat, $value, $justFinished);
            }
        }

        $room->state = $state;
        if (LudoRule::isGameOver($state, $seats)) {
            $this->finishGame($room, $state, 'finish');
        } else {
            $this->afterAdvance($room, $state);
            $room->state = $state;
        }
        return true;
    }

    /** 终局结算：排名、冠军、胜场 +1、事件。调用方负责后续 version++/save。 */
    private function finishGame(LudoRoom $room, array &$state, string $reason): void
    {
        $seats = $room->seats;
        $places = LudoRule::computePlaces($state, $seats);
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
        // lastEvent 用前端熟悉的扁平 shape（t/seat 与 uno 的 type/seat 同用途）
        $state['lastEvent'] = $event;
        return $state;
    }

    /** 活跃（未离开）座位数。 */
    private function activeSeats(array $state, array $seats): int
    {
        return count($seats) - count($state['leftSeats'] ?? []);
    }

    /** 下一阶段 deadline：定先手 10s；挂机玩家 5s，其余 20s。 */
    private function nextDeadline(array $state, array $seats): string
    {
        if (($state['phase'] ?? 'roll') === 'opening') {
            return date('Y-m-d H:i:s', time() + self::OPENING_SECONDS);
        }
        $seconds = self::TURN_SECONDS;
        $uid = (string) ($seats[(int) $state['currentSeat']] ?? 0);
        if ((int) ($state['idleStrikes'][$uid] ?? 0) >= self::IDLE_LIMIT) {
            $seconds = self::IDLE_TURN_SECONDS;
        }
        return date('Y-m-d H:i:s', time() + $seconds);
    }

    /**
     * 校验「轮到我、对局进行中、处于指定阶段」，返回 [seat, state]。
     *
     * @return array{0: int, 1: array<string, mixed>}
     */
    private function requireMyPhase(LudoRoom $room, int $userId, string $phase): array
    {
        $seat = $this->requireSeated($room, $userId);
        if ($room->status !== 'playing') {
            throw new BizException(422, '对局不在进行中');
        }
        $state = $room->state;
        if (in_array($seat, $state['leftSeats'] ?? [], true)) {
            throw new BizException(403, '你已离开本局');
        }
        if ((int) $state['currentSeat'] !== $seat) {
            throw new BizException(422, '还没轮到你');
        }
        if ((string) $state['phase'] !== $phase) {
            throw new BizException(422, $phase === 'roll' ? '先掷骰子' : '掷过骰子了，选一架飞机走');
        }
        return [$seat, $state];
    }

    /** 必须已入座（含游戏中途离开的），否则 403。 */
    private function requireSeated(LudoRoom $room, int $userId): int
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
    private function touchSeenAt(LudoRoom $room, int $userId): void
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
    private function lockByCode(string $code): LudoRoom
    {
        $room = LudoRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof LudoRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): LudoRoom
    {
        $room = LudoRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof LudoRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; $i++) {
            $code = (string) random_int(1000, 9999);
            $exists = LudoRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
