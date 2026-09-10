<?php

declare(strict_types=1);

namespace App\Service\Xiangqi;

use App\Exception\BizException;
use App\Model\XiangqiRoom;
use App\Service\Chat\GameChat;
use App\Service\FeatureFlagService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use RuntimeException;
use Hyperf\DbConnection\Db;

/**
 * 联机象棋房间：服务端权威，状态存 MySQL（重启不丢局）。
 *
 * 状态机 waiting → rps(10s，胜者执红先行) → playing(45s/步 超时代走) → finished。
 * 明棋无信息裁剪；将死/困毙判负；超时代走随机合法步，无合法步判负；
 * 写路径懒推进带请求者放行（防 422 软锁）。红黑只是座位标签，猜拳胜者执红。
 */
final class XiangqiRoomService
{
    /** 房间闲置多久（秒）后懒清理。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 猜拳定红黑：出拳窗口（秒）。 */
    public const int RPS_SECONDS = 10;

    /** 猜拳平局重出上限；超过后随机定胜者。 */
    public const int RPS_MAX_ROUNDS = 3;

    /** 每步走子窗口（秒），超时清扫器代走随机合法步。 */
    public const int MOVE_SECONDS = 45;

    /** 聊天冷却（秒）/ 环形保留条数。 */
    private const int CHAT_COOLDOWN_SECONDS = 3;

    public const int CHAT_KEEP = 50;

    /** 走子错误键 → 用户可读文案。 */
    private const array MOVE_ERRORS = [
        'out_of_range' => '落点超出棋盘',
        'no_piece' => '起点没有棋子',
        'not_yours' => '还不能动对方的棋子',
        'blocked_own' => '落点是自己的棋子',
        'illegal_move' => '这个走法不符合规则',
    ];

    /** 阵亡托盘排序（车马炮在前，按大子优先）。 */
    private const array TRAY_ORDER = ['r', 'h', 'c', 'e', 'a', 'p', 'k'];

    public function __construct(
        private readonly WechatUserService $users,
        private readonly XiangqiWsPusher $pusher,
        private readonly FeatureFlagService $flags,
        private readonly WechatContentSecurityService $security,
    ) {}

