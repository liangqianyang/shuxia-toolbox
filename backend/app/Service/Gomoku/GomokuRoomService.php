<?php

declare(strict_types=1);

namespace App\Service\Gomoku;

use App\Exception\BizException;
use App\Model\GomokuRoom;
use App\Service\WechatUserService;
use Hyperf\DbConnection\Db;

/**
 * 联机五子棋房间：服务端权威，状态存 MySQL（重启不丢局）。
 *
 * 所有写操作走事务 + 行锁，杜绝双击/竞态分叉棋局；
 * 每次写操作提交后经 GomokuWsPusher 向房间内 WebSocket 连接广播最新状态。
 */
final class GomokuRoomService
{
    /** 房间闲置多久（秒）后懒清理。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 棋盘下满即和局。 */
    private const int MAX_MOVES = GomokuRule::SIZE * GomokuRule::SIZE;

    /** 每人每局悔棋次数上限（对方同意才扣）。 */
    public const int UNDO_LIMIT = 3;

    /** 悔棋请求决策时限（秒）：超时未同意即视为拒绝。 */
    public const int UNDO_DECISION_SECONDS = 5;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly GomokuWsPusher $pusher,
    ) {}

    /**
     * 创建房间：创建者可选执黑/执白，好友加入后坐对面空位。插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function create(int $userId, string $color = 'black'): array
    {
        GomokuRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId, $color) {
            $room = new GomokuRoom();
            $room->code = $this->newCode();
            $room->black_user_id = $color === 'white' ? 0 : $userId;
            $room->white_user_id = $color === 'white' ? $userId : 0;
            $room->status = 'waiting';
            $room->moves = [];
            $room->version = 1;
            $room->black_seen_at = $color === 'white' ? null : date('Y-m-d H:i:s');
            $room->white_seen_at = $color === 'white' ? date('Y-m-d H:i:s') : null;
            $room->save();
            return $room;
        });

        return $this->serialize($room, $userId);
    }

    /**
     * 加入房间：本人重进幂等返回原角色；有空位则入座开下；满房则为旁观者。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function join(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($room->black_user_id === $userId || $room->white_user_id === $userId) {
                $this->touchSeenAt($room, $userId);
                return $room;
            }
            if ($room->status === 'waiting' && ($room->black_user_id === 0 || $room->white_user_id === 0)) {
                if ($room->black_user_id === 0) {
                    $room->black_user_id = $userId;
                    $room->black_seen_at = date('Y-m-d H:i:s');
                } else {
                    $room->white_user_id = $userId;
                    $room->white_seen_at = date('Y-m-d H:i:s');
                }
                $room->status = 'playing';
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
     * 落子：校验回合与落点，命中五连则终局。返回最新完整状态。
     *
     * @return array<string, mixed>
     */
    public function move(string $code, int $userId, int $x, int $y): array
    {
        $room = Db::transaction(function () use ($code, $userId, $x, $y) {
            $room = $this->lockByCode($code);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            if (GomokuRule::turnFromMoves($room->moves) !== $role) {
                throw new BizException(422, '还没轮到你');
            }
            // 悔棋请求未明确同意/拒绝前，禁止落子；超过决策时限的请求视为已拒绝，放行并清掉
            if ($room->undo_pending !== null) {
                if ($this->undoPendingFresh($room)) {
                    throw new BizException(422, '对方请求悔棋，请先处理');
                }
                $room->undo_pending = null;
                $room->undo_pending_at = null;
            }
            $board = GomokuRule::boardFromMoves($room->moves);
            $error = GomokuRule::validateMove($board, $x, $y);
            if ($error !== null) {
                throw new BizException(422, $error === 'occupied' ? '这里已经有子了' : '落点超出棋盘');
            }

            $moves = $room->moves;
            $moves[] = ['x' => $x, 'y' => $y];
            $room->moves = $moves;
            $board[$y][$x] = $role === 'black' ? GomokuRule::BLACK : GomokuRule::WHITE;

            $winLine = GomokuRule::findWinLine($board, $x, $y, $board[$y][$x]);
            if ($winLine !== null) {
                $room->status = 'finished';
                $room->winner = $role;
                $room->win_line = $winLine;
                $room->win_reason = 'five';
            } elseif (count($moves) >= self::MAX_MOVES) {
                $room->status = 'finished';
                $room->winner = null;
                $room->win_line = null;
                $room->win_reason = 'draw';
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
     * 发起悔棋请求：仅「刚落完子、轮到对方」时可发起（撤回自己最后一子），需对方同意。
     *
     * @return array<string, mixed>
     */
    public function requestUndo(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            if ($room->undo_pending !== null && $this->undoPendingFresh($room)) {
                throw new BizException(422, '已有待处理的悔棋请求');
            }
            $remaining = $role === 'black' ? $room->undo_black : $room->undo_white;
            if ($remaining <= 0) {
                throw new BizException(422, '悔棋次数已用完');
            }
            if ($room->moves === [] || GomokuRule::turnFromMoves($room->moves) !== $this->opponentOf($role)) {
                throw new BizException(422, '只能撤回自己刚落的子');
            }
            $room->undo_pending = $role;
            $room->undo_pending_at = date('Y-m-d H:i:s');
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 对方回应悔棋请求：同意则撤回请求方最后一子并扣次数，拒绝则仅清除请求。
     *
     * @return array<string, mixed>
     */
    public function respondUndo(string $code, int $userId, bool $accept): array
    {
        $room = Db::transaction(function () use ($code, $userId, $accept) {
            $room = $this->lockByCode($code);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            $pending = $room->undo_pending;
            if ($pending === null || $pending === $role) {
                throw new BizException(422, '没有待处理的悔棋请求');
            }
            if (! $this->undoPendingFresh($room)) {
                $room->undo_pending = null;
                $room->undo_pending_at = null;
                $room->version++;
                $room->save();
                throw new BizException(422, '悔棋请求已过期，视为对方拒绝');
            }
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            if ($accept) {
                // 请求方最后一子仍是盘面上最后一手（未被新落子顶掉）才可撤回
                if (GomokuRule::turnFromMoves($room->moves) !== $role) {
                    throw new BizException(422, '棋局已变化，悔棋请求已失效');
                }
                $moves = $room->moves;
                array_pop($moves);
                $room->moves = $moves;
                if ($pending === 'black') {
                    $room->undo_black--;
                } else {
                    $room->undo_white--;
                }
            }
            $room->undo_pending = null;
            $room->undo_pending_at = null;
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 再来一局：终局后由任一入座玩家发起，清空棋局并交换黑白。
     *
     * @return array<string, mixed>
     */
    public function rematch(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($this->seatedRole($room, $userId) === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'finished') {
                throw new BizException(422, '对局结束后才能再来一局');
            }
            [$room->black_user_id, $room->white_user_id] = [$room->white_user_id, $room->black_user_id];
            $room->moves = [];
            $room->winner = null;
            $room->win_line = null;
            $room->win_reason = null;
            $room->undo_black = self::UNDO_LIMIT;
            $room->undo_white = self::UNDO_LIMIT;
            $room->undo_pending = null;
            $room->undo_pending_at = null;
            $room->status = 'playing';
            $now = date('Y-m-d H:i:s');
            $room->black_seen_at = $now;
            $room->white_seen_at = $now;
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待中直接关房；对局中算对方获胜（逃跑判负）。
     *
     * @return array<string, mixed>
     */
    public function leave(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $role = $this->seatedRole($room, $userId);
            if ($role === null || $room->status === 'finished' || $room->status === 'closed') {
                return $room;
            }
            if ($room->status === 'waiting') {
                $room->status = 'closed';
            } else {
                $room->status = 'finished';
                $room->winner = $role === 'black' ? 'white' : 'black';
                $room->win_reason = 'forfeit';
            }
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /** 序列化为对外状态；HTTP 接口与 WS 推送共用同一 shape。 */
    public function serialize(GomokuRoom $room, int $requesterId): array
    {
        $moves = $room->moves ?? [];
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $myRole = $this->seatedRole($room, $requesterId) ?? 'spectator';
        // 超过决策时限的悔棋请求对外一律视为已失效（惰性过期，不落库不 bump version）
        $pending = $this->undoPendingFresh($room) ? $room->undo_pending : null;
        $pendingTtl = $pending === null ? 0 : max(1, self::UNDO_DECISION_SECONDS - (time() - (int) strtotime((string) $room->undo_pending_at)));

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'myRole' => $myRole,
            'turn' => $room->status === 'playing' ? GomokuRule::turnFromMoves($moves) : null,
            'moves' => $moves,
            'movesCount' => count($moves),
            'lastMove' => $moves === [] ? null : $moves[count($moves) - 1],
            'winner' => $room->winner,
            'winLine' => $room->win_line,
            'winReason' => $room->win_reason,
            'undo' => [
                'remaining' => ['black' => $room->undo_black, 'white' => $room->undo_white],
                'pending' => $pending,
                'pendingTtl' => $pendingTtl,
                'pendingMine' => $pending !== null && $pending === $myRole,
                'limit' => self::UNDO_LIMIT,
            ],
            'black' => $this->playerCard($room->black_user_id, $room->black_seen_at, $onlineIds),
            'white' => $this->playerCard($room->white_user_id, $room->white_seen_at, $onlineIds),
            'sharePath' => '/pages/gomoku/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（每个连接按自己视角序列化）。 */
    private function broadcast(GomokuRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn (int $userId): array => $this->serialize($room, $userId));
    }

    /** 房间内某用户的座位色；旁观/空位返回 null。 */
    private function seatedRole(GomokuRoom $room, int $userId): ?string
    {
        if ($userId > 0 && $room->black_user_id === $userId) {
            return 'black';
        }
        if ($userId > 0 && $room->white_user_id === $userId) {
            return 'white';
        }
        return null;
    }

    /**
     * @param array<int, int> $onlineIds WS 在线用户 id 列表
     * @return null|array{nickname: string, avatarUrl: string, online: bool}
     */
    private function playerCard(int $userId, ?string $seenAt, array $onlineIds): ?array
    {
        if ($userId <= 0) {
            return null;
        }
        $profile = $this->users->findUser($userId);
        $online = in_array($userId, $onlineIds, true)
            || ($seenAt !== null && strtotime($seenAt) >= time() - self::ONLINE_SECONDS);
        return [
            'nickname' => (string) ($profile['nickname'] ?? '棋友'),
            'avatarUrl' => (string) ($profile['avatarUrl'] ?? ''),
            'online' => $online,
        ];
    }

    /** 未决悔棋请求是否仍在决策时限内。 */
    private function undoPendingFresh(GomokuRoom $room): bool
    {
        if ($room->undo_pending === null || $room->undo_pending_at === null) {
            return false;
        }
        return (int) strtotime((string) $room->undo_pending_at) >= time() - self::UNDO_DECISION_SECONDS;
    }

    /** 对方的座位色。 */
    private function opponentOf(string $role): string
    {
        return $role === 'black' ? 'white' : 'black';
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version，避免心跳搅动同步计数。 */
    private function touchSeenAt(GomokuRoom $room, int $userId): void
    {
        $now = date('Y-m-d H:i:s');
        if ($room->black_user_id === $userId) {
            $room->black_seen_at = $now;
        } elseif ($room->white_user_id === $userId) {
            $room->white_seen_at = $now;
        } else {
            return;
        }
        $room->save();
    }

    /** 取活跃房间（行锁，事务内使用）；不存在/已关闭抛 404。 */
    private function lockByCode(string $code): GomokuRoom
    {
        $room = GomokuRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof GomokuRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): GomokuRoom
    {
        $room = GomokuRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof GomokuRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; $i++) {
            $code = (string) random_int(1000, 9999);
            $exists = GomokuRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
