<?php

declare(strict_types=1);

namespace App\Service\Tictactoe;

use App\Exception\BizException;
use App\Model\TictactoeRoom;
use App\Service\Chat\GameChat;
use App\Service\FeatureFlagService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use RuntimeException;
use Hyperf\DbConnection\Db;

/**
 * 联机井字棋房间：服务端权威，状态存 MySQL。
 *
 * 状态机 waiting → rps(仅首局，10s，胜者执 X) → playing(20s/步 超时代落) → finished；
 * rematch 自动交换先后手（不再猜拳），scores 连绩跨局累计。
 * 明棋无信息裁剪；写路径懒推进带请求者放行；无合法落子不会发生（空格必可落）。
 */
final class TictactoeRoomService
{
    private const int STALE_SECONDS = 86400;

    private const int ONLINE_SECONDS = 60;

    /** 猜拳定 X：出拳窗口（秒）。 */
    public const int RPS_SECONDS = 10;

    public const int RPS_MAX_ROUNDS = 3;

    /** 每步落子窗口（秒），超时清扫器代落随机空格。 */
    public const int MOVE_SECONDS = 20;

    private const int CHAT_COOLDOWN_SECONDS = 3;

    public const int CHAT_KEEP = 50;

    public function __construct(
        private readonly WechatUserService $users,
        private readonly TictactoeWsPusher $pusher,
        private readonly FeatureFlagService $flags,
        private readonly WechatContentSecurityService $security,
    ) {}

