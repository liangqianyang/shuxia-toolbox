<?php

declare(strict_types=1);

namespace App\Service\Adventure;

/**
 * 枫趣冒险纯规则引擎：无副作用依赖的静态方法，服务端权威判定。
 * 规则条文见 docs/adventure-rules.md（单一事实源）。
 *
 * 核心概念：
 * - 位移语义 semantics：dice（掷骰）/ machine（机关链）/ item（道具/决斗/山神/顶退）/ weather（天气位移）。
 *   登顶与反弹对所有语义一致（exact=登顶、超出反弹、掷骰独享枫叶补票）；营地托底只作用于回退；
 *   落格机关对 dice/machine/item 生效，weather 只踩埋伏（+营地托底+可被吹上 100）。
 * - 机关链：applyDisplacement → landCell → 再 applyDisplacement（云梯/缆车/滑坡继续链），
 *   递归深度上限 8 兜底（营地托底保证诚实数据下链必然收敛）。
 * - 悬挂窗口：landCell 落到 fork/shop/ambush/shrine/arena 或碰撞到人时，state 里挂 pendingChoice /
 *   pendingDuel 并返回，由 AdventureRoomService 等玩家输入或超时默认，再 continueTurn 收尾。
 *   一回合最多一场决斗（turnCtx.duelDone），之后碰撞只按顶退 2 处理。
 *
 * 前端 src/pages-adventure/utils/adventure.ts 是平行实现（常量双份同步），冲突以本类为准。
 */
final class AdventureRule
{
    public const int MAX_PLAYERS = 6;

    public const int START_LEAVES = 3;

    public const int HAND_LIMIT = 3;

    public const int SHOP_PRICE = 3;

    public const int AMBUSH_PRICE = 2;

    public const int BET_STAKE = 1;

    public const int BET_PAYOUT = 3;

    /** 机关链递归深度上限（诚实数据不可达，防御性兜底）。 */
    private const int CHAIN_DEPTH_MAX = 8;

    /** 决斗平局兜底轮数：超过转比点数。 */
    public const int DUEL_MAX_ROUNDS = 3;

    /** 定先手阶段时限（秒）；并列重掷超过 OPENING_MAX_ROUNDS 轮后随机定（诚实 RNG 下几乎不可达）。 */
    public const int OPENING_MAX_ROUNDS = 3;

    // ---------------------------------------------------------------- 几何/查询

    /** 天气 $id 是否生效中。 */
    public static function weatherActive(array $state, string $id): bool
    {
        return (($state['weather']['current'] ?? null) === $id);
    }

    /** 座位是否不可行动（已离开或已登顶）。 */
    public static function seatInactive(array $state, int $seat): bool
    {
        return in_array($seat, $state['leftSeats'] ?? [], true)
            || in_array($seat, $state['finishedOrder'] ?? [], true);
    }

    /** uid → 座位号；不在场返回 null。 */
    public static function seatOfUid(array $seats, string $uid): ?int
    {
        $idx = array_search($uid, array_map('strval', $seats), true);
        return $idx === false ? null : (int) $idx;
    }

    /** $pos 上除 $excludeSeat 外的其他可行动玩家座位（升序）。 */
    public static function occupantsAt(array $state, array $seats, int $pos, int $excludeSeat): array
    {
        $out = [];
        $n = count($seats);
        for ($s = 0; $s < $n; ++$s) {
            if ($s === $excludeSeat || self::seatInactive($state, $s)) {
                continue;
            }
            if ((int) ($state['positions'][$s] ?? 0) === $pos) {
                $out[] = $s;
            }
        }
        return $out;
    }

    /** 前方最近的可行动玩家座位（命运交换/擂台默认目标）；没有返回 null。 */
    public static function nearestAhead(array $state, array $seats, int $seat): ?int
    {
        $my = (int) ($state['positions'][$seat] ?? 0);
        $best = null;
        $bestPos = PHP_INT_MAX;
        $n = count($seats);
        for ($s = 0; $s < $n; ++$s) {
            if ($s === $seat || self::seatInactive($state, $s)) {
                continue;
            }
            $p = (int) ($state['positions'][$s] ?? 0);
            if ($p > $my && $p < $bestPos) {
                $bestPos = $p;
                $best = $s;
            }
        }
        return $best;
    }

    /** 擂台候选：其他全部可行动座位（任意位置）。 */
    public static function arenaCandidates(array $state, array $seats, int $seat): array
    {
        $out = [];
        $n = count($seats);
        for ($s = 0; $s < $n; ++$s) {
            if ($s !== $seat && ! self::seatInactive($state, $s)) {
                $out[] = $s;
            }
        }
        return $out;
    }

    // ---------------------------------------------------------------- 定先手（开局掷骰仪式）

    /** 定先手阶段还没掷骰的座位（活跃未离开；并列重掷轮只算并列者）。 */
    public static function openingPendingSeats(array $state, array $seats): array
    {
        $out = [];
        $opening = $state['opening'] ?? null;
        if ($opening === null) {
            return $out;
        }
        $tie = $opening['tieSeats'] ?? [];
        $rolls = $opening['rolls'] ?? [];
        foreach ($seats as $i => $uid) {
            if (in_array($i, $state['leftSeats'] ?? [], true)) {
                continue;
            }
            if ($tie !== [] && ! in_array($i, $tie, true)) {
                continue;
            }
            if (! array_key_exists((string) $i, $rolls)) {
                $out[] = (int) $i;
            }
        }
        return $out;
    }

