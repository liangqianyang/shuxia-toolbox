<?php

declare(strict_types=1);

namespace App\Service\MountainChess;

use App\Exception\BizException;
use App\Model\JunqiRoom;
use App\Service\Chat\GameChat;
use App\Service\FeatureFlagService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use RuntimeException;
use Hyperf\DbConnection\Db;

/**
 * 联机军棋（两人暗棋）房间：服务端权威，状态存 MySQL（重启不丢局）。
 *
 * 状态机 waiting → layout（布阵 300s）→ rps（猜拳定先手 10s×≤3 轮）→ playing（45s/步）→ finished。
 * 暗棋：pieces 存双方完整信息，serialize 按请求者视角裁剪（对方未暴露的子不带 rank）。
 * 超时三合一清扫（JunqiSweepListener 1s Timer）：布阵代随机布阵、猜拳代出拳、走子代走随机合法步；
 * 写路径懒推进带请求者放行（防 422 软锁）。红蓝只是上下半场座位标签，猜拳胜者直接先行、不换座。
 * 客户端→服务端坐标一律为绝对显示坐标（蓝方座位客户端本地做 180° 旋转）。
 */
final class MountainChessRoomService
{
    /** 房间闲置多久（秒）后懒清理。 */
    private const int STALE_SECONDS = 86400;

    /** seen_at 在此秒数内视为在线（轮询降级时用）。 */
    private const int ONLINE_SECONDS = 60;

    /** 布阵窗口（秒），超时清扫器代随机合法布阵。 */
    public const int LAYOUT_SECONDS = 300;

    /** 猜拳定先手：出拳窗口（秒）。 */
    public const int RPS_SECONDS = 10;

    /** 猜拳平局重出上限；超过后随机定胜者。 */
    public const int RPS_MAX_ROUNDS = 3;

    /** 每步走子窗口（秒），超时清扫器代走随机合法步。 */
    public const int MOVE_SECONDS = 45;

    /** 聊天冷却（秒）/ 环形保留条数（同 uno/冒险棋/飞行棋/五子棋/斗兽棋）。 */
    private const int CHAT_COOLDOWN_SECONDS = 3;

    public const int CHAT_KEEP = 50;

    /** 走子错误键 → 用户可读文案。 */
    private const array MOVE_ERRORS = [
        'out_of_range' => '落点超出棋盘',
        'no_piece' => '起点没有棋子',
        'not_yours' => '还不能动对方的棋子',
        'cannot_move' => '这枚棋子不能移动',
        'locked_hq' => '进了大本营的棋子不能再动',
        'in_own_hq' => '不能走进自己的大本营',
        'blocked_own' => '落点是自己的棋子',
        'camp_protected' => '行营里的棋子不可被攻击',
        'not_reachable' => '走不到这个位置',
    ];

    /** 布阵错误键 → 用户可读文案。 */
    private const array LAYOUT_ERRORS = [
        'layout_count' => '阵型必须是 25 枚棋子各就各位',
        'layout_rank' => '棋子编制不正确',
        'layout_overlap' => '一格只能放一枚棋子',
        'layout_half' => '只能在自己半场布阵',
        'layout_camp' => '行营里不能放子',
        'layout_mine_row' => '地雷只能放在后两排',
        'layout_bomb_row' => '炸弹不能放在第一排',
        'layout_flag_hq' => '军旗只能放在大本营',
    ];

    /** 阵亡托盘排序（司令在前，普通军衔降序，特殊子殿后）。 */
    private const array TRAY_ORDER = ['si', 'jun', 'shi', 'lv', 'tuan', 'ying', 'lian', 'pai', 'gong', 'zha', 'lei', 'qi'];

    public function __construct(
        private readonly WechatUserService $users,
        private readonly MountainChessWsPusher $pusher,
        private readonly FeatureFlagService $flags,
        private readonly WechatContentSecurityService $security,
    ) {}

