<?php

declare(strict_types=1);

namespace App\Service\Uno;

use App\Exception\BizException;
use App\Model\UnoRoom;
use App\Service\WechatUserService;
use Hyperf\DbConnection\Db;

/**
 * UNO 联机房间：服务端权威，完整对局快照存 MySQL（重启不丢局）。
 *
 * 所有写操作走事务 + 行锁，杜绝双击/竞态分叉牌局；
 * 每次写操作提交后经 UnoWsPusher 向房间内 WebSocket 连接广播最新状态，
 * 每个连接按自己视角序列化——手牌/牌堆等隐藏信息绝不发给他人。
 *
 * 回合计时：写 turn_deadline_at，到期由两层机制推进（无 cron）——
 * 1) 本类写操作前的懒检查 applyDueTimeoutIfNeeded（任何请求路过顺手推进）；
 * 2) UnoTurnSweepListener 的 Swoole Timer 每秒扫到期房间（WS 模式下客户端不轮询，必须有主动推进）。
 */
final class UnoRoomService
{
    /** 房间闲置多久（秒）后懒清理。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 普通回合时限（秒）：超时自动摸 1 张并跳过。 */
    public const int TURN_SECONDS = 30;

    /** wild4 质疑窗口（秒）：超时视为放弃质疑。 */
    public const int CHALLENGE_SECONDS = 15;

    /** 剩 1 张未喊 UNO 的自喊宽限（秒）：宽限内只接受本人补喊，之后任何人可举报。 */
    public const int UNO_SELF_SECONDS = 5;

    /** 连续超时多少次进入挂机（挂机回合 5s 自动摸牌，任何真实操作解除）。 */
    public const int IDLE_LIMIT = 3;