    /**
     * 定先手掷骰（调用方已校验该轮到该座位）：记点数，全员掷完即结算。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function rollOpening(array &$state, array $seats, int $seat): array
    {
        $dice = [random_int(1, 6), random_int(1, 6)];
        $state['opening']['rolls'][(string) $seat] = $dice;
        $events = [['t' => 'openRoll', 'seat' => $seat, 'v' => $dice]];
        return array_merge($events, self::resolveOpeningIfNeeded($state, $seats));
    }

    /**
     * 全员掷完后结算：双骰之和大者先手；最大点并列只由并列者重掷；
     * 并列超过 OPENING_MAX_ROUNDS 轮改随机定（兜底）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function resolveOpeningIfNeeded(array &$state, array $seats): array
    {
        if (($state['phase'] ?? '') !== 'opening' || self::openingPendingSeats($state, $seats) !== []) {
            return [];
        }
        $opening = $state['opening'];
        $best = PHP_INT_MIN;
        $sums = [];
        foreach ($opening['rolls'] as $seatKey => $dice) {
            $sum = (int) $dice[0] + (int) $dice[1];
            $sums[(int) $seatKey] = $sum;
            $best = max($best, $sum);
        }
        $winners = array_keys(array_filter($sums, static fn($s) => $s === $best));

        if (count($winners) === 1) {
            $winner = (int) $winners[0];
            $state['phase'] = 'act';
            $state['currentSeat'] = $winner;
            $state['opening'] = null;
            return [['t' => 'firstPlayer', 'seat' => $winner, 'v' => $sums]];
        }
        if ((int) $opening['round'] >= self::OPENING_MAX_ROUNDS) {
            // 兜底：并列轮数用尽，随机定先手
            $winner = (int) $winners[random_int(0, count($winners) - 1)];
            $state['phase'] = 'act';
            $state['currentSeat'] = $winner;
            $state['opening'] = null;
            return [['t' => 'firstPlayer', 'seat' => $winner, 'v' => $sums, 'cap' => true]];
        }
        $state['opening'] = [
            'round' => (int) $opening['round'] + 1,
            'tieSeats' => array_map('intval', $winners),
            'rolls' => [],
        ];
        return [['t' => 'openTie', 'v' => array_map('intval', $winners), 'round' => (int) $opening['round'] + 1]];
    }

    // ---------------------------------------------------------------- 位移与落格

    /**
     * 掷骰有效步数：骰和 - 雪球减速（最低 1，消费减速）+ 登山镐加成。
     */
    public static function computeMoveSteps(array &$state, int $seat): int
    {
        [$d1, $d2] = $state['roll'];
        $sum = (int) $d1 + (int) $d2;
        $slow = (int) ($state['slowNext'][$seat] ?? 0);
        unset($state['slowNext'][$seat]);
        $steps = max(1, $sum - $slow) + (int) ($state['turnBonus'] ?? 0);
        return $steps;
    }

    /**
     * 统一位移入口：反弹/补票/封顶暴雪截断/营地托底 + 落格机关链。
     * 登顶格取 state.goal（房主设定，默认 100）：exact=登顶、超出反弹、掷骰独享枫叶补票。
     * 返回事件列表（无 seq/ts，由服务端入环）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function applyDisplacement(array &$state, array $seats, int $seat, int $steps, string $semantics, int $depth = 0): array
    {
        $events = [];
        $from = (int) ($state['positions'][$seat] ?? 0);
        $uid = (string) $seats[$seat];
        $goal = (int) ($state['goal'] ?? AdventureBoard::SUMMIT);
        $target = $from + $steps;

        // 封顶暴雪：雪线外前进目标截断为 81 营地（已在 82-100 者雪线内自由；goal<81 时到不了雪线，天然无效）
        if ($steps > 0 && $target > 81 && $from <= 80 && self::weatherActive($state, 'summitblizzard')) {
            $target = 81;
            $events[] = ['t' => 'blizzardBlock', 'seat' => $seat, 'to' => 81];
        }

        if ($target > $goal) {
            $gap = $goal - $from;
            $ticketed = false;
            // 补票只在掷骰位移时生效（机关/天气/道具送上去不收钱）
            if ($semantics === 'dice' && $gap > 0 && $steps >= $gap) {
                $leaves = (int) ($state['leaves'][$uid] ?? 0);
                if ($leaves >= $gap) {
                    $state['leaves'][$uid] = $leaves - $gap;
                    $target = $goal;
                    $ticketed = true;
                    $events[] = ['t' => 'ticket', 'seat' => $seat, 'cost' => $gap];
                }
            }
            if (! $ticketed) {
                $target = 2 * $goal - $target;
                $events[] = ['t' => 'bounce', 'seat' => $seat, 'to' => $target];
            }
        }

        if ($steps < 0) {
            $floor = (int) ($state['campFloor'][$seat] ?? 0);
            if ($target < $floor) {
                $target = $floor;
                $events[] = ['t' => 'campHold', 'seat' => $seat, 'to' => $floor];
            }
        }

        $state['positions'][$seat] = $target;
        $events[] = ['t' => 'move', 'seat' => $seat, 'from' => $from, 'to' => $target];

        if ($target === $goal) {
            return array_merge($events, self::finishSeat($state, $seat));
        }
        if ($depth >= self::CHAIN_DEPTH_MAX) {
            return $events;
        }
        return array_merge($events, self::landCell($state, $seats, $seat, $semantics, $depth));
    }

    /** 登顶入序。 */
    private static function finishSeat(array &$state, int $seat): array
    {
        if (! in_array($seat, $state['finishedOrder'] ?? [], true)) {
            $state['finishedOrder'][] = $seat;
        }
        return [['t' => 'summit', 'seat' => $seat]];
    }