    /**
     * 创建房间：创建者临时坐红（红蓝只是座位标签）。插入前顺手清理 24h 未更新的旧房。
     *
     * @return array<string, mixed> 完整房间状态
     */
    public function create(int $userId): array
    {
        JunqiRoom::query()->where('updated_at', '<', date('Y-m-d H:i:s', time() - self::STALE_SECONDS))->delete();

        $room = Db::transaction(function () use ($userId) {
            $room = new JunqiRoom();
            $room->code = $this->newCode();
            $room->red_user_id = $userId;
            $room->blue_user_id = 0;
            $room->status = 'waiting';
            $room->pieces = [];
            $room->ready = null;
            $room->turn = null;
            $room->last_move = null;
            $room->last_event = null;
            $room->flag_revealed = null;
            $room->ply = 0;
            $room->version = 1;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = null;
            $room->turn_deadline_at = null;
            $room->red_seen_at = date('Y-m-d H:i:s');
            $room->blue_seen_at = null;
            $room->save();
            return $room;
        });

        return $this->serialize($room, $userId);
    }

    /**
     * 加入房间：本人重进幂等返回原角色；有空位则入座；坐满即进入布阵阶段。
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
                    $room->blue_seen_at = date('Y-m-d H:i:s');
                }
                $this->startLayout($room);
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
     * 提交布阵并就绪（layout 阶段）：绝对显示坐标、25 项 {rank,r,c}；
     * 服务端校验约束后落库，双方就绪即进入猜拳。
     *
     * @param array<int, array{rank: string, r: int, c: int}> $layout
     * @return array<string, mixed>
     */
    public function layout(string $code, int $userId, array $layout): array
    {
        $room = Db::transaction(function () use ($code, $userId, $layout) {
            $room = $this->lockByCode($code);
            $this->applyDueIfNeeded($room, $userId);
            $role = $this->seatedRole($room, $userId);
            if ($role === null) {
                throw new BizException(403, '你不是本局玩家');
            }
            if ($room->status !== 'layout') {
                throw new BizException(422, '不在布阵阶段');
            }
            $ready = $room->ready ?? ['red' => false, 'blue' => false];
            if ($ready[$role]) {
                throw new BizException(422, '你已经布好阵了');
            }
            $error = MountainChessRule::validateLayout($role, $layout);
            if ($error !== null) {
                throw new BizException(422, self::LAYOUT_ERRORS[$error] ?? '阵型不合法');
            }

            // 保留对方子，替换己方子
            $others = array_values(array_filter(
                $room->pieces ?? [],
                static fn(array $p): bool => $p['side'] !== $role
            ));
            $room->pieces = array_values(array_merge($others, MountainChessRule::buildPieces(
                $role === 'red' ? $layout : [],
                $role === 'blue' ? $layout : [],
            )));
            $ready[$role] = true;
            $room->ready = $ready;
            $this->setEvent($room, 'layout_ready', ($role === 'red' ? '红方' : '蓝方') . '已布好阵');
            if ($ready['red'] && $ready['blue']) {
                $this->startRps($room);
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
     * 猜拳定先手（rps 阶段）：双人各暗出一拳（r石头/p布/s剪刀），双方到齐即结算；
     * 平局重出（上限 RPS_MAX_ROUNDS 后随机定），胜者直接先行（不换座）。
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
     * 走子：校验回合与规则（铁路滑行/工兵拐弯/行营免战/大本营锁足），战斗即时结算；
     * 扛旗/吃光/困毙即终局。返回最新完整状态。
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
            $error = MountainChessRule::validateMove($pieces, $role, $fr, $fc, $tr, $tc);
            if ($error !== null) {
                throw new BizException(422, self::MOVE_ERRORS[$error] ?? '这步走不了');
            }

            $moverRank = (string) (MountainChessRule::pieceAt($pieces, $fr, $fc)['rank'] ?? 'pai');
            $applied = MountainChessRule::applyMove($pieces, $role, $fr, $fc, $tr, $tc);
            $nextPieces = $applied['pieces'];
            $result = $applied['result'];
            $captured = $applied['captured'];
            $revealSide = $applied['revealSide'];
            $room->pieces = $nextPieces;
            $room->ply = (int) $room->ply + 1;
            $room->last_move = [
                'fr' => $fr, 'fc' => $fc, 'tr' => $tr, 'tc' => $tc,
                'result' => $result, 'captured' => $captured,
            ];
            if ($revealSide !== null) {
                $flags = $room->flag_revealed ?? ['red' => false, 'blue' => false];
                $flags[$revealSide] = true;
                $room->flag_revealed = $flags;
            }

            // 战报（亮旗 > 战斗 > 移动；终局再被 win 事件覆盖）
            $this->emitMoveEvent($room, $role, $moverRank, $result, $captured, $revealSide);

            $winReason = MountainChessRule::findWin($nextPieces, $role, $result);
            if ($winReason === null && ! MountainChessRule::hasAnyMove($nextPieces, $this->opponentOf($role))) {
                $winReason = 'stuck';
            }
            if ($winReason !== null) {
                $room->status = 'finished';
                $room->winner = $role;
                $room->win_reason = $winReason;
                $this->setEvent($room, 'win', ($role === 'red' ? '红方' : '蓝方') . ' ' . $this->winText($winReason));
            } else {
                $room->turn = $this->opponentOf($role);
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
     * Timer 清扫入口：把所有「layout/rps/playing 且窗口已到期」的房间自动推进。
     * （布阵到期代随机布阵；出拳到期代未出者随机出；走子到期代走随机合法步。）返回推进的房间数。
     */
    public function sweepDueRooms(): int
    {
        $codes = JunqiRoom::query()
            ->whereIn('status', ['layout', 'rps', 'playing'])
            ->whereNotNull('turn_deadline_at')
            ->where('turn_deadline_at', '<=', date('Y-m-d H:i:s'))
            ->limit(50)
            ->pluck('code');
        $swept = 0;
        foreach ($codes as $code) {
            $room = Db::transaction(function () use ($code) {
                $room = $this->lockByCode((string) $code);
                if (! in_array($room->status, ['layout', 'rps', 'playing'], true)
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
            if ($room instanceof JunqiRoom) {
                $this->broadcast($room);
                ++$swept;
            }
        }
        return $swept;
    }

    /**
     * 房间聊天：phrase（快捷句 id）/ emoji（表情字符）/ sticker（贴纸 id）/ text（自由文字，过审）。
     * 白名单是通用 GameChat；自由文字开关复用 feature.uno_chat_text。全程可用。
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
     * 再来一局：终局后由任一入座玩家发起，重置盘面重新布阵（座位不变，猜拳重新定先手）；
     * 聊天记录与冷却保留。
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
            $room->pieces = [];
            $room->ready = ['red' => false, 'blue' => false];
            $room->turn = null;
            $room->last_move = null;
            $room->last_event = null;
            $room->flag_revealed = null;
            $room->ply = 0;
            $room->winner = null;
            $room->win_reason = null;
            $room->rps = null;
            $this->startLayout($room, keepEvent: false);
            $now = date('Y-m-d H:i:s');
            $room->red_seen_at = $now;
            $room->blue_seen_at = $now;
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /**
     * 离开房间：等待/布阵/猜拳中直接关房；对局中算对方获胜（逃跑判负）。
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
            if (in_array($room->status, ['waiting', 'layout', 'rps'], true)) {
                $room->status = 'closed';
            } else {
                $room->status = 'finished';
                $room->winner = $this->opponentOf($role);
                $room->win_reason = 'forfeit';
                $this->setEvent($room, 'forfeit', ($role === 'red' ? '红方' : '蓝方') . '认输');
            }
            $room->version++;
            $room->save();
            return $room;
        });

        $state = $this->serialize($room, $userId);
        $this->broadcast($room);
        return $state;
    }

    /** 我的进行中对局列表（断线重连备用入口）。 */
    public function myRooms(int $userId): array
    {
        $rooms = JunqiRoom::query()
            ->where(function ($q) use ($userId): void {
                $q->where('red_user_id', $userId)->orWhere('blue_user_id', $userId);
            })
            ->whereIn('status', ['waiting', 'layout', 'rps', 'playing'])
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get(['code', 'status', 'updated_at']);
        return $rooms->map(static fn($r): array => [
            'code' => (string) $r->code,
            'status' => (string) $r->status,
            'updatedAt' => (string) $r->updated_at,
        ])->all();
    }

    /** 序列化为对外状态；HTTP 接口与 WS 推送共用同一 shape。暗棋裁剪见 cropPieces。 */
    public function serialize(JunqiRoom $room, int $requesterId): array
    {
        $onlineIds = $this->pusher->onlineUserIds((string) $room->code);
        $myRole = $this->seatedRole($room, $requesterId) ?? 'spectator';

        return [
            'code' => (string) $room->code,
            'status' => (string) $room->status,
            'version' => (int) $room->version,
            'myRole' => $myRole,
            'turn' => $room->status === 'playing' ? (string) $room->turn : null,
            'pieces' => $this->cropPieces($room->pieces ?? [], $myRole),
            'ready' => $room->status === 'layout' ? ($room->ready ?? ['red' => false, 'blue' => false]) : null,
            'trays' => $this->traysOf($room),
            'lastMove' => $room->last_move,
            'lastEvent' => $room->last_event,
            'ply' => (int) $room->ply,
            'ttl' => $room->turn_deadline_at !== null ? max(0, strtotime((string) $room->turn_deadline_at) - time()) : 0,
            'winner' => $room->winner,
            'winReason' => $room->win_reason,
            'red' => $this->playerCard($room->red_user_id, $room->red_seen_at, $onlineIds),
            'blue' => $this->playerCard($room->blue_user_id, $room->blue_seen_at, $onlineIds),
            'rps' => $this->serializeRps($room, $myRole),
            'chat' => array_values($room->chat ?? []),
            'chatSeq' => $this->chatSeqOf($room),
            'sharePath' => '/pages/junqi/index?room=' . $room->code,
            'updatedAt' => (string) $room->updated_at,
        ];
    }

    /**
     * 暗棋视角裁剪：己方子全可见；对方存活子 revealed=true 才带 rank（交战暴露/亮旗），
     * 否则只给位置（前端按背面渲染）；阵亡子公示（带 rank）；旁观者双方未暴露的都看不到。
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return array<int, array<string, mixed>>
     */
    private function cropPieces(array $pieces, string $myRole): array
    {
        $out = [];
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && $piece['side'] !== $myRole && ! (bool) $piece['revealed']) {
                $out[] = [
                    'side' => $piece['side'],
                    'r' => (int) $piece['r'],
                    'c' => (int) $piece['c'],
                    'alive' => true,
                ];
                continue;
            }
            $out[] = $piece;
        }
        return $out;
    }

    /**
     * 猜拳定先手的对外结构（视角裁剪：出拳期只给本人出拳，对方只给「已出/未出」；
     * 分出胜负起双方出拳公开）。phase: pick|done。
     *
     * @return null|array<string, mixed>
     */
    private function serializeRps(JunqiRoom $room, string $myRole): ?array
    {
        $rps = $room->rps;
        if (! is_array($rps)) {
            return null;
        }
        $winner = $rps['winner'] ?? null;
        $inRps = $room->status === 'rps';
        if (! $inRps && $winner === null) {
            return null; // 旧局数据 / 未进入猜拳
        }
        $picks = $rps['picks'] ?? [];
        $me = $myRole !== 'spectator' ? $myRole : null;
        $out = [
            'phase' => $inRps && $winner === null ? 'pick' : 'done',
            'round' => (int) ($rps['round'] ?? 1),
            'winner' => $winner,
            'myPick' => $me !== null ? ($picks[$me] ?? null) : null,
            'opponentPicked' => $me !== null ? isset($picks[$this->opponentOf($me)]) : (isset($picks['red']) && isset($picks['blue'])),
            // 双方出拳在分出胜负的瞬间同时亮出；平局重出轮带出上轮结果
            'picks' => $winner === null ? null : ['red' => $picks['red'] ?? null, 'blue' => $picks['blue'] ?? null],
            'lastPicks' => isset($rps['lastPicks']) ? ['red' => $rps['lastPicks']['red'] ?? null, 'blue' => $rps['lastPicks']['blue'] ?? null] : null,
            'myTurn' => $inRps && $me !== null && $winner === null && ! isset($picks[$me]),
        ];
        return $out;
    }

    /** 阵亡托盘（双方，按军衔降序排布）。 */
    private function traysOf(JunqiRoom $room): array
    {
        $order = array_flip(self::TRAY_ORDER);
        $trays = ['red' => [], 'blue' => []];
        foreach ($room->pieces ?? [] as $piece) {
            if (! (bool) $piece['alive']) {
                $trays[$piece['side']][] = (string) $piece['rank'];
            }
        }
        foreach ($trays as $side => $ranks) {
            usort($ranks, static fn(string $a, string $b): int => ($order[$a] ?? 99) <=> ($order[$b] ?? 99));
            $trays[$side] = $ranks;
        }
        return $trays;
    }

    /** 聊天游标：最后一条的 seq（空为 0），客户端按 seq 增量出气泡。 */
    private function chatSeqOf(JunqiRoom $room): int
    {
        $chat = $room->chat ?? [];
        return $chat === [] ? 0 : (int) ($chat[count($chat) - 1]['seq'] ?? 0);
    }

    /** 写操作提交后向房间内 WS 连接广播最新状态（每个连接按自己视角序列化）。 */
    private function broadcast(JunqiRoom $room): void
    {
        $this->pusher->pushRoom((string) $room->code, fn(int $userId): array => $this->serialize($room, $userId));
    }

    /** 记录最近事件（播报条 + 音效用），seq 自增。 */
    private function setEvent(JunqiRoom $room, string $type, string $text): void
    {
        $prev = $room->last_event;
        $room->last_event = [
            'seq' => (int) ($prev['seq'] ?? 0) + 1,
            'type' => $type,
            'text' => $text,
        ];
    }

    /** 走子战报：亮旗 > 战斗 > 移动。 */
    private function emitMoveEvent(JunqiRoom $room, string $role, string $moverRank, string $result, ?string $captured, ?string $revealSide): void
    {
        $mine = ($role === 'red' ? '红' : '蓝') . '·' . (MountainChessRule::RANK_NAMES[$moverRank] ?? '棋子');
        if ($revealSide !== null) {
            $this->setEvent($room, 'reveal', $mine . ' ' . $this->battleText($result, $role, $captured) . ' · ' . ($revealSide === 'red' ? '红方' : '蓝方') . '军旗亮出！');
            return;
        }
        if ($result === 'move') {
            $this->setEvent($room, 'move', $mine . ' 移动');
            return;
        }
        $this->setEvent($room, 'battle', $mine . ' ' . $this->battleText($result, $role, $captured));
    }

    /** 战斗结果文案（不含主语棋子）。 */
    private function battleText(string $result, string $role, ?string $captured): string
    {
        $opponent = $this->opponentOf($role);
        $enemy = ($opponent === 'red' ? '红' : '蓝') . '·' . ($captured !== null ? MountainChessRule::RANK_NAMES[$captured] : '棋子');
        return match ($result) {
            'win' => '吃掉 ' . $enemy,
            'lose' => '进攻 ' . $enemy . ' 失败',
            'both' => '与 ' . $enemy . ' 同归于尽',
            'flag' => '夺走 ' . $enemy,
            default => '移动',
        };
    }

    private function winText(string $reason): string
    {
        return match ($reason) {
            'flag' => '扛旗获胜',
            'eliminated' => '全歼获胜',
            'stuck' => '对方无棋可走获胜',
            'forfeit' => '对方认输获胜',
            default => '获胜',
        };
    }

    /** 进入布阵阶段（join 坐满 / rematch）。 */
    private function startLayout(JunqiRoom $room, bool $keepEvent = true): void
    {
        $room->status = 'layout';
        $room->pieces = [];
        $room->ready = ['red' => false, 'blue' => false];
        $room->rps = null;
        $room->turn = null;
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::LAYOUT_SECONDS);
        if (! $keepEvent) {
            $room->last_event = null;
        }
    }

    /** 双方就绪 → 猜拳定先手。 */
    private function startRps(JunqiRoom $room): void
    {
        $room->status = 'rps';
        $room->rps = ['round' => 1, 'picks' => [], 'winner' => null];
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
    }

    /**
     * 双方出拳到齐后结算：0石头/1布/2剪刀，a 胜 b ⟺ (a−b+3) mod 3 == 1；
     * 平局重出（清空双方出拳、轮数+1、亮上轮），超上限随机定；
     * 分出胜负即进入对局（turn = 胜者座位色，不换座）。
     * 调用方负责后续 version++/save；本方法负责写 rps 与后续状态。
     */
    private function resolveRps(JunqiRoom $room): void
    {
        $rps = $room->rps;
        if (! isset($rps['picks']['red'], $rps['picks']['blue'])) {
            return; // 还有一方没出
        }
        $pr = (int) $rps['picks']['red'];
        $pb = (int) $rps['picks']['blue'];
        $winner = null;
        if ($pr !== $pb) {
            $winner = ((($pr - $pb) + 3) % 3) === 1 ? 'red' : 'blue';
        } elseif ((int) $rps['round'] >= self::RPS_MAX_ROUNDS) {
            $winner = random_int(0, 1) === 0 ? 'red' : 'blue';
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
        $this->startPlaying($room, $winner);
    }

    /** 进入对局：猜拳胜者先行。 */
    private function startPlaying(JunqiRoom $room, string $winner): void
    {
        $room->status = 'playing';
        $room->turn = $winner;
        $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
        $this->setEvent($room, 'rps_win', ($winner === 'red' ? '红方' : '蓝方') . '猜拳获胜 · 先行');
    }

    /**
     * 各阶段窗口到期的懒推进（事务内、已持行锁）。返回是否有推进。
     * $exceptUserId：若到期待办的正是请求者本人（没布阵/没出拳/正轮他走），刷新 deadline 放行——
     * 防「懒推进 → 回滚 → 再请求再推进」把活跃玩家软锁在 422 循环。
     */
    private function applyDueIfNeeded(JunqiRoom $room, ?int $exceptUserId = null): bool
    {
        if ($room->turn_deadline_at === null || strtotime((string) $room->turn_deadline_at) > time()) {
            return false;
        }
        $myRole = $exceptUserId !== null ? $this->seatedRole($room, $exceptUserId) : null;

        if ($room->status === 'layout') {
            if ($myRole !== null && ! ($room->ready[$myRole] ?? false)) {
                $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::LAYOUT_SECONDS);
                return false; // 本人还在布阵：放行
            }
            // 代未就绪方随机布阵，然后照常推进
            foreach (['red', 'blue'] as $side) {
                if (! ($room->ready[$side] ?? false)) {
                    $others = array_values(array_filter(
                        $room->pieces ?? [],
                        static fn(array $p): bool => $p['side'] !== $side
                    ));
                    $room->pieces = array_values(array_merge($others, MountainChessRule::buildPieces(
                        $side === 'red' ? MountainChessRule::randomLayout('red') : [],
                        $side === 'blue' ? MountainChessRule::randomLayout('blue') : [],
                    )));
                    $ready = $room->ready ?? ['red' => false, 'blue' => false];
                    $ready[$side] = true;
                    $room->ready = $ready;
                    $this->setEvent($room, 'layout_auto', ($side === 'red' ? '红方' : '蓝方') . '超时，系统代为布阵');
                }
            }
            if (($room->ready['red'] ?? false) && ($room->ready['blue'] ?? false)) {
                $this->startRps($room);
            }
            return true;
        }

        if ($room->status === 'rps') {
            $rps = $room->rps ?? [];
            if (($rps['winner'] ?? null) === null) {
                if ($myRole !== null && ! isset($rps['picks'][$myRole])) {
                    $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::RPS_SECONDS);
                    return false; // 本人还没出拳：放行
                }
                // 出拳超时：代未出者随机出，然后照常结算（可能平局重出）
                foreach (['red', 'blue'] as $r) {
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
                return false; // 正轮到本人：放行
            }
            $this->autoMoveFor($room, $turn);
            return true;
        }
        return false;
    }

    /** 代走随机合法步（清扫器超时兜底）。若已无棋可走则判负。 */
    private function autoMoveFor(JunqiRoom $room, string $side): void
    {
        $pieces = $room->pieces ?? [];
        $choices = [];
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $side || ! (bool) $piece['alive']) {
                continue;
            }
            foreach (MountainChessRule::reachableTargets($pieces, (int) $piece['r'], (int) $piece['c']) as [$tr, $tc]) {
                $error = MountainChessRule::validateMove($pieces, $side, (int) $piece['r'], (int) $piece['c'], $tr, $tc);
                if ($error === null) {
                    $choices[] = [(int) $piece['r'], (int) $piece['c'], $tr, $tc];
                }
            }
        }
        if ($choices === []) {
            $room->status = 'finished';
            $room->winner = $this->opponentOf($side);
            $room->win_reason = 'stuck';
            $this->setEvent($room, 'win', ($this->opponentOf($side) === 'red' ? '红方' : '蓝方') . ' ' . $this->winText('stuck'));
            return;
        }
        [$fr, $fc, $tr, $tc] = $choices[random_int(0, count($choices) - 1)];
        $moverRank = (string) (MountainChessRule::pieceAt($pieces, $fr, $fc)['rank'] ?? 'pai');
        $applied = MountainChessRule::applyMove($pieces, $side, $fr, $fc, $tr, $tc);
        $nextPieces = $applied['pieces'];
        $result = $applied['result'];
        $captured = $applied['captured'];
        $revealSide = $applied['revealSide'];
        $room->pieces = $nextPieces;
        $room->ply = (int) $room->ply + 1;
        $room->last_move = ['fr' => $fr, 'fc' => $fc, 'tr' => $tr, 'tc' => $tc, 'result' => $result, 'captured' => $captured];
        if ($revealSide !== null) {
            $flags = $room->flag_revealed ?? ['red' => false, 'blue' => false];
            $flags[$revealSide] = true;
            $room->flag_revealed = $flags;
        }
        $this->emitMoveEvent($room, $side, $moverRank, $result, $captured, $revealSide);

        $winReason = MountainChessRule::findWin($nextPieces, $side, $result);
        if ($winReason === null && ! MountainChessRule::hasAnyMove($nextPieces, $this->opponentOf($side))) {
            $winReason = 'stuck';
        }
        if ($winReason !== null) {
            $room->status = 'finished';
            $room->winner = $side;
            $room->win_reason = $winReason;
            $this->setEvent($room, 'win', ($side === 'red' ? '红方' : '蓝方') . ' ' . $this->winText($winReason));
        } else {
            $room->turn = $this->opponentOf($side);
            $room->turn_deadline_at = date('Y-m-d H:i:s', time() + self::MOVE_SECONDS);
        }
    }

    /** 更新入座玩家的 seen_at 心跳；不 bump version，避免心跳搅动同步计数。 */
    private function touchSeenAt(JunqiRoom $room, int $userId): void
    {
        $now = date('Y-m-d H:i:s');
        if ($room->red_user_id === $userId) {
            $room->red_seen_at = $now;
        } elseif ($room->blue_user_id === $userId) {
            $room->blue_seen_at = $now;
        } else {
            return;
        }
        $room->save();
    }

    /** 房间内某用户的座位色（red/blue）；旁观/空位返回 null。 */
    private function seatedRole(JunqiRoom $room, int $userId): ?string
    {
        if ($userId > 0 && $room->red_user_id === $userId) {
            return 'red';
        }
        if ($userId > 0 && $room->blue_user_id === $userId) {
            return 'blue';
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
        return $role === 'red' ? 'blue' : 'red';
    }

    /** 取活跃房间（行锁，事务内使用）；不存在/已关闭抛 404。 */
    private function lockByCode(string $code): JunqiRoom
    {
        $room = JunqiRoom::query()->where('code', $this->normalizeCode($code))->lockForUpdate()->first();
        if (! $room instanceof JunqiRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 取活跃房间（无锁，读路径）。 */
    private function findActive(string $code): JunqiRoom
    {
        $room = JunqiRoom::query()->where('code', $this->normalizeCode($code))->first();
        if (! $room instanceof JunqiRoom || $room->status === 'closed') {
            throw new BizException(404, '房间不存在或已结束');
        }
        return $room;
    }

    /** 生成 4 位房间码；忽略已关闭房间占用的码，小概率冲突时重试。 */
    private function newCode(): string
    {
        for ($i = 0; $i < 16; ++$i) {
            $code = (string) random_int(1000, 9999);
            $exists = JunqiRoom::query()->where('code', $code)->where('status', '!=', 'closed')->exists();
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