    /**
     * 创建房间：创建者临时坐 X（猜拳前临时标签，胜者执 X）。
     *
     * @return array<string, mixed>
     */
    public function create(int $userId): array
    {
        TictactoeRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new TictactoeRoom();
            $room->code = $this->newCode();
            $room->x_user_id = $userId;
            $room->o_user_id = 0;
            $room->status = 'waiting';
            $room->board = array_fill(0, 9, null);
            $room->turn = null;
            $room->scores = ['x' => 0, 'o' => 0, 'draw' => 0];
            $room->win_line = null;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = null;
            $room->turn_deadline_at = null;
            $room->version = 1;
            $room->last_event = null;
            $room->x_seen_at = date('Y-m-d H:i:s');
            $room->o_seen_at = null;
            $room->save();
            return $room;
        });

        return $this->serialize($room, $userId);
    }

    /**
     * 加入房间：坐满即进入首局猜拳定 X。
     *
     * @return array<string, mixed>
     */
    public function join(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($room->x_user_id === $userId || $room->o_user_id === $userId) {
                $this->touchSeenAt($room, $userId);
                return $room;
            }
            if ($room->status === 'waiting' && ($room->x_user_id === 0 || $room->o_user_id === 0)) {
                if ($room->x_user_id === 0) {
                    $room->x_user_id = $userId;
                    $room->x_seen_at = date('Y-m-d H:i:s');
                } else {
                    $room->o_user_id = $userId;
                    $room->o_seen_at = date('Y-m-d H:i:s');
                }
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
     * 读取房间状态（轮询同步用）。
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
     * 猜拳定 X（仅首局）：胜者执 X 先行。
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
            $mark = $this->seatedMark($room, $userId);
            if ($mark === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'rps') {
                throw new BizException(422, '不在猜拳阶段');
            }
            $rps = $room->rps;
            if (($rps['winner'] ?? null) !== null) {
                throw new BizException(422, '猜拳已分出胜负');
            }
            if (isset($rps['picks'][$mark])) {
                throw new BizException(422, '你已经出过拳了');
            }
            $rps['picks'][$mark] = $map[$pick];
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
     * 落子：校验回合与空格；三连/平局即时结算。
     *
     * @return array<string, mixed>
     */
    public function move(string $code, int $userId, int $index): array
    {
        $room = Db::transaction(function () use ($code, $userId, $index) {
            $room = $this->lockByCode($code);
            $this->applyDueIfNeeded($room, $userId);
            $mark = $this->seatedMark($room, $userId);
            if ($mark === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'playing') {
                throw new BizException(422, '对局不在进行中');
            }
            if ((string) $room->turn !== $mark) {
                throw new BizException(422, '还没轮到你');
            }
            if ($index < 0 || $index > 8) {
                throw new BizException(422, '落点超出棋盘');
            }
            $board = $room->board ?? array_fill(0, 9, null);
            if ($board[$index] !== null && $board[$index] !== '') {
                throw new BizException(422, '这个格子已经有子了');
            }
            $board[$index] = $mark;
            $room->board = $board;
            $roomName = $mark === 'x' ? '红·X' : '蓝·O';
            $other = $mark === 'x' ? 'o' : 'x';

            $win = TictactoeRule::findWin($board, $mark);
            if ($win !== null) {
                $room->status = 'finished';
                $room->winner = $mark;
                $room->win_reason = 'line';
                $room->win_line = $win[1];
                $scores = $room->scores ?? ['x' => 0, 'o' => 0, 'draw' => 0];
                $scores[$mark]++;
                $room->scores = $scores;
                $this->setEvent($room, 'win', $roomName . ' 三连成线 · 胜利！');
            } elseif (TictactoeRule::isFull($board)) {
                $room->status = 'finished';
                $room->winner = 'draw';
                $room->win_reason = 'draw';
                $scores = $room->scores ?? ['x' => 0, 'o' => 0, 'draw' => 0];
                $scores['draw']++;
                $room->scores = $scores;
                $this->setEvent($room, 'draw', '棋盘已满 · 平局');
            } else {
                $room->turn = $other;
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
                $this->setEvent($room, 'move', $roomName . ' 落子 · 轮到' . ($other === 'x' ? '红·X' : '蓝·O'));
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
     * Timer 清扫入口：rps 到期代出拳；playing 到期代落随机空格。
     */
    public function sweepDueRooms(): int
    {
        $codes = TictactoeRoom::query()
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
            if ($room instanceof TictactoeRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * 房间聊天：phrase / emoji / sticker / text（过审）。
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
                // fail-closed：审核接口异常时宁可拒发（事务外执行）
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
            $mark = $this->seatedMark($room, $userId);
            if ($mark === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            $now = time();
            $lastAt = $room->chat_last_at ?? [];
            if ($now - (int) ($lastAt[(string) $userId] ?? 0) < self::CHAT_COOLDOWN_SECONDS) {
                throw new BizException(422, '发太快啦，歇一下');
            }
            $chat = $room->chat ?? [];
            $seq = ($chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0)) + 1;
            $chat[] = ['seq' => $seq, 'uid' => $userId, 'role' => $mark, 'kind' => $kind, 'text' => $content, 'ts' => $now];
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
     * 再来一局：自动交换先后手（双方换执子，X 永远先行），不再猜拳；scores 保留。
     *
     * @return array<string, mixed>
     */
    public function rematch(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            if ($this->seatedMark($room, $userId) === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'finished') {
                throw new BizException(422, '对局结束后才能再来一局');
            }
            // 交换执子（换先后手：上一局的后手这局执 X 先行）
            [$room->x_user_id, $room->o_user_id] = [$room->o_user_id, $room->x_user_id];
            [$room->x_seen_at, $room->o_seen_at] = [$room->o_seen_at, $room->x_seen_at];
            $room->board = array_fill(0, 9, null);
            $room->turn = 'x';
            $room->win_line = null;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = null;
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
            $room->status = 'playing';
            $now = date('Y-m-d H:i:s');
            $room->x_seen_at = $now;
            $room->o_seen_at = $now;
            $this->setEvent($room, 'move', '交换先后手 · 红·X 先行');
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待/猜拳中直接关房；对局中算对方胜（不计入连绩）。
     *
     * @return array<string, mixed>
     */
    public function leave(string $code, int $userId): array
    {
        $room = Db::transaction(function () use ($code, $userId) {
            $room = $this->lockByCode($code);
            $mark = $this->seatedMark($room, $userId);
            if ($mark === null || $room->status === 'finished' || $room->status === 'closed') {
                return $room;
            }
            if (in_array($room->status, ['waiting', 'rps'], true)) {
                $room->status = 'closed';
            } else {
                $room->status = 'finished';
                $room->winner = $mark === 'x' ? 'o' : 'x';
                $room->win_reason = 'forfeit';
                $this->setEvent($room, 'forfeit', ($mark === 'x' ? '红·X' : '蓝·O') . '认输');
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
    public function serialize(TictactoeRoom $room, int $requesterId): array
    {
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $myMark = $this->seatedMark($room, $requesterId);

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'myMark' => $myMark,
            'turn' => $room->status === 'playing' ? (string) $room->turn : null,
            'board' => array_values($room->board ?? array_fill(0, 9, null)),
            'scores' => $room->scores ?? ['x' => 0, 'o' => 0, 'draw' => 0],
            'winLine' => $room->win_line,
            'ttl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'winner' => $room->winner,
            'winReason' => $room->win_reason,
            'lastEvent' => $room->last_event,
            'xPlayer' => $this->playerCard($room->x_user_id, $room->x_seen_at, $onlineIds),
            'oPlayer' => $this->playerCard($room->o_user_id, $room->o_seen_at, $onlineIds),
            'rps' => $this->serializeRps($room, $myMark),
            'chat' => array_values($room->chat ?? []),
            'chatSeq' => $this->chatSeqOf($room),
            'sharePath' => '/pages/tictactoe/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /**
     * 猜拳定 X 的对外结构（出拳期只给本人出拳；分出胜负瞬间亮双方）。
     *
     * @return null|array<string, mixed>
     */
    private function serializeRps(TictactoeRoom $room, ?string $myMark): ?array
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
        $opp = $myMark === 'x' ? 'o' : ($myMark === 'o' ? 'x' : null);
        return [
            'phase' => $inRps && $winner === null ? 'pick' : 'done',
            'round' => (int) ($rps['round'] ?? 1),
            'winner' => $winner,
            'myPick' => $myMark !== null ? ($picks[$myMark] ?? null) : null,
            'opponentPicked' => $opp !== null ? isset($picks[$opp]) : (isset($picks['x']) && isset($picks['o'])),
            'picks' => $winner === null ? null : ['x' => $picks['x'] ?? null, 'o' => $picks['o'] ?? null],
            'lastPicks' => isset($rps['lastPicks']) ? ['x' => $rps['lastPicks']['x'] ?? null, 'o' => $rps['lastPicks']['o'] ?? null] : null,
            'myTurn' => $inRps && $myMark !== null && $winner === null && ! isset($picks[$myMark]),
        ];
    }

    /** 聊天游标：最后一条的 seq。 */
    private function chatSeqOf(TictactoeRoom $room): int
    {
        $chat = $room->chat ?? [];
        return $chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0);
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态。 */
    private function broadcast(TictactoeRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn (int $userId): array => $this->serialize($room, $userId));
    }

    /** 记录最近事件，seq 自增。 */
    private function setEvent(TictactoeRoom $room, string $type, string $text): void
    {
        $prev = $room->last_event;
        $room->last_event = ['seq' => (int) ($prev['seq'] ?? 0) + 1, 'type' => $type, 'text' => $text];
    }

    /**
     * 双方出拳到齐后结算；胜者所在座位执 X（若胜者是 O 座位则交换用户列），进入对局。
     */
    private function resolveRps(TictactoeRoom $room): void
    {
        $rps = $room->rps;
        if (! isset($rps['picks']['x'], $rps['picks']['o'])) {
            return;
        }
        $px = (int) $rps['picks']['x'];
        $po = (int) $rps['picks']['o'];
        $winner = null;
        if ($px !== $po) {
            $winner = ((($px - $po) + 3) % 3) === 1 ? 'x' : 'o';
        } elseif ((int) $rps['round'] >= self::RPS_MAX_ROUNDS) {
            $winner = random_int(0, 1) === 0 ? 'x' : 'o';
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
        if ($winner === 'o') {
            // 胜者执 X：交换用户列（连心跳一起）
            [$room->x_user_id, $room->o_user_id] = [$room->o_user_id, $room->x_user_id];
            [$room->x_seen_at, $room->o_seen_at] = [$room->o_seen_at, $room->x_seen_at];
        }
        $room->status = 'playing';
        $room->turn = 'x';
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
        $this->setEvent($room, 'rps_win', '猜拳结束 · 红·X 先行');
    }

    /**
     * rps/playing 窗口到期的懒推进；到期待办正是请求者本人时刷新 deadline 放行（防软锁）。
     */
    private function applyDueIfNeeded(TictactoeRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->turn_deadline_at === null || strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $myMark = $exceptUserId !== null ? $this->seatedMark($room, $exceptUserId) : null;

        if ($room->status === 'rps') {
            $rps = $room->rps ?? [];
            if (($rps['winner'] ?? null) === null) {
                if ($myMark !== null && ! isset($rps['picks'][$myMark])) {
                    $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
                    return false;
                }
                foreach (['x', 'o'] as $m) {
                    if (! isset($rps['picks'][$m])) {
                        $rps['picks'][$m] = random_int(0, 2);
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
            if ($myMark !== null && $myMark === $turn) {
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
                return false;
            }
            $index = TictactoeRule::randomEmpty($room->board ?? []);
            if ($index === null) {
                return false;
            }
            $board = $room->board ?? array_fill(0, 9, null);
            $board[$index] = $turn;
            $room->board = $board;
            $roomName = $turn === 'x' ? '红·X' : '蓝·O';
            $other = $turn === 'x' ? 'o' : 'x';
            $win = TictactoeRule::findWin($board, $turn);
            if ($win !== null) {
                $room->status = 'finished';
                $room->winner = $turn;
                $room->win_reason = 'line';
                $room->win_line = $win[1];
                $scores = $room->scores ?? ['x' => 0, 'o' => 0, 'draw' => 0];
                $scores[$turn]++;
                $room->scores = $scores;
                $this->setEvent($room, 'win', $roomName . ' 三连成线 · 胜利！（超时代落）');
            } elseif (TictactoeRule::isFull($board)) {
                $room->status = 'finished';
                $room->winner = 'draw';
                $room->win_reason = 'draw';
                $scores = $room->scores ?? ['x' => 0, 'o' => 0, 'draw' => 0];
                $scores['draw']++;
                $room->scores = $scores;
                $this->setEvent($room, 'draw', '棋盘已满 · 平局');
            } else {
                $room->turn = $other;
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
                $this->setEvent($room, 'move', $roomName . ' 落子（超时代落）');
            }
            return true;
        }
        return false;
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version。 */
    private function touchSeenAt(TictactoeRoom $room, int $userId): void
    {
        $now = date('Y-m-d H:i:s');
        if ($room->x_user_id === $userId) {
            $room->x_seen_at = $now;
        } elseif ($room->o_user_id === $userId) {
            $room->o_seen_at = $now;
        } else {
            return;
        }
        $room->save();
    }

    /** 房间内某用户的执子（x/o）；旁观/空位返回 null。 */
    private function seatedMark(TictactoeRoom $room, int $userId): ?string
    {
        if ($userId > 0 && $room->x_user_id === $userId) {
            return 'x';
        }
        if ($userId > 0 && $room->o_user_id === $userId) {
            return 'o';
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

    /** 取活跃房间（行锁，事务内使用）。 */
    private function lockByCode(string $code): TictactoeRoom
    {
        $room = TictactoeRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof TictactoeRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): TictactoeRoom
    {
        $room = TictactoeRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof TictactoeRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; ++$i) {
            $code = (string) random_int(1000, 9999);
            $exists = TictactoeRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