    /**
     * 落格机关结算：按格类型触发效果；需要玩家选择的（岔路/商店/埋伏/山神奖励/擂台）
     * 挂 pendingChoice 返回。天气位移只踩埋伏，不触发其他机关。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function landCell(array &$state, array $seats, int $seat, string $semantics, int $depth = 0): array
    {
        $pos = (int) $state['positions'][$seat];
        $cell = AdventureBoard::cell($pos);
        if ($cell === null) {
            return [];
        }
        $type = (string) $cell['type'];
        $uid = (string) $seats[$seat];
        $events = [];

        switch ($type) {
            case 'camp':
                if ($pos > (int) ($state['campFloor'][$seat] ?? 0)) {
                    $state['campFloor'][$seat] = $pos; // 落在营地才算存档
                }
                $events[] = ['t' => 'camp', 'seat' => $seat, 'cell' => $pos];
                return $events;

            case 'leaf':
                if ($semantics === 'weather') {
                    return [];
                }
                $gain = self::weatherActive($state, 'pollen') ? 4 : 2;
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + $gain;
                $events[] = ['t' => 'leaf', 'seat' => $seat, 'v' => $gain];
                return $events;

            case 'spring':
                if ($semantics === 'weather') {
                    return [];
                }
                $gain = self::weatherActive($state, 'sun') ? 4 : 2;
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + $gain;
                $events[] = ['t' => 'spring', 'seat' => $seat, 'v' => $gain];
                return $events;

            case 'ladder':
                if ($semantics === 'weather') {
                    return [];
                }
                $to = (int) $cell['to'];
                $events[] = ['t' => 'ladder', 'seat' => $seat, 'from' => $pos, 'to' => $to];
                return array_merge($events, self::applyDisplacement($state, $seats, $seat, $to - $pos, 'machine', $depth + 1));

            case 'cable':
                if ($semantics === 'weather') {
                    return [];
                }
                if (self::weatherActive($state, 'cablehalt')) {
                    $events[] = ['t' => 'cableHalt', 'seat' => $seat];
                    return $events;
                }
                $to = (int) $cell['to'];
                $events[] = ['t' => 'cable', 'seat' => $seat, 'from' => $pos, 'to' => $to];
                return array_merge($events, self::applyDisplacement($state, $seats, $seat, $to - $pos, 'machine', $depth + 1));

            case 'slide':
                if ($semantics === 'weather') {
                    return [];
                }
                if (! empty($state['shields'][$uid])) {
                    $state['shields'][$uid] = false; // 滑雪板一次性护盾
                    $events[] = ['t' => 'shield', 'seat' => $seat];
                    return $events;
                }
                $to = (int) $cell['to'];
                if (self::weatherActive($state, 'storm')) {
                    $to = 2 * $to - $pos; // 后退距离翻倍（可能落到机关格，照常触发，营地托底兜住）
                }
                $events[] = ['t' => 'slide', 'seat' => $seat, 'from' => $pos, 'to' => $to];
                return array_merge($events, self::applyDisplacement($state, $seats, $seat, $to - $pos, 'machine', $depth + 1));

            case 'rock':
                if ($semantics === 'weather') {
                    return [];
                }
                if (! empty($state['shields'][$uid])) {
                    $state['shields'][$uid] = false;
                    $events[] = ['t' => 'shield', 'seat' => $seat];
                    return $events;
                }
                $back = (int) $cell['back'] * (self::weatherActive($state, 'storm') ? 2 : 1);
                $events[] = ['t' => 'rock', 'seat' => $seat, 'from' => $pos, 'back' => $back];
                return array_merge($events, self::applyDisplacement($state, $seats, $seat, -$back, 'machine', $depth + 1));

            case 'shop':
                if ($semantics === 'weather') {
                    return [];
                }
                if (count($state['items'][$uid] ?? []) >= self::HAND_LIMIT || (int) ($state['leaves'][$uid] ?? 0) < self::SHOP_PRICE) {
                    return [];
                }
                $state['pendingChoice'] = ['kind' => 'shop', 'seat' => $seat, 'cell' => $pos];
                return $events;

            case 'supply':
                if ($semantics === 'weather') {
                    return [];
                }
                $draws = self::weatherActive($state, 'sun') ? 2 : 1;
                for ($i = 0; $i < $draws; ++$i) {
                    if (count($state['items'][$uid] ?? []) < self::HAND_LIMIT) {
                        $item = self::drawItem();
                        $state['items'][$uid][] = $item;
                        $events[] = ['t' => 'supply', 'seat' => $seat, 'v' => $item];
                    } else {
                        $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 3; // 手牌满溢出换枫叶
                        $events[] = ['t' => 'leaf', 'seat' => $seat, 'v' => 3, 'via' => 'supply'];
                    }
                }
                return $events;

            case 'ambush':
                // 1) 踩雷判定（对手的雷；任何位移语义都会踩响，含天气）
                foreach (($state['traps'] ?? []) as $i => $trap) {
                    if ((int) $trap['cell'] === $pos && (string) $trap['owner'] !== $uid) {
                        array_splice($state['traps'], $i, 1);
                        $state['skipNext'][$seat] = true;
                        $events[] = ['t' => 'ambushHit', 'seat' => $seat, 'owner' => self::seatOfUid($seats, (string) $trap['owner']), 'cell' => $pos];
                        return array_merge($events, self::applyDisplacement($state, $seats, $seat, -3, 'item', $depth + 1));
                    }
                }
                // 2) 埋雷选择（天气位移不获得选择）
                if ($semantics === 'weather') {
                    return [];
                }
                if ((int) ($state['leaves'][$uid] ?? 0) >= self::AMBUSH_PRICE) {
                    $state['pendingChoice'] = ['kind' => 'ambush', 'seat' => $seat, 'cell' => $pos];
                }
                return $events;

            case 'fate':
                if ($semantics === 'weather') {
                    return [];
                }
                $ahead = self::nearestAhead($state, $seats, $seat);
                if ($ahead === null) {
                    $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 3;
                    $events[] = ['t' => 'fate', 'seat' => $seat, 'v' => 3];
                    return $events;
                }
                $tmp = (int) $state['positions'][$seat];
                $state['positions'][$seat] = (int) $state['positions'][$ahead];
                $state['positions'][$ahead] = $tmp;
                $events[] = ['t' => 'fate', 'seat' => $seat, 'with' => $ahead];
                return $events; // 换位不触发落格效果

            case 'shrine':
                if ($semantics === 'weather') {
                    return [];
                }
                // 山神猜拳：服务端连掷至分出胜负（0石头/1布/2剪刀，a胜b ⟺ (a-b+3)%3==1）
                do {
                    $me = random_int(0, 2);
                    $god = random_int(0, 2);
                } while ($me === $god);
                if (((($me - $god) + 3) % 3) === 1) {
                    $state['pendingChoice'] = ['kind' => 'shrine', 'seat' => $seat, 'cell' => $pos];
                    $events[] = ['t' => 'shrineWin', 'seat' => $seat, 'me' => $me, 'god' => $god];
                } else {
                    $events[] = ['t' => 'shrineLose', 'seat' => $seat, 'me' => $me, 'god' => $god];
                    $leaves = (int) ($state['leaves'][$uid] ?? 0);
                    if ($leaves >= 2) {
                        $state['leaves'][$uid] = $leaves - 2;
                    } else {
                        return array_merge($events, self::applyDisplacement($state, $seats, $seat, -2, 'item', $depth + 1));
                    }
                }
                return $events;

            case 'arena':
                if ($semantics === 'weather') {
                    return [];
                }
                if (self::arenaCandidates($state, $seats, $seat) === []) {
                    return [];
                }
                $state['pendingChoice'] = ['kind' => 'arena', 'seat' => $seat, 'cell' => $pos];
                return $events;

            case 'avalanche':
                if ($semantics === 'weather') {
                    return [];
                }
                $events[] = ['t' => 'avalanche', 'seat' => $seat, 'cell' => $pos];
                $n = count($seats);
                for ($s = 0; $s < $n; ++$s) {
                    if ($s === $seat || self::seatInactive($state, $s)) {
                        continue;
                    }
                    $p = (int) ($state['positions'][$s] ?? 0);
                    if ($p >= $pos - 5 && $p < $pos) {
                        $events = array_merge($events, self::applyDisplacement($state, $seats, $s, -2, 'item', $depth + 1));
                    }
                }
                return $events;

            case 'fork':
                if ($semantics === 'weather') {
                    return [];
                }
                $state['pendingChoice'] = ['kind' => 'fork', 'seat' => $seat, 'cell' => $pos];
                return $events;

            case 'summit':
                return $events; // applyDisplacement 已处理
        }
        return $events;
    }

    // ---------------------------------------------------------------- 决斗

    /**
     * 开启决斗：$b=null 进入选人阶段（多人在格），否则直接进入出招；
     * 清溪谷（比点数）服务端即出即结，不进窗口。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function startDuel(array &$state, array $seats, int $a, ?int $b = null, bool $arena = false): array
    {
        $pos = (int) $state['positions'][$a];
        $seg = AdventureBoard::segmentOf($pos);
        $duel = [
            'a' => $a,
            'b' => $b,
            'format' => (string) $seg['duel'],
            'phase' => 'pick',
            'round' => 1,
            'picks' => [],
            'bets' => [],
            'arena' => $arena,
            // 擂台筹码固定 +3/-3（覆盖段位翻倍）；普通决斗按段位 1/3、雪线 2/6
            'win' => $arena ? 3 : ($seg['duelDouble'] ? 2 : 1),
            'lose' => $arena ? 3 : ($seg['duelDouble'] ? 6 : 3),
        ];
        $events = [['t' => 'duelStart', 'a' => $a, 'b' => $b, 'format' => $duel['format'], 'cell' => $pos, 'arena' => $arena]];

        if ($b === null) {
            $state['pendingDuel'] = $duel;
            return $events;
        }
        $duel['b'] = $b;
        return array_merge($events, self::beginDuelAct($state, $seats, $duel));
    }

    /** 进入出招阶段；比点数格式立即结算。 */
    private static function beginDuelAct(array &$state, array $seats, array $duel): array
    {
        if ($duel['format'] === 'dice') {
            $state['pendingDuel'] = $duel;
            return self::resolveDuelNow($state, $seats);
        }
        $duel['phase'] = 'act';
        $state['pendingDuel'] = $duel;
        return [];
    }