    /** 挂机回合时限（秒）。 */
    public const int IDLE_TURN_SECONDS = 5;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly UnoWsPusher $pusher,
    ) {}

    /**
     * 创建房间：创建者坐 0 号位（房主），插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed> 完整房间状态（本人视角）
     */
    public function create(int $userId): array
    {
        UnoRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new UnoRoom();
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
     * 加入房间：本人重进幂等；等待中且未满 10 人则入座；满员/已开局为旁观者。
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
            if ($room->status === 'waiting' && count($room->seats) < UnoRule::MAX_PLAYERS) {
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
     * 开局：仅房主（0 号位），2-10 人。发牌、翻首张、写回合计时。
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
            $state = UnoRule::setupGame($room->seats);
            // 保留等待期间累计的分数
            foreach (($room->state['scores'] ?? []) as $uid => $score) {
                $state['scores'][(string) $uid] = (int) $score;
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
     * 出牌：wild/wild4 必须带 chosenColor；剩 1 张时 declaredUno=false 会进入可举报窗口。
     *
     * @return array<string, mixed>
     */
    public function play(string $code, int $userId, string $card, ?string $chosenColor, bool $declaredUno): array
    {
        $card = trim($card);
        if (! UnoRule::isValidCard($card)) {
            throw new BizException(422, '无效的牌');
        }
        if (UnoRule::isWild($card) && ! in_array($chosenColor, UnoRule::COLORS, true)) {
            throw new BizException(422, '出百搭牌必须选择颜色');
        }

        $room = Db::transaction(function () use ($code, $userId, $card, $chosenColor, $declaredUno) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state] = $this->requireMyTurn($room, $userId);
            $seats = $room->seats;
            $uid = (string) $userId;

            $hand = $state['hands'][$uid] ?? [];
            if (! in_array($card, $hand, true)) {
                throw new BizException(422, '这张牌不在你手上');
            }
            $top = end($state['discard']);
            if (($state['drawStack'] ?? null) !== null) {
                // 加牌叠加：只能出 +2/+4 继续叠（任意颜色），否则去摸累计牌
                $v = UnoRule::cardValue($card);
                if ($v !== 'D' && $v !== 'F') {
                    throw new BizException(422, '对方出了加牌，你只能出 +2/+4 叠加，或点牌堆全摸');
                }
            } elseif (! UnoRule::canPlay($card, (string) $top, (string) $state['currentColor'])) {
                throw new BizException(422, '这张牌出不了：颜色或数字要匹配');
            }

            $result = UnoRule::applyPlay($state, $seats, $seat, $card, $chosenColor);
            $state = $result['state'];

            if ($result['win']) {
                $settle = UnoRule::settleRound($state, $seats, $seat);
                foreach ($settle['roundScores'] as $suid => $score) {
                    $state['scores'][(string) $suid] = ($state['scores'][(string) $suid] ?? 0) + $score;
                }
                $state['roundScores'] = $settle['roundScores'];
                $state['handValues'] = $settle['handValues'];
                $room->status = 'finished';
                $room->winner_user_id = $seats[$seat];
                $room->win_reason = 'cards';
                $room->turn_deadline_at = null;
            } else {
                if ($result['needsUnoCheck']) {
                    if ($declaredUno) {
                        $state['unoDeclared'][] = $seat;
                        $result['event']['unoDeclared'] = true; // 出牌同时喊了 UNO，前端据此播 UNO 音效
                    } else {
                        $state['unoVulnerable'] = ['seat' => $seat, 'at' => time()];
                    }
                }
                $state['idleStrikes'][$uid] = 0; // 真实操作，解除挂机
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
            }
            $state['lastEvent'] = $result['event'];
            $state['unoDeclared'] = $this->pruneUnoDeclared($state, $seats);

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
     * 摸牌：玩家自主决定何时摸（手上有能出的牌也可以摸）；摸完后本轮可出任意能出的牌
     * （不限于摸到的），也可直接选择不出（pass）。drawnCard 仅作前端「新摸的牌」标记。
     * 若有累计加牌（drawStack），摸牌 = 吃掉全部累计加牌并跳过（叠加规则）。
     *
     * @return array<string, mixed>
     */
    public function draw(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [$seat, $state] = $this->requireMyTurn($room, $userId);

            $stackCount = (int) ($state['drawStack']['count'] ?? 0);
            if ($stackCount > 0) {
                // 叠加加牌：全摸并跳过
                $uid = (string) $userId;
                foreach (UnoRule::drawCards($state, $stackCount) as $c) {
                    $state['hands'][$uid][] = $c;
                }
                $state['drawStack'] = null;
                $state['drawnCard'] = null;
                $state['unoVulnerable'] = null;
                $state['currentSeat'] = UnoRule::advanceSeat($state, $room->seats, 1);
                $state['lastEvent'] = ['type' => 'stack_draw', 'seat' => $seat, 'count' => $stackCount];
                $state['idleStrikes'][$uid] = 0;
                $state['unoDeclared'] = $this->pruneUnoDeclared($state, $room->seats);
                $room->turn_deadline_at = $this->nextDeadline($state, $room->seats);
                $room->state = $state;
                $this->touchSeenAt($room, $userId);
                $room->version++;
                $room->save();
                return $room;
            }

            if (($state['drawnCard'] ?? null) !== null) {
                throw new BizException(422, '已经摸过了，请选择出牌或不出');
            }

            $result = UnoRule::applyDraw($state, $room->seats, $seat);
            $state = $result['state'];
            $state['idleStrikes'][(string) $userId] = 0;
            $state['unoDeclared'] = $this->pruneUnoDeclared($state, $room->seats);
            // 摸牌不推进回合、不重置计时，由玩家自己决定出哪张或不出
            $state['lastEvent'] = $result['event'];

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
     * 摸牌后放弃出牌，回合推进。
     *
     * @return array<string, mixed>
     */
    public function pass(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            [, $state] = $this->requireMyTurn($room, $userId);
            if (($state['drawnCard'] ?? null) === null) {
                throw new BizException(422, '只有摸牌后才能选择不出');
            }

            $result = UnoRule::applyPass($state, $room->seats);
            $state = $result['state'];
            $state['lastEvent'] = $result['event'];
            $state['idleStrikes'][(string) $userId] = 0;

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
     * 首张翻到变色牌时，首位玩家选择开局颜色（官方规则）。
     *
     * @return array<string, mixed>
     */
    public function chooseColor(string $code, int $userId, string $color): array
    {
        if (! in_array($color, UnoRule::COLORS, true)) {
            throw new BizException(422, '颜色不正确');
        }

        $room = Db::transaction(function () use ($code, $userId, $color) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $pending = $state['pendingColorPick'] ?? null;
            if ($pending === null) {
                throw new BizException(422, '现在不需要选色');
            }
            if ((int) $pending['seat'] !== $seat) {
                throw new BizException(422, '只有首位玩家能选开局颜色');
            }
            $state['currentColor'] = $color;
            $state['pendingColorPick'] = null;
            $state['lastEvent'] = ['type' => 'color_pick', 'seat' => $seat, 'color' => $color];

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
     * wild4 质疑：仅被 +4 的下家在窗口内可发起。
     *
     * @return array<string, mixed>
     */
    public function challenge(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $pending = $state['pendingWild4'] ?? null;
            if ($pending === null) {
                throw new BizException(422, '没有可质疑的 +4');
            }
            if ((int) $pending['toSeat'] !== $seat) {
                throw new BizException(422, '只有被 +4 的玩家能质疑');
            }

            $result = UnoRule::resolveWild4($state, $room->seats, true);
            $state = $result['state'];
            $state['lastEvent'] = $result['event'];

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
     * 不质疑 +4：被 +4 的下家主动放弃质疑，立即摸 4 张并跳过（同超时结算）。
     *
     * @return array<string, mixed>
     */
    public function declineChallenge(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $this->applyDueTimeoutIfNeeded($room, $userId);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $pending = $state['pendingWild4'] ?? null;
            if ($pending === null) {
                throw new BizException(422, '没有可处理的 +4');
            }
            if ((int) $pending['toSeat'] !== $seat) {
                throw new BizException(422, '只有被 +4 的玩家能操作');
            }

            $result = UnoRule::resolveWild4($state, $room->seats, false);
            $state = $result['state'];
            $state['lastEvent'] = $result['event'];

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
     * 喊 UNO：剩 1 张时补喊，清除可举报窗口。
     *
     * @return array<string, mixed>
     */
    public function declareUno(string $code, int $userId): array
    {
        $changed = false;
        $room = Db::transaction(function () use ($code, $userId, &$changed) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $handCount = count($state['hands'][(string) $userId] ?? []);
            if ($handCount !== 1) {
                throw new BizException(422, '只剩 1 张牌时才需要喊 UNO');
            }
            $changed = false;
            $vuln = $state['unoVulnerable'] ?? null;
            if ($vuln !== null && (int) $vuln['seat'] === $seat) {
                $state['unoVulnerable'] = null;
                $changed = true;
            }
            if (! in_array($seat, $state['unoDeclared'], true)) {
                $state['unoDeclared'][] = $seat;
                $state['lastEvent'] = ['type' => 'uno', 'seat' => $seat];
                $changed = true;
            }
            if ($changed) {
                $room->state = $state;
                $room->version++;
                $room->save();
            }
            return $room;
        });

        $state = $this->serialize($room, $userId);
        if ($changed) {
            $this->broadcast($room);
        }
        return $state;
    }

    /**
     * 举报未喊 UNO：3s 自喊宽限后、下家行动前有效，罚摸 2 张。
     *
     * @return array<string, mixed>
     */
    public function catchUno(string $code, int $userId, int $targetSeat): array
    {
        $room = Db::transaction(function () use ($code, $userId, $targetSeat) {
            $room = $this->lockByCode($code);
            $seat = $this->requireSeated($room, $userId);
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            $state = $room->state;
            $vuln = $state['unoVulnerable'] ?? null;
            if ($vuln === null || (int) $vuln['seat'] !== $targetSeat) {
                throw new BizException(422, '对方没有被举报的时机');
            }
            if ($targetSeat === $seat) {
                throw new BizException(422, '不能举报自己');
            }
            if (time() - (int) $vuln['at'] < self::UNO_SELF_SECONDS) {
                throw new BizException(422, '对方还有时间补喊');
            }

            $result = UnoRule::applyUnoPenalty($state, $room->seats, $targetSeat, $seat);
            $state = $result['state'];
            $state['lastEvent'] = $result['event'];

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
     * 再来一局：终局后由任一入座玩家发起，中途离开者不带回，累计分保留。
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
            $state = UnoRule::setupGame($seats);
            foreach ($seats as $uid) {
                $state['scores'][(string) $uid] = (int) ($oldState['scores'][(string) $uid] ?? 0);
            }
            $room->seats = array_values($seats);
            $room->state = $state;
            $room->status = 'playing';
            $room->winner_user_id = null;
            $room->win_reason = null;
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
     * 离开房间：等待中移出座位（房主走则顺延，空房关闭）；
     * 对局中若还剩 2 人以上则标记离开、手牌洗入牌堆、跳过之，否则对手逃跑胜。
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
            } elseif (UnoRule::activePlayerCount($state, $seats) <= 2) {
                // 只剩 2 人时离开 = 逃跑判负
                foreach ($seats as $i => $uid) {
                    if ($i !== $seat && ! in_array($i, $state['leftSeats'] ?? [], true)) {
                        $room->winner_user_id = $uid;
                        break;
                    }
                }
                $room->status = 'finished';
                $room->win_reason = 'forfeit';
                $room->turn_deadline_at = null;
                $state['lastEvent'] = ['type' => 'leave', 'seat' => $seat];
                $room->state = $state;
            } else {
                // 多人局：手牌洗入牌堆，座位标记离开，轮到则跳过
                $state['leftSeats'][] = $seat;
                $hand = $state['hands'][(string) $userId] ?? [];
                $state['deck'] = array_merge($state['deck'], $hand);
                UnoRule::shuffle($state['deck']);
                $state['hands'][(string) $userId] = [];
                if (($state['unoVulnerable']['seat'] ?? null) === $seat) {
                    $state['unoVulnerable'] = null;
                }
                if (($state['pendingWild4']['toSeat'] ?? null) === $seat) {
                    // 被 +4 的人走了：直接按未质疑结算给下家
                    $state['pendingWild4'] = null;
                }
                if ((int) $state['currentSeat'] === $seat) {
                    $state['currentSeat'] = UnoRule::advanceSeat($state, $seats, 1);
                    $room->turn_deadline_at = $this->nextDeadline($state, $seats);
                }
                $state['lastEvent'] = ['type' => 'leave', 'seat' => $seat];
                $state['unoDeclared'] = $this->pruneUnoDeclared($state, $seats);
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
     * Timer 清扫入口：把所有「进行中且回合已到期」的房间推进一格（自动摸牌跳过/质疑窗口结算）。
     * 返回推进的房间数。
     */
    public function sweepDueRooms(): int
    {
        $codes = UnoRoom::query()
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
            if ($room instanceof UnoRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /** 序列化为对外状态（按请求者视角裁剪隐藏信息）；HTTP 接口与 WS 推送共用同一 shape。 */
    public function serialize(UnoRoom $room, int $requesterId): array
    {
        $state = $room->state ?? [];
        $seats = $room->seats ?? [];
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $mySeat = $this->seatOf($seats, $requesterId);
        $playing = $room->status === 'playing';
        $seenAt = $room->seen_at ?? [];
        $leftSeats = $state['leftSeats'] ?? [];
        $idleStrikes = $state['idleStrikes'] ?? [];
        $unoDeclared = $state['unoDeclared'] ?? [];

        $players = [];
        foreach ($seats as $i => $uid) {
            $profile = $this->users->findUser((int) $uid);
            $handCount = $playing ? count($state['hands'][(string) $uid] ?? []) : 0;
            $players[] = [
                'seat' => $i,
                'userId' => (int) $uid,
                'nickname' => (string) ($profile['nickname'] ?? '牌友'),
                'avatarUrl' => (string) ($profile['avatarUrl'] ?? ''),
                'online' => in_array((int) $uid, $onlineIds, true)
                    || (isset($seenAt[(string) $uid]) && strtotime((string) $seenAt[(string) $uid]) >= time() - self::ONLINE_SECONDS),
                'left' => in_array($i, $leftSeats, true),
                'handCount' => $handCount,
                'unoDeclared' => $handCount === 1 && in_array($i, $unoDeclared, true),
                'idle' => (int) ($idleStrikes[(string) $uid] ?? 0) >= self::IDLE_LIMIT,
            ];
        }

        $pending = $state['pendingWild4'] ?? null;
        $challenge = null;
        if ($playing && $pending !== null) {
            $challenge = [
                'fromSeat' => (int) $pending['fromSeat'],
                'toSeat' => (int) $pending['toSeat'],
                'ttl' => max(0, self::CHALLENGE_SECONDS - (time() - (int) $pending['at'])),
                'mine' => $mySeat !== null && (int) $pending['toSeat'] === $mySeat,
            ];
        }

        $colorPickPending = $state['pendingColorPick'] ?? null;
        $colorPick = null;
        if ($playing && $colorPickPending !== null) {
            $colorPick = [
                'seat' => (int) $colorPickPending['seat'],
                'mine' => $mySeat !== null && (int) $colorPickPending['seat'] === $mySeat,
            ];
        }

        $vuln = $state['unoVulnerable'] ?? null;
        $uno = null;
        if ($playing && $vuln !== null) {
            $uno = [
                'seat' => (int) $vuln['seat'],
                'selfWindowTtl' => max(0, self::UNO_SELF_SECONDS - (time() - (int) $vuln['at'])),
                'mine' => $mySeat !== null && (int) $vuln['seat'] === $mySeat,
            ];
        }

        $drawn = $state['drawnCard'] ?? null;
        $discard = $state['discard'] ?? [];

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'mySeat' => $mySeat,
            'ownerSeat' => 0,
            'players' => $players,
            'currentSeat' => $playing ? (int) ($state['currentSeat'] ?? 0) : null,
            'direction' => (int) ($state['direction'] ?? 1),
            'turnTtl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'topCard' => $discard === [] ? null : (string) end($discard),
            'currentColor' => (string) ($state['currentColor'] ?? ''),
            'deckCount' => count($state['deck'] ?? []),
            'discardCount' => count($discard),
            'myHand' => $playing && $mySeat !== null ? array_values($state['hands'][(string) $requesterId] ?? []) : null,
            'drawnCard' => $drawn !== null && $mySeat !== null && (int) $drawn['seat'] === $mySeat ? (string) $drawn['card'] : null,
            'challenge' => $challenge,
            'colorPick' => $colorPick,
            'drawStack' => isset($state['drawStack']['count']) ? ['count' => (int) $state['drawStack']['count']] : null,
            'uno' => $uno,
            'lastEvent' => $state['lastEvent'] ?? null,
            'winnerUserId' => $room->winner_user_id,
            'winReason' => $room->win_reason,
            'scores' => $state['scores'] ?? [],
            'roundScores' => $state['roundScores'] ?? null,
            'handValues' => $state['handValues'] ?? null,
            'sharePath' => '/pages/uno/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（每个连接按自己视角序列化）。 */
    private function broadcast(UnoRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn (int $userId): array => $this->serialize($room, $userId));
    }

    /**
     * 懒超时推进（事务内、已持行锁）：回合/质疑窗口到期则结算一次。返回是否有推进。
     * $exceptUserId：若到期的正是请求者本人（人来了），不扫掉其回合，改为刷新 deadline 放行——
     * 否则「懒推进 → 回滚 → 再请求再推进」会把一个活跃玩家软锁在 422 循环里。
     */
    private function applyDueTimeoutIfNeeded(UnoRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->status !== 'playing' || $room->turn_deadline_at === null) {
            return false;
        }
        if (strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $state = $room->state;
        $seats = $room->seats;
        if ($exceptUserId !== null) {
            $pending = $state['pendingWild4'] ?? $state['pendingColorPick'] ?? null;
            $affectedSeat = $pending !== null
                ? (int) ($pending['toSeat'] ?? $pending['seat'])
                : (int) $state['currentSeat'];
            if ((int) ($seats[$affectedSeat] ?? 0) === $exceptUserId) {
                $room->turn_deadline_at = $this->nextDeadline($state, $seats);
                return false;
            }
        }
        if (($state['pendingColorPick'] ?? null) !== null) {
            // 开局选色超时：随机选色（与变色牌超时语义一致）
            $pickSeat = (int) $state['pendingColorPick']['seat'];
            $color = UnoRule::COLORS[random_int(0, 3)];
            $state['currentColor'] = $color;
            $state['pendingColorPick'] = null;
            $result = ['state' => $state, 'event' => ['type' => 'color_pick', 'seat' => $pickSeat, 'color' => $color, 'auto' => true]];
            $state = $result['state'];
            $uid = (string) $seats[$pickSeat];
            $state['idleStrikes'][$uid] = (int) ($state['idleStrikes'][$uid] ?? 0) + 1;
        } elseif (($state['pendingWild4'] ?? null) !== null) {
            $result = UnoRule::resolveWild4($state, $seats, false);
        } else {
            $result = UnoRule::applyTimeoutDraw($state, $seats);
            $uid = (string) $seats[(int) $result['event']['seat']];
            $state = $result['state'];
            $state['idleStrikes'][$uid] = (int) ($state['idleStrikes'][$uid] ?? 0) + 1;
        }
        $state = $result['state'];
        $state['lastEvent'] = $result['event'];
        $state['unoDeclared'] = $this->pruneUnoDeclared($state, $seats);
        $room->state = $state;
        $room->turn_deadline_at = $this->nextDeadline($state, $seats);
        return true;
    }

    /** 下一个 deadline：质疑窗口 10s；挂机玩家 5s；其余 20s。 */
    private function nextDeadline(array $state, array $seats): string
    {
        $seconds = self::TURN_SECONDS;
        if (($state['pendingWild4'] ?? null) !== null) {
            $seconds = self::CHALLENGE_SECONDS;
        } else {
            $uid = (string) ($seats[(int) $state['currentSeat']] ?? 0);
            if ((int) ($state['idleStrikes'][$uid] ?? 0) >= self::IDLE_LIMIT) {
                $seconds = self::IDLE_TURN_SECONDS;
            }
        }
        return date('Y-m-d H:i:s', time() + $seconds);
    }

    /**
     * 校验「轮到我且对局进行中、无未决质疑窗口」，返回 [seat, state]。
     *
     * @return array{0: int, 1: array<string, mixed>}
     */
    private function requireMyTurn(UnoRoom $room, int $userId): array
    {
        $seat = $this->requireSeated($room, $userId);
        if ($room->status !== 'playing') {
            throw new BizException(422, '对局不在进行中');
        }
        $state = $room->state;
        if (in_array($seat, $state['leftSeats'] ?? [], true)) {
            throw new BizException(403, '你已离开本局');
        }
        if (($state['pendingColorPick'] ?? null) !== null) {
            throw new BizException(422, '等待首位玩家选择开局颜色');
        }
        if (($state['pendingWild4'] ?? null) !== null) {
            throw new BizException(422, '等待 +4 质疑结果');
        }
        if ((int) $state['currentSeat'] !== $seat) {
            throw new BizException(422, '还没轮到你');
        }
        return [$seat, $state];
    }

    /** 必须已入座（含游戏中途离开的），否则 403。 */
    private function requireSeated(UnoRoom $room, int $userId): int
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

    /** 清除手牌数已不是 1 的座位的「已喊 UNO」标记。 */
    private function pruneUnoDeclared(array $state, array $seats): array
    {
        $kept = [];
        foreach ($state['unoDeclared'] ?? [] as $seat) {
            $uid = (string) ($seats[$seat] ?? 0);
            if ($uid !== '0' && count($state['hands'][$uid] ?? []) === 1) {
                $kept[] = $seat;
            }
        }
        return $kept;
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version，避免心跳搅动同步计数。 */
    private function touchSeenAt(UnoRoom $room, int $userId): void
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
    private function lockByCode(string $code): UnoRoom
    {
        $room = UnoRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof UnoRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): UnoRoom
    {
        $room = UnoRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof UnoRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; $i++) {
            $code = (string) random_int(1000, 9999);
            $exists = UnoRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