    /**
     * 创建房间：创建者临时坐红（猜拳前临时标签，胜者执红）。插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function create(int $userId): array
    {
        XiangqiRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new XiangqiRoom();
            $room->code = $this->newCode();
            $room->red_user_id = $userId;
            $room->blue_user_id = 0;
            $room->status = 'waiting';
            $room->pieces = XiangqiRule::standardPieces();
            $room->turn = null;
            $room->last_move = null;
            $room->last_event = null;
            $room->version = 1;
            $room->ply = 0;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = null;
            $room->turn_deadline_at = null;
            $room->red_seen_at = date('Y-m-d H:i:s');
            $room->black_seen_at = null;
            $room->save();
            return $room;
        });

        return $this->serialize($room, $userId);
    }

    /**
     * 加入房间：本人重进幂等；坐满即进入猜拳定红黑。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function join(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($room->red_user_id === $userId || $room->blue_user_id === $userId) {
                $this->touchSeenAt($room, $userId);
                return $room;
            }
            if ($room->status === 'waiting' && ($room->red_user_id === 0 || $room->blue_user_id === 0)) {
                if ($room->red_user_id === 0) {
                    $room->red_user_id = $userId;
                    $room->red_seen_at = date('Y-m-d H:i:s');
                } else {
                    $room->blue_user_id = $userId;
                    $room->black_seen_at = date('Y-m-d H:i:s');
                }
                // 双人坐满 → 猜拳定红黑（胜者执红先行）
                $room->status = 'rps';
                $room->rps = ['round' => 1, 'picks' => [], 'winner' => null];
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
     * 猜拳定红黑（rps 阶段）：双方各暗出一拳（r石头/p布/s剪刀），双方到齐即结算；
     * 平局重出（上限 RPS_MAX_ROUNDS 后随机定），胜者执红先行。
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
            $this->applyDueIfNeeded($room, $userId);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'rps') {
                throw new BizException(422, '不在猜拳阶段');
            }
            $rps = $room->rps;
            if (($rps['winner'] ?? null) !== null) {
                throw new BizException(422, '猜拳已分出胜负');
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
     * 走子：校验回合与规则（蹩马腿/塞象眼/炮架/对脸/应将），吃子即时结算；
     * 将死/困毙即终局。返回最新完整状态。
     *
     * @return array<string, mixed>
     */
    public function move(string $code, int $userId, int $fr, int $fc, int $tr, int $tc): array
    {
        $room = Db::transaction(function () use ($code, $userId, $fr, $fc, $tr, $tc) {
            $room = $this->lockByCode($code);
            $this->applyDueIfNeeded($room, $userId);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            if ((string) $room->turn !== $role) {
                throw new BizException(422, '还没轮到你');
            }
            $pieces = $room->pieces ?? [];
            $error = XiangqiRule::validateMove($pieces, $role, $fr, $fc, $tr, $tc);
            if ($error !== null) {
                throw new BizException(422, self::MOVE_ERRORS[$error] ?? '这步走不了');
            }

            $moverRank = (string) (XiangqiRule::pieceAt($pieces, $fr, $fc)['piece'] ?? 'p');
            $applied = XiangqiRule::applyMove($pieces, $fr, $fc, $tr, $tc);
            $nextPieces = $applied['pieces'];
            $captured = $applied['captured'];
            $room->pieces = $nextPieces;
            $room->ply = (int) $room->ply + 1;
            $room->last_move = ['fr' => $fr, 'fc' => $fc, 'tr' => $tr, 'tc' => $tc, 'captured' => $captured];

            // 战报 + 将军提示
            $opponent = $this->opponentOf($role);
            $mine = ($role === 'red' ? '红' : '黑') . XiangqiRule::PIECE_NAMES[$role][$moverRank];
            if ($captured !== null) {
                $text = $mine . ' 吃掉 ' . ($opponent === 'red' ? '红' : '黑') . XiangqiRule::PIECE_NAMES[$opponent][$captured];
                $this->setEvent($room, 'capture', $text);
            } else {
                $this->setEvent($room, 'move', $mine . ' 移动');
            }
            if (XiangqiRule::inCheck($nextPieces, $opponent)) {
                $prev = $room->last_event;
                $room->last_event = ['seq' => (int) ($prev['seq'] ?? 0) + 1, 'type' => 'check', 'text' => ($prev['text'] ?? '') . ' · 将军！'];
            }

            $winReason = null;
            if (! XiangqiRule::hasAnyLegalMove($nextPieces, $opponent)) {
                $winReason = XiangqiRule::inCheck($nextPieces, $opponent) ? 'checkmate' : 'stalemate';
            }
            if ($winReason !== null) {
                $room->status = 'finished';
                $room->winner = $role;
                $room->win_reason = $winReason;
                $this->setEvent($room, 'win', ($role === 'red' ? '红方' : '黑方') . ' ' . $this->winText($winReason));
            } else {
                $room->turn = $opponent;
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
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
     * Timer 清扫入口：把所有「rps/playing 且窗口已到期」的房间自动推进
     * （出拳到期代未出者随机出；走子到期代走随机合法步，无步判负）。返回推进的房间数。
     */
    public function sweepDueRooms(): int
    {
        $codes = XiangqiRoom::query()
            ->whereIn('status', ['rps', 'playing'])
            ->whereNotNull('turn_deadline_at')
            ->where('turn_deadline_at', '<=', date('Y-m-d H:i:s'))
            ->limit(50)
            ->pluck('code');
        $swept = 0;
        foreach ($codes as $code) {
            $room = Db::transaction(function () use ($code) {
                $room = $this->lockByCode((string) $code);
                if (! in_array($room->status, ['rps', 'playing'], true)
                    || $room->turn_deadline_at === null
                    || strtotime((string) $room->turn_deadline_at) > time()) {
                    return null;
                }
                if (! $this->applyDueIfNeeded($room)) {
                    return null;
                }
                $room->version++;
                $room->save();
                return $room;
            });
            if ($room instanceof XiangqiRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * 房间聊天：phrase / emoji / sticker / text（过审）。白名单是通用 GameChat；自由文字开关复用 feature.uno_chat_text。
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
     * 再来一局：终局后由任一入座玩家发起，重置标准开局并重新猜拳；聊天保留。
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
            $room->pieces = XiangqiRule::standardPieces();
            $room->turn = null;
            $room->last_move = null;
            $room->last_event = null;
            $room->ply = 0;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = ['round' => 1, 'picks' => [], 'winner' => null];
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
            $room->status = 'rps';
            $now = date('Y-m-d H:i:s');
            $room->red_seen_at = $now;
            $room->black_seen_at = $now;
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待/猜拳中直接关房；对局中算对方获胜（逃跑判负）。
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
            if (in_array($room->status, ['waiting', 'rps'], true)) {
                $room->status = 'closed';
            } else {
                $room->status = 'finished';
                $room->winner = $this->opponentOf($role);
                $room->win_reason = 'forfeit';
                $this->setEvent($room, 'forfeit', ($role === 'red' ? '红方' : '黑方') . '认输');
            }
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /** 序列化为对外状态；HTTP 接口与 WS 推送共用同一 shape。明棋全量可见。 */
    public function serialize(XiangqiRoom $room, int $requesterId): array
    {
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $myRole = $this->seatedRole($room, $requesterId) ?? 'spectator';

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'myRole' => $myRole,
            'turn' => $room->status === 'playing' ? (string) $room->turn : null,
            'pieces' => array_values($room->pieces ?? []),
            'trays' => $this->traysOf($room),
            'lastMove' => $room->last_move,
            'lastEvent' => $room->last_event,
            'ply' => (int) $room->ply,
            'ttl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'winner' => $room->winner,
            'winReason' => $room->win_reason,
            'red' => $this->playerCard($room->red_user_id, $room->red_seen_at, $onlineIds),
            'black' => $this->playerCard($room->blue_user_id, $room->black_seen_at, $onlineIds),
            'rps' => $this->serializeRps($room, $myRole),
            'chat' => array_values($room->chat ?? []),
            'chatSeq' => $this->chatSeqOf($room),
            'sharePath' => '/pages/xiangqi/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /**
     * 猜拳定红黑的对外结构（出拳期只给本人出拳；分出胜负瞬间亮双方）。phase: pick|done。
     *
     * @return null|array<string, mixed>
     */
    private function serializeRps(XiangqiRoom $room, string $myRole): ?array
    {
        $rps = $room->rps;
        if (! is_array($rps)) {
            return null;
        }
        $winner = $rps['winner'] ?? null;
        $inRps = $room->status === 'rps';
        if (! $inRps && $winner === null) {
            return null;
        }
        $picks = $rps['picks'] ?? [];
        $me = $myRole !== 'spectator' ? $myRole : null;
        return [
            'phase' => $inRps && $winner === null ? 'pick' : 'done',
            'round' => (int) ($rps['round'] ?? 1),
            'winner' => $winner,
            'myPick' => $me !== null ? ($picks[$me] ?? null) : null,
            'opponentPicked' => $me !== null ? isset($picks[$this->opponentOf($me)]) : (isset($picks['red']) && isset($picks['black'])),
            'picks' => $winner === null ? null : ['red' => $picks['red'] ?? null, 'black' => $picks['black'] ?? null],
            'lastPicks' => isset($rps['lastPicks']) ? ['red' => $rps['lastPicks']['red'] ?? null, 'black' => $rps['lastPicks']['black'] ?? null] : null,
            'myTurn' => $inRps && $me !== null && $winner === null && ! isset($picks[$me]),
        ];
    }

    /** 阵亡托盘（双方，按大子优先排序）。 */
    private function traysOf(XiangqiRoom $room): array
    {
        $order = array_flip(self::TRAY_ORDER);
        $trays = ['red' => [], 'black' => []];
        foreach ($room->pieces ?? [] as $piece) {
            if (! (bool) $piece['alive']) {
                $trays[$piece['side']][] = (string) $piece['piece'];
            }
        }
        foreach ($trays as $side => $types) {
            usort($types, static fn (string $a, string $b): int => ($order[$a] ?? 99) <=> ($order[$b] ?? 99));
            $trays[$side] = $types;
        }
        return $trays;
    }

    /** 聊天游标：最后一条的 seq（空为 0），客户端按 seq 增量出气泡。 */
    private function chatSeqOf(XiangqiRoom $room): int
    {
        $chat = $room->chat ?? [];
        return $chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0);
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（每个连接按自己视角序列化）。 */
    private function broadcast(XiangqiRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn (int $userId): array => $this->serialize($room, $userId));
    }

    /** 记录最近事件（播报条 + 音效用），seq 自增。 */
    private function setEvent(XiangqiRoom $room, string $type, string $text): void
    {
        $prev = $room->last_event;
        $room->last_event = [
            'seq' => (int) ($prev['seq'] ?? 0) + 1,
            'type' => $type,
            'text' => $text,
        ];
    }

    /**
     * 双方出拳到齐后结算：0石头/1布/2剪刀，a 胜 b ⟺ (a−b+3) mod 3 == 1；
     * 平局重出（清空双方出拳、轮数+1、亮上轮），超上限随机定；胜者执红先行。
     */
    private function resolveRps(XiangqiRoom $room): void
    {
        $rps = $room->rps;
        if (! isset($rps['picks']['red'], $rps['picks']['black'])) {
            return;
        }
        $pr = (int) $rps['picks']['red'];
        $pb = (int) $rps['picks']['black'];
        $winner = null;
        if ($pr !== $pb) {
            $winner = ((($pr - $pb) + 3) % 3) === 1 ? 'red' : 'black';
        } elseif ((int) $rps['round'] >= self::RPS_MAX_ROUNDS) {
            $winner = random_int(0, 1) === 0 ? 'red' : 'black';
        }
        if ($winner === null) {
            $rps['round'] = (int) $rps['round'] + 1;
            $rps['lastPicks'] = $rps['picks'];
            $rps['picks'] = [];
            $room->rps = $rps;
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
            return;
        }
        $rps['winner'] = $winner;
        $room->rps = $rps;
        $room->status = 'playing';
        $room->turn = $winner;
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
        $this->setEvent($room, 'rps_win', ($winner === 'red' ? '红方' : '黑方') . '猜拳获胜 · 先行');
    }

    /**
     * rps/playing 窗口到期的懒推进（事务内、已持行锁）。返回是否有推进。
     * $exceptUserId：到期待办正是请求者本人时刷新 deadline 放行——防 422 软锁。
     */
    private function applyDueIfNeeded(XiangqiRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->turn_deadline_at === null || strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $myRole = $exceptUserId !== null ? $this->seatedRole($room, $exceptUserId) : null;

        if ($room->status === 'rps') {
            $rps = $room->rps ?? [];
            if (($rps['winner'] ?? null) === null) {
                if ($myRole !== null && ! isset($rps['picks'][$myRole])) {
                    $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
                    return false;
                }
                foreach (['red', 'black'] as $r) {
                    if (! isset($rps['picks'][$r])) {
                        $rps['picks'][$r] = random_int(0, 2);
                    }
                }
                $room->rps = $rps;
                $this->resolveRps($room);
                return true;
            }
            return false;
        }

        if ($room->status === 'playing') {
            $turn = (string) $room->turn;
            if ($myRole !== null && $myRole === $turn) {
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
                return false;
            }
            $this->autoMoveFor($room, $turn);
            return true;
        }
        return false;
    }

    /** 代走随机合法步（清扫器超时兜底）。无合法步判负（将死/困毙）。 */
    private function autoMoveFor(XiangqiRoom $room, string $side): void
    {
        $pieces = $room->pieces ?? [];
        $choices = [];
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $side || ! (bool) $piece['alive']) {
                continue;
            }
            foreach (XiangqiRule::legalTargets($pieces, $side, (int) $piece['r'], (int) $piece['c']) as [$tr, $tc]) {
                $choices[] = [(int) $piece['r'], (int) $piece['c'], $tr, $tc];
            }
        }
        if ($choices === []) {
            $room->status = 'finished';
            $room->winner = $this->opponentOf($side);
            $room->win_reason = XiangqiRule::inCheck($pieces, $side) ? 'checkmate' : 'stalemate';
            $this->setEvent($room, 'win', ($this->opponentOf($side) === 'red' ? '红方' : '黑方') . ' ' . $this->winText($room->win_reason));
            return;
        }
        [$fr, $fc, $tr, $tc] = $choices[random_int(0, count($choices) - 1)];
        $moverRank = (string) (XiangqiRule::pieceAt($pieces, $fr, $fc)['piece'] ?? 'p');
        $applied = XiangqiRule::applyMove($pieces, $fr, $fc, $tr, $tc);
        $nextPieces = $applied['pieces'];
        $captured = $applied['captured'];
        $room->pieces = $nextPieces;
        $room->ply = (int) $room->ply + 1;
        $room->last_move = ['fr' => $fr, 'fc' => $fc, 'tr' => $tr, 'tc' => $tc, 'captured' => $captured];
        $opponent = $this->opponentOf($side);
        $mine = ($side === 'red' ? '红' : '黑') . XiangqiRule::PIECE_NAMES[$side][$moverRank];
        $this->setEvent($room, $captured !== null ? 'capture' : 'move', $captured !== null
            ? $mine . ' 吃掉 ' . ($opponent === 'red' ? '红' : '黑') . XiangqiRule::PIECE_NAMES[$opponent][$captured] . '（超时代走）'
            : $mine . ' 移动（超时代走）');
        $winReason = null;
        if (! XiangqiRule::hasAnyLegalMove($nextPieces, $opponent)) {
            $winReason = XiangqiRule::inCheck($nextPieces, $opponent) ? 'checkmate' : 'stalemate';
        }
        if ($winReason !== null) {
            $room->status = 'finished';
            $room->winner = $side;
            $room->win_reason = $winReason;
            $this->setEvent($room, 'win', ($side === 'red' ? '红方' : '黑方') . ' ' . $this->winText($winReason));
        } else {
            $room->turn = $opponent;
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
        }
    }

    private function winText(string $reason): string
    {
        return match ($reason) {
            'checkmate' => '将死获胜',
            'stalemate' => '困毙获胜',
            'forfeit' => '对方认输获胜',
            default => '获胜',
        };
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version，避免心跳搅动同步计数。 */
    private function touchSeenAt(XiangqiRoom $room, int $userId): void
    {
        $now = date('Y-m-d H:i:s');
        if ($room->red_user_id === $userId) {
            $room->red_seen_at = $now;
        } elseif ($room->blue_user_id === $userId) {
            $room->black_seen_at = $now;
        } else {
            return;
        }
        $room->save();
    }

    /** 房间内某用户的座位色（red/black）；旁观/空位返回 null。 */
    private function seatedRole(XiangqiRoom $room, int $userId): ?string
    {
        if ($userId > 0 && $room->red_user_id === $userId) {
            return 'red';
        }
        if ($userId > 0 && $room->blue_user_id === $userId) {
            return 'black';
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

    /** 对方的座位色。 */
    private function opponentOf(string $role): string
    {
        return $role === 'red' ? 'black' : 'red';
    }

    /** 取活跃房间（行锁，事务内使用）；不存在/已关闭抛 404。 */
    private function lockByCode(string $code): XiangqiRoom
    {
        $room = XiangqiRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof XiangqiRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): XiangqiRoom
    {
        $room = XiangqiRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof XiangqiRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; ++$i) {
            $code = (string) random_int(1000, 9999);
            $exists = XiangqiRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