    /** 选人阶段的候选（同格的其他可行动玩家）。 */
    public static function duelCandidates(array $state, array $seats, int $a): array
    {
        return self::occupantsAt($state, $seats, (int) $state['positions'][$a], $a);
    }

    /**
     * 决斗输入：选人阶段 value=对手座位；出招阶段 value=rps 拳码 / bid 暗标值。
     * 双方到齐即结算。返回事件列表。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function submitDuelInput(array &$state, array $seats, int $seat, mixed $value): array
    {
        $duel = $state['pendingDuel'];
        if (($duel['phase'] ?? '') === 'pick') {
            $duel['b'] = (int) $value;
            $events = [['t' => 'duelTarget', 'a' => (int) $duel['a'], 'b' => (int) $duel['b']]];
            $state['pendingDuel'] = $duel;
            return array_merge($events, self::beginDuelAct($state, $seats, $duel));
        }
        $duel['picks'][(string) $seat] = $value;
        $state['pendingDuel'] = $duel;
        if (count($duel['picks']) >= 2) {
            return self::resolveDuelNow($state, $seats);
        }
        return [];
    }

    /** 某座位是否已出招。 */
    public static function duelPicked(array $duel, int $seat): bool
    {
        return array_key_exists((string) $seat, $duel['picks'] ?? []);
    }

