<?php

declare(strict_types=1);

namespace App\Service\Gomoku;

use App\Exception\BizException;
use App\Model\GomokuRoom;
use App\Service\Chat\GameChat;
use App\Service\FeatureFlagService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use RuntimeException;
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
    public const int UNDO_DECISION_SECONDS = 10;

    /** 猜拳定选边：出拳窗口（秒）。 */
    public const int RPS_SECONDS = 10;

    /** 猜拳平局重出上限；超过后随机定胜者（诚实 RNG 下几乎不可达）。 */
    public const int RPS_MAX_ROUNDS = 3;

    /** 胜者选边窗口（秒）：超时默认执黑。 */
    public const int RPS_CHOOSE_SECONDS = 8;

    /** 聊天冷却（秒）/ 环形保留条数（同 uno/冒险棋/飞行棋）。 */
    private const int CHAT_COOLDOWN_SECONDS = 3;

    public const int CHAT_KEEP = 50;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly GomokuWsPusher $pusher,
        private readonly FeatureFlagService $flags,
        private readonly WechatContentSecurityService $security,
    ) {}

    /**
     * 创建房间：创建者先临时坐黑（黑白只是猜拳前的标签），最终执子由开局猜拳定选边。
     * 插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function create(int $userId): array
    {
        GomokuRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new GomokuRoom();
            $room->code = $this->newCode();
            $room->black_user_id = $userId;
            $room->white_user_id = 0;
            $room->status = 'waiting';
            $room->moves = [];
            $room->version = 1;
            $room->rps = null;
            $room->turn_deadline_at = null;
            $room->black_seen_at = date('Y-m-d H:i:s');
            $room->white_seen_at = null;
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
                // 双人坐满 → 猜拳定选边（胜者选执黑/执白），选完才正式开局
                $room->status = 'rps';
                $room->rps = ['round' => 1, 'picks' => [], 'winner' => null, 'chosen' => null];
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
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
     * 猜拳定选边（rps 阶段）：双人各暗出一拳（r石头/p布/s剪刀），双方到齐即结算；
     * 平局重出（上限 RPS_MAX_ROUNDS 后随机定），胜者进入选边窗口。
     *
     * @return array<string, mixed>
     */
    public function rps(string $code, int $userId, string $pick): array
    {
        $map = ['r' => 0, 'p' => 1, 's' => 2];
        if (! isset($map[$pick])) {
            throw new BizException(422, '出拳不正确');
        }
        $room = Db::transaction(function () use ($code, $userId, $map, $pick) {
            $room = $this->lockByCode($code);
            $this->applyDueRpsIfNeeded($room, $userId);
            $role = $this->requireRpsRole($room, $userId);
            $rps = $room->rps;
            if (($rps['winner'] ?? null) !== null) {
                throw new BizException(422, '猜拳已分出胜负，等对方选边');
            }
            if (isset($rps['picks'][$role])) {
                throw new BizException(422, '你已经出过拳了');
            }
            $rps['picks'][$role] = $map[$pick];
            $room->rps = $rps;
            $this->resolveRps($room);
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
     * 胜者选边（rps 阶段）：选执黑先手或执白后手；超时未选默认执黑。
     *
     * @return array<string, mixed>
     */
    public function chooseColor(string $code, int $userId, string $color): array
    {
        if (! in_array($color, ['black', 'white'], true)) {
            throw new BizException(422, '颜色不正确');
        }
        $room = Db::transaction(function () use ($code, $userId, $color) {
            $room = $this->lockByCode($code);
            $this->applyDueRpsIfNeeded($room, $userId);
            $role = $this->requireRpsRole($room, $userId);
            $rps = $room->rps;
            if (($rps['winner'] ?? null) === null) {
                throw new BizException(422, '猜拳还没分出胜负');
            }
            if ($role !== $rps['winner']) {
                throw new BizException(422, '由猜拳胜者选边');
            }
            $this->applyColorChoice($room, $color);
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
     * Timer 清扫入口：把所有「rps 阶段且窗口已到期」的房间自动推进
     * （出拳期到 → 代未出者随机出并结算；选边期到 → 默认执黑开局）。返回推进的房间数。
     */
    public function sweepDueRpsRooms(): int
    {
        $codes = GomokuRoom::query()
            ->where('status', 'rps')
            ->whereNotNull('turn_deadline_at')
            ->where('turn_deadline_at', '<=', date('Y-m-d H:i:s'))
            ->limit(50)
            ->pluck('code');
        $swept = 0;
        foreach ($codes as $code) {
            $room = Db::transaction(function () use ($code) {
                $room = $this->lockByCode((string) $code);
                if ($room->status !== 'rps' || $room->turn_deadline_at === null
                    || strtotime((string) $room->turn_deadline_at) > time()) {
                    return null;
                }
                if (! $this->applyDueRpsIfNeeded($room)) {
                    return null;
                }
                $room->version++;
                $room->save();
                return $room;
            });
            if ($room instanceof GomokuRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * 房间聊天：phrase（快捷句 id）/ emoji（表情字符）/ sticker（贴纸 id）/ text（自由文字，过审）。
     * 白名单是通用 GameChat；自由文字开关复用 feature.uno_chat_text。等待/猜拳/对局/结算全程可用。
     *
     * @return array<string, mixed>
     */
    public function chat(string $code, int $userId, string $kind, ?string $id, ?string $text): array
    {
        if ($kind === 'phrase') {
            $content = GameChat::phraseText((string) $id);
            if ($content === null) {
                throw new BizException(422, '快捷句不存在');
            }
        } elseif ($kind === 'emoji') {
            $content = (string) $id;
            if (! GameChat::isEmoji($content)) {
                throw new BizException(422, '表情不存在');
            }
        } elseif ($kind === 'sticker') {
            $content = (string) $id;
            if (! GameChat::isSticker($content)) {
                throw new BizException(422, '贴纸不存在');
            }
        } elseif ($kind === 'text') {
            $this->flags->requireUnoChatTextEnabled();
            $content = trim((string) $text);
            $content = (string) preg_replace('/\s+/u', ' ', $content);
            if ($content === '') {
                throw new BizException(422, '消息不能为空');
            }
            if (mb_strlen($content) > GameChat::TEXT_MAX_LENGTH) {
                throw new BizException(422, '最多 ' . GameChat::TEXT_MAX_LENGTH . ' 个字');
            }
            $user = $this->users->findUser($userId);
            $openid = (string) ($user['openid'] ?? '');
            if ($openid === '') {
                throw new BizException(422, '账号信息缺失，发不出文字消息');
            }
            try {
                // fail-closed：审核接口异常时宁可拒发（事务外执行；审核外呼已协程化不冻结 worker）
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
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            $now = time();
            $lastAt = $room->chat_last_at ?? [];
            if ($now - (int) ($lastAt[(string) $userId] ?? 0) < self::CHAT_COOLDOWN_SECONDS) {
                throw new BizException(422, '发太快啦，歇一下');
            }
            $chat = $room->chat ?? [];
            $seq = ($chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0)) + 1;
            $chat[] = ['seq' => $seq, 'uid' => $userId, 'role' => $role, 'kind' => $kind, 'text' => $content, 'ts' => $now];
            if (count($chat) > self::CHAT_KEEP) {
                $chat = array_slice($chat, -self::CHAT_KEEP);
            }
            $lastAt[(string) $userId] = $now;
            $room->chat = $chat;
            $room->chat_last_at = $lastAt;
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
     * 再来一局：终局后由任一入座玩家发起，清空棋局并重新猜拳定选边
     * （黑白列只作猜拳前的临时标签，最终执子由胜者选边决定）。
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
            $room->moves = [];
            $room->winner = null;
            $room->win_line = null;
            $room->win_reason = null;
            $room->undo_black = self::UNDO_LIMIT;
            $room->undo_white = self::UNDO_LIMIT;
            $room->undo_pending = null;
            $room->undo_pending_at = null;
            $room->rps = ['round' => 1, 'picks' => [], 'winner' => null, 'chosen' => null];
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
            $room->status = 'rps';
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
            'rps' => $this->serializeRps($room, $myRole),
            'chat' => array_values($room->chat ?? []),
            'chatSeq' => $this->chatSeqOf($room),
            'sharePath' => '/pages/gomoku/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /**
     * 猜拳定选边的对外结构（视角裁剪：出拳期只给本人出拳，对方只给「已出/未出」；
     * 选边期起双方出拳公开；正式开局后保留 winner/picks/chosen 供前端结果定格）。
     *
     * @param string $myRole 'black'|'white'|'spectator'
     * @return null|array<string, mixed>
     */
    private function serializeRps(GomokuRoom $room, string $myRole): ?array
    {
        $rps = $room->rps;
        if (! is_array($rps)) {
            return null;
        }
        $winner = $rps['winner'] ?? null;
        $chosen = $rps['chosen'] ?? null;
        $inRps = $room->status === 'rps';
        if (! $inRps && $chosen === null) {
            return null; // 旧局数据 / 未进入猜拳
        }
        $picks = $rps['picks'] ?? [];
        $me = $myRole !== 'spectator' ? $myRole : null;
        $out = [
            'phase' => $inRps ? ($winner === null ? 'pick' : 'choose') : 'done',
            'round' => (int) ($rps['round'] ?? 1),
            'winner' => $winner,
            'chosen' => $chosen,
            'myPick' => $me !== null ? ($picks[$me] ?? null) : null,
            'opponentPicked' => $me !== null ? isset($picks[$this->opponentOf($me)]) : (isset($picks['black']) && isset($picks['white'])),
            // 双方出拳在选边期起公开（结算瞬间已同时亮出）；平局重出轮带出上轮结果
            'picks' => $winner === null ? null : ['black' => $picks['black'] ?? null, 'white' => $picks['white'] ?? null],
            'lastPicks' => isset($rps['lastPicks']) ? ['black' => $rps['lastPicks']['black'] ?? null, 'white' => $rps['lastPicks']['white'] ?? null] : null,
            'myTurn' => false,
            'ttl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
        ];
        if ($inRps && $me !== null) {
            $out['myTurn'] = $winner === null ? ! isset($picks[$me]) : $me === $winner;
        }
        return $out;
    }

    /** 聊天游标：最后一条的 seq（空为 0），客户端按 seq 增量出气泡。 */
    private function chatSeqOf(GomokuRoom $room): int
    {
        $chat = $room->chat ?? [];
        return $chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0);
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（每个连接按自己视角序列化）。 */
    private function broadcast(GomokuRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn(int $userId): array => $this->serialize($room, $userId));
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
            'nickname' => (string) (($profile['nickname'] ?? '') ?: '棋友'),
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

    /** 校验「已入座且处于 rps 阶段」，返回座位色。 */
    private function requireRpsRole(GomokuRoom $room, int $userId): string
    {
        $role = $this->seatedRole($room, $userId);
        if ($role === null) {
            throw new BizException(403, '你不是本局玩家');
        }
        if ($room->status !== 'rps') {
            throw new BizException(422, '不在猜拳定选边阶段');
        }
        return $role;
    }

    /**
     * 双方出拳到齐后结算：0石头/1布/2剪刀，a 胜 b ⟺ (a−b+3) mod 3 == 1；
     * 平局重出（清空双方出拳、轮数+1），超上限随机定；胜者进入选边窗口。
     * 调用方负责后续 version++/save；本方法负责写 rps 与 deadline。
     */
    private function resolveRps(GomokuRoom $room): void
    {
        $rps = $room->rps;
        if (! isset($rps['picks']['black'], $rps['picks']['white'])) {
            return; // 还有一方没出
        }
        $pb = (int) $rps['picks']['black'];
        $pw = (int) $rps['picks']['white'];
        $winner = null;
        if ($pb !== $pw) {
            $winner = ((($pb - $pw) + 3) % 3) === 1 ? 'black' : 'white';
        } elseif ((int) $rps['round'] >= self::RPS_MAX_ROUNDS) {
            $winner = random_int(0, 1) === 0 ? 'black' : 'white';
        }
        if ($winner === null) {
            $rps['round'] = (int) $rps['round'] + 1;
            $rps['lastPicks'] = $rps['picks']; // 平局亮拳：展示上轮「都是石头」再重出
            $rps['picks'] = [];
            $room->rps = $rps;
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
            return;
        }
        $rps['winner'] = $winner;
        $room->rps = $rps;
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_CHOOSE_SECONDS);
    }

    /**
     * 应用选边结果：胜者要的颜色若与当前临时座位不符则交换黑白列（连 seen_at 一起），
     * 进入正式对局；rps 保留 winner/picks/chosen 供前端展示定格。
     */
    private function applyColorChoice(GomokuRoom $room, string $color): void
    {
        $rps = $room->rps;
        $winner = (string) $rps['winner'];
        if ($winner !== $color) {
            [$room->black_user_id, $room->white_user_id] = [$room->white_user_id, $room->black_user_id];
            [$room->black_seen_at, $room->white_seen_at] = [$room->white_seen_at, $room->black_seen_at];
        }
        $rps['chosen'] = $color;
        $room->rps = $rps;
        $room->status = 'playing';
        $room->turn_deadline_at = null;
    }

    /**
     * rps 窗口到期的懒推进（事务内、已持行锁）。返回是否有推进。
     * $exceptUserId：若到期待办的正是请求者本人（还没出拳/还没选边），刷新 deadline 放行——
     * 防「懒推进 → 回滚 → 再请求再推进」把活跃玩家软锁在 422 循环。
     */
    private function applyDueRpsIfNeeded(GomokuRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->status !== 'rps' || $room->turn_deadline_at === null) {
            return false;
        }
        if (strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $rps = $room->rps ?? [];
        $phase = ($rps['winner'] ?? null) === null ? 'pick' : 'choose';
        if ($exceptUserId !== null) {
            $role = $this->seatedRole($room, $exceptUserId);
            $mineToDo = $role !== null
                && ($phase === 'pick' ? ! isset($rps['picks'][$role]) : $role === ($rps['winner'] ?? null));
            if ($mineToDo) {
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + ($phase === 'pick' ? self::RPS_SECONDS : self::RPS_CHOOSE_SECONDS));
                return false;
            }
        }
        if ($phase === 'pick') {
            // 出拳超时：代未出者随机出，然后照常结算（可能进入选边或平局重出）
            foreach (['black', 'white'] as $r) {
                if (! isset($rps['picks'][$r])) {
                    $rps['picks'][$r] = random_int(0, 2);
                }
            }
            $room->rps = $rps;
            $this->resolveRps($room);
        } else {
            // 选边超时：默认执黑
            $this->applyColorChoice($room, 'black');
        }
        return true;
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