    /**
     * 决斗结算（双方已出招）：平局重开（上限 3 轮后转比点数）；胜者前移/败者后退/押注赔付。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function resolveDuelNow(array &$state, array $seats): array
    {
        $duel = $state['pendingDuel'];
        $a = (int) $duel['a'];
        $b = (int) $duel['b'];
        $events = [];
        $winner = null;

        if ($duel['format'] === 'dice') {
            [$da, $db, $winner] = self::diceOff();
            $events[] = ['t' => 'duelPick', 'format' => 'dice', 'v' => [(string) $a => $da, (string) $b => $db]];
        } elseif ($duel['format'] === 'rps') {
            $pa = self::rpsFill($duel['picks'][(string) $a] ?? null);
            $pb = self::rpsFill($duel['picks'][(string) $b] ?? null);
            $events[] = ['t' => 'duelPick', 'format' => 'rps', 'v' => [(string) $a => $pa, (string) $b => $pb]];
            if ($pa === $pb) {
                if ((int) $duel['round'] >= self::DUEL_MAX_ROUNDS) {
                    [, , $winner] = self::diceOff();
                    $events[] = ['t' => 'duelDiceOff', 'winner' => $winner];
                } else {
                    $duel['round'] = (int) $duel['round'] + 1;
                    $duel['picks'] = [];
                    $state['pendingDuel'] = $duel;
                    $events[] = ['t' => 'duelTie', 'round' => $duel['round']];
                    return $events;
                }
            } else {
                $winner = ((($pa - $pb) + 3) % 3) === 1 ? $a : $b;
            }
        } else { // bid：价高者胜且赢家支付所标枫叶
            $ba = self::bidFill($duel['picks'][(string) $a] ?? null, (int) ($state['leaves'][(string) $seats[$a]] ?? 0));
            $bb = self::bidFill($duel['picks'][(string) $b] ?? null, (int) ($state['leaves'][(string) $seats[$b]] ?? 0));
            $events[] = ['t' => 'duelPick', 'format' => 'bid', 'v' => [(string) $a => $ba, (string) $b => $bb]];
            if ($ba === $bb) {
                [, , $winner] = self::diceOff();
                $events[] = ['t' => 'duelDiceOff', 'winner' => $winner];
            } else {
                $winner = $ba > $bb ? $a : $b;
                $wuid = (string) $seats[$winner];
                $paid = $winner === $a ? $ba : $bb;
                $state['leaves'][$wuid] = max(0, (int) ($state['leaves'][$wuid] ?? 0) - $paid);
                $events[] = ['t' => 'bidPaid', 'seat' => $winner, 'v' => $paid];
            }
        }

        $loser = $winner === $a ? $b : $a;
        $winSteps = (int) $duel['win'] + (self::weatherActive($state, 'huntwind') ? 1 : 0);
        $loseSteps = (int) $duel['lose'];
        $events[] = ['t' => 'duelResult', 'winner' => $winner, 'loser' => $loser, 'win' => $winSteps, 'lose' => $loseSteps];

        $state['pendingDuel'] = null;
        if (! empty($state['turnCtx'])) {
            $state['turnCtx']['duelDone'] = true; // 一回合最多一场决斗
        }
        $events = array_merge($events, self::applyDisplacement($state, $seats, $winner, $winSteps, 'item'));
        $events = array_merge($events, self::applyDisplacement($state, $seats, $loser, -$loseSteps, 'item'));

        // 押注赔付：押中返还 3（下注时已扣 1）
        $betWins = [];
        foreach (($duel['bets'] ?? []) as $bet) {
            if ((int) $bet['on'] === $winner) {
                $buid = (string) $bet['uid'];
                $state['leaves'][$buid] = (int) ($state['leaves'][$buid] ?? 0) + self::BET_PAYOUT;
                $betWins[] = self::seatOfUid($seats, $buid);
            }
        }
        if ($betWins !== []) {
            $events[] = ['t' => 'betWin', 'v' => $betWins];
        }
        return $events;
    }

    /** 比点数：各掷 1 骰至分出胜负。@return array{0:int,1:int,2:int} [da, db, winnerSeatRelative0=a] */
    private static function diceOff(): array
    {
        do {
            $da = random_int(1, 6);
            $db = random_int(1, 6);
        } while ($da === $db);
        return [$da, $db, $da > $db ? 0 : 1];
    }

    /** 猜拳值兜底：缺拳（超时/托管）随机代出。 */
    private static function rpsFill(mixed $value): int
    {
        if (is_int($value) && $value >= 0 && $value <= 2) {
            return $value;
        }
        return random_int(0, 2);
    }

    /** 暗标值兜底：缺标随机 0-3，并夹到 0..min(5, 枫叶数)。 */
    private static function bidFill(mixed $value, int $leaves): int
    {
        $v = is_int($value) ? $value : random_int(0, 3);
        return max(0, min(5, min($v, $leaves)));
    }

    // ---------------------------------------------------------------- 选择窗

    /**
     * 应用选择窗结果（岔路/埋伏/商店/山神奖励/擂台挑战对象）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function applyChoice(array &$state, array $seats, int $seat, string $value): array
    {
        $choice = $state['pendingChoice'];
        $kind = (string) $choice['kind'];
        $state['pendingChoice'] = null;
        $uid = (string) $seats[$seat];
        $events = [];

        switch ($kind) {
            case 'fork':
                $cell = AdventureBoard::cell((int) $choice['cell']);
                $opt = null;
                foreach (($cell['options'] ?? []) as $o) {
                    if ((string) $o['key'] === $value) {
                        $opt = $o;
                        break;
                    }
                }
                $events[] = ['t' => 'fork', 'seat' => $seat, 'v' => $value];
                if ($opt !== null && $opt['to'] !== null) {
                    $to = (int) $opt['to'];
                    return array_merge($events, self::applyDisplacement($state, $seats, $seat, $to - (int) $state['positions'][$seat], 'machine'));
                }
                return $events; // 山道：原地继续

            case 'ambush':
                $armed = $value === 'yes';
                $events[] = ['t' => 'ambushSet', 'seat' => $seat, 'cell' => (int) $choice['cell'], 'v' => $armed];
                if ($armed) {
                    $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) - self::AMBUSH_PRICE;
                    $state['traps'][] = ['cell' => (int) $choice['cell'], 'owner' => $uid];
                }
                return $events;

            case 'shop':
                $bought = $value === 'yes';
                if ($bought) {
                    $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) - self::SHOP_PRICE;
                    $item = self::drawItem();
                    $state['items'][$uid][] = $item;
                    $events[] = ['t' => 'shop', 'seat' => $seat, 'v' => $item];
                } else {
                    $events[] = ['t' => 'shop', 'seat' => $seat, 'v' => null];
                }
                return $events;

            case 'shrine':
                $events[] = ['t' => 'shrineReward', 'seat' => $seat, 'v' => $value];
                if ($value === 'forward') {
                    return array_merge($events, self::applyDisplacement($state, $seats, $seat, 4, 'item'));
                }
                if ($value === 'item') {
                    if (count($state['items'][$uid] ?? []) < self::HAND_LIMIT) {
                        $state['items'][$uid][] = self::drawItem();
                    } else {
                        $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 3; // 手牌满换枫叶
                    }
                    return $events;
                }
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 3;
                return $events;

            case 'arena':
                return self::startDuel($state, $seats, $seat, (int) $value, true);
        }
        return $events;
    }

    /** 选择窗超时默认：岔路=山道、埋伏/商店=不、山神=随机、擂台=前方最近。 */
    public static function defaultChoiceValue(array $state, array $seats): string
    {
        $choice = $state['pendingChoice'];
        return match ((string) $choice['kind']) {
            'fork' => 'trail',
            'ambush' => 'no',
            'shop' => 'no',
            'shrine' => ['forward', 'item', 'leaves'][random_int(0, 2)],
            'arena' => (string) (self::nearestAhead($state, $seats, (int) $choice['seat'])
                ?? (self::arenaCandidates($state, $seats, (int) $choice['seat'])[0] ?? 0)),
            default => '',
        };
    }

    // ---------------------------------------------------------------- 道具

    /**
     * 应用道具效果并从手牌移除（归属/时机校验在服务端）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function applyItem(array &$state, array $seats, int $seat, string $itemId, ?int $targetSeat): array
    {
        $uid = (string) $seats[$seat];
        $hand = $state['items'][$uid] ?? [];
        $idx = array_search($itemId, $hand, true);
        if ($idx !== false) {
            array_splice($hand, $idx, 1);
        }
        $state['items'][$uid] = array_values($hand);
        $events = [['t' => 'item', 'seat' => $seat, 'v' => $itemId, 'target' => $targetSeat]];

        switch ($itemId) {
            case 'pickaxe':
                $state['turnBonus'] = (int) ($state['turnBonus'] ?? 0) + 2;
                break;
            case 'skis':
                $state['shields'][$uid] = true;
                break;
            case 'gale':
                if ($targetSeat !== null) {
                    $events = array_merge($events, self::applyDisplacement($state, $seats, (int) $targetSeat, -4, 'item'));
                }
                break;
            case 'snowball':
                if ($targetSeat !== null) {
                    $state['slowNext'][(int) $targetSeat] = (int) ($state['slowNext'][(int) $targetSeat] ?? 0) + 3;
                }
                break;
            case 'cloak':
                if ($targetSeat !== null) {
                    $tmp = (int) $state['positions'][$seat];
                    $state['positions'][$seat] = (int) $state['positions'][(int) $targetSeat];
                    $state['positions'][(int) $targetSeat] = $tmp;
                    // 换位不触发落格效果
                }
                break;
            case 'cablecar':
                foreach (AdventureBoard::CABLE_STATIONS as $station) {
                    if ($station > (int) $state['positions'][$seat]) {
                        $events = array_merge($events, self::applyDisplacement($state, $seats, $seat, $station - (int) $state['positions'][$seat], 'machine'));
                        break;
                    }
                }
                break;
            case 'pouch':
                $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 5;
                break;
            case 'weather':
                $deck = $state['weather']['deck'] ?? [];
                if ($deck === []) {
                    $deck = self::shuffled(AdventureBoard::weatherDeckIds());
                }
                $state['weather']['next'] = array_shift($deck);
                $state['weather']['deck'] = $deck;
                $events[] = ['t' => 'weatherChange', 'next' => $state['weather']['next']];
                break;
        }
        return $events;
    }

    /** 随机摸一张道具（改天换地权重减半）。 */
    public static function drawItem(): string
    {
        $pool = [];
        foreach (array_keys(AdventureBoard::ITEMS) as $id) {
            $pool[] = $id;
            if ($id !== 'weather') {
                $pool[] = $id;
            }
        }
        return (string) $pool[random_int(0, count($pool) - 1)];
    }

    // ---------------------------------------------------------------- 天气

    /**
     * 一轮打满翻天气牌：current=next、补 next；即时牌当场结算（天气位移语义）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function weatherFlip(array &$state, array $seats): array
    {
        $w = $state['weather'];
        $w['current'] = $w['next'] ?? null;
        $deck = $w['deck'] ?? [];
        if ($deck === []) {
            $deck = self::shuffled(AdventureBoard::weatherDeckIds());
        }
        $w['next'] = array_shift($deck);
        $w['deck'] = $deck;
        $state['weather'] = $w;
        $events = [['t' => 'weather', 'v' => $w['current']]];

        $n = count($seats);
        $active = [];
        for ($s = 0; $s < $n; ++$s) {
            if (! in_array($s, $state['leftSeats'] ?? [], true) && ! in_array($s, $state['finishedOrder'] ?? [], true)) {
                $active[] = $s;
            }
        }
        // 已登顶/已离开者不再被天气移动；枫叶雨人人都拿（离开者无所谓）
        switch ((string) $w['current']) {
            case 'tailwind':
                foreach ($active as $s) {
                    $events = array_merge($events, self::applyDisplacement($state, $seats, $s, 2, 'weather'));
                }
                break;
            case 'galewind':
                foreach ($active as $s) {
                    $events = array_merge($events, self::applyDisplacement($state, $seats, $s, -3, 'weather'));
                }
                break;
            case 'leafrain':
                for ($s = 0; $s < $n; ++$s) {
                    if (in_array($s, $state['leftSeats'] ?? [], true)) {
                        continue;
                    }
                    $uid = (string) $seats[$s];
                    $state['leaves'][$uid] = (int) ($state['leaves'][$uid] ?? 0) + 3;
                }
                $events[] = ['t' => 'leafrain', 'v' => 3];
                break;
            case 'landslide':
                if ($active !== []) {
                    usort($active, static fn($x, $y) => [(int) $state['positions'][$y], $x] <=> [(int) $state['positions'][$x], $y]);
                    $first = $active[0];
                    $last = $active[count($active) - 1];
                    $events = array_merge($events, self::applyDisplacement($state, $seats, $first, -5, 'weather'));
                    $events = array_merge($events, self::applyDisplacement($state, $seats, $last, 3, 'weather'));
                    // 并列（同格）按座位序：上面排序位置 desc 后座位 asc，first 取最高位最小座号
                }
                break;
            case 'tornado':
                foreach ($active as $s) {
                    $d = random_int(1, 6);
                    $events[] = ['t' => 'tornado', 'seat' => $s, 'v' => $d];
                    $events = array_merge($events, self::applyDisplacement($state, $seats, $s, $d >= 4 ? $d : -$d, 'weather'));
                }
                break;
        }
        return $events;
    }

    // ---------------------------------------------------------------- 回合推进与终局

    /**
     * 回合推进：标记已行动、一轮打满翻天气、跳过离开/登顶/被跳过的座位。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function advanceTurn(array &$state, array $seats): array
    {
        $events = [];
        $n = count($seats);
        $justSat = ! empty($state['turnCtx']) ? (int) $state['turnCtx']['seat'] : (int) $state['currentSeat'];
        $marked = $state['roundMarked'] ?? [];
        if (! in_array($justSat, $marked, true)) {
            $marked[] = $justSat;
        }

        $allMarked = true;
        for ($s = 0; $s < $n; ++$s) {
            if (! self::seatInactive($state, $s) && ! in_array($s, $marked, true)) {
                $allMarked = false;
                break;
            }
        }
        if ($allMarked) {
            $marked = [];
            $events = array_merge($events, self::weatherFlip($state, $seats));
        }
        $state['roundMarked'] = $marked;

        for ($i = 1; $i <= $n; ++$i) {
            $s = ($justSat + $i) % $n;
            if (self::seatInactive($state, $s)) {
                continue;
            }
            if (! empty($state['skipNext'][$s])) {
                unset($state['skipNext'][$s]);
                $marked = $state['roundMarked'];
                if (! in_array($s, $marked, true)) {
                    $marked[] = $s; // 被跳过也算“行动”过，天气照常翻
                    $state['roundMarked'] = $marked;
                }
                $events[] = ['t' => 'skip', 'seat' => $s];
                continue;
            }
            $state['currentSeat'] = $s;
            $state['phase'] = 'act';
            $state['roll'] = null;
            $state['turnBonus'] = 0;
            $state['turnCtx'] = null;
            return $events;
        }
        return $events; // 无可行动座位（终局，由调用方 isGameOver 收尾）
    }

    /** 终局判定：活跃（未离开未登顶）座位 ≤ 1。 */
    public static function isGameOver(array $state, array $seats): bool
    {
        $n = count($seats);
        $active = 0;
        for ($s = 0; $s < $n; ++$s) {
            if (! self::seatInactive($state, $s) && ++$active >= 2) {
                return false;
            }
        }
        return true;
    }

    /**
     * 终局排名（seat → 1-based 名次），三组依次：
     * 1) finishedOrder（登顶顺序）；2) 活跃未登顶（位置 desc、座位号 asc）；
     * 3) 离开者（leftProgress 快照 desc、座位号 asc）——中途退出永不排在存活者之前。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, int>
     */
    public static function computePlaces(array $state, array $seats): array
    {
        $n = count($seats);
        $ranked = array_values($state['finishedOrder'] ?? []);
        $left = $state['leftSeats'] ?? [];
        $activeTail = [];
        $leftTail = [];
        for ($s = 0; $s < $n; ++$s) {
            if (in_array($s, $ranked, true)) {
                continue;
            }
            $pos = in_array($s, $left, true)
                ? (int) ($state['leftProgress'][$s] ?? 0)
                : (int) ($state['positions'][$s] ?? 0);
            $entry = ['seat' => $s, 'pos' => $pos];
            if (in_array($s, $left, true)) {
                $leftTail[] = $entry;
            } else {
                $activeTail[] = $entry;
            }
        }
        $cmp = static fn($a, $b) => [$b['pos'], $a['seat']] <=> [$a['pos'], $b['seat']];
        usort($activeTail, $cmp);
        usort($leftTail, $cmp);
        foreach ([...$activeTail, ...$leftTail] as $item) {
            $ranked[] = $item['seat'];
        }
        $places = [];
        foreach ($ranked as $i => $s) {
            $places[$s] = $i + 1;
        }
        return $places;
    }

    // ---------------------------------------------------------------- 开局

    /**
     * 开局状态：全员山脚（pos=0）、3 枫叶、天气牌库洗好、预报公开；
     * 先手由「定先手」掷骰仪式决定（phase=opening，全员掷双骰点大者先手）。
     * $goal 登顶格（房主设定，默认 100）。
     *
     * @param array<int, int> $seats
     * @return array<string, mixed>
     */
    public static function setupGame(array $seats, int $goal = AdventureBoard::SUMMIT): array
    {
        $n = count($seats);
        $deck = self::shuffled(AdventureBoard::weatherDeckIds());
        $next = array_shift($deck);
        return [
            'phase' => 'opening',
            'currentSeat' => null,
            'opening' => ['round' => 1, 'tieSeats' => [], 'rolls' => []],
            'roundMarked' => [],
            'roll' => null,
            'turnBonus' => 0,
            'turnCtx' => null,
            'positions' => array_fill(0, $n, 0),
            'campFloor' => array_fill(0, $n, 0),
            'leaves' => array_fill_keys(array_map('strval', $seats), self::START_LEAVES),
            'items' => array_fill_keys(array_map('strval', $seats), []),
            'shields' => [],
            'slowNext' => [],
            'skipNext' => [],
            'traps' => [],
            'pendingChoice' => null,
            'pendingDuel' => null,
            'weather' => ['current' => null, 'next' => $next, 'deck' => $deck],
            'goal' => $goal,
            'finishedOrder' => [],
            'leftSeats' => [],
            'leftProgress' => [],
            'auto' => [],
            'idleStrikes' => [],
            'places' => null,
            'events' => [],
            'scores' => array_fill_keys(array_map('strval', $seats), 0),
        ];
    }

    /** 重开：保留 scores 与路线长度；聊天三件套由服务端 carryChat 带回。 */
    public static function resetForRematch(array $state, array $seats): array
    {
        $scores = $state['scores'] ?? [];
        $goal = (int) ($state['goal'] ?? AdventureBoard::SUMMIT);
        $fresh = self::setupGame($seats, $goal);
        $fresh['scores'] = $scores;
        return $fresh;
    }

    /** 洗牌（服务端权威随机）。 */
    private static function shuffled(array $items): array
    {
        $keys = array_keys($items);
        shuffle($keys);
        $out = [];
        foreach ($keys as $k) {
            $out[] = $items[$k];
        }
        return $out;
    }
}
