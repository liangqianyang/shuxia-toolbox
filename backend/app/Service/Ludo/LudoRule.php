<?php

declare(strict_types=1);

namespace App\Service\Ludo;

/**
 * 飞行棋纯规则引擎：无副作用静态方法，服务端权威判定（经典规则，无叠子村规）。
 *
 * 几何模型（玩家相对距离 d，前后端唯一真相）：
 * - 主道 52 格闭环，颜色每 4 格循环；各色起飞格相距 13（绝对格 = 己色起飞格 + d mod 52）；
 * - d=0 己方起飞格（星标），d=1..50 主道（己色格 = d≡0 mod 4），d=51..55 己方跑道（私有），d=56 终点；
 * - 每机 4 架，pos = -1（机场）或 0..56。
 *
 * 规则要点（判定顺序：每次到格先结算击落——星标格除外，再触发移动效果）：
 * - 掷 6 起飞；掷 6 的回合移动完后再掷一次（额外回合链）；
 * - 骰落己色格（d∈{4,8,…,44}）跳 +4；48 不跳（目标已入跑道）；跳后不再连跳；
 * - 飞行格 d=16：飞行【取代】跳跃——碾压途中 d=22 格上敌机、飞至 d=28（己色）再接跳到 32；
 *   跳跃落上 16 同样触发飞行（经典大连招：骰→12 跳→16 飞→28 跳→32）；
 * - 星标格 {0,13,26,39}（四个起飞格）不可被击落、多机共存；
 * - 跑道私有无冲突；终点需精确步数，超出反弹（newD = 112 − pos − roll）；
 * - 4 机全部到 56 即完成；活跃未完成 ≤ 1 人时终局。
 *
 * 前端 src/utils/ludo.ts 有一份平行实现，仅用于即时 UI 反馈与单测，冲突以本类为准
 * （常量两边同步，同拼豆色卡/unoChat 的既有约定）。
 */
final class LudoRule
{
    public const int PLANES = 4;

    public const int JOURNEY = 56;

    public const int MAIN_CELLS = 52;

    public const int TAKEOFF_ROLL = 6;

    /** 飞行格（相对距离）：飞行取代跳跃。 */
    public const int FLY_FROM = 16;

    public const int FLY_TO = 28;

    /** 飞行弧正下方的碾压格（相对距离）。 */
    public const int CRUSH_CELL = 22;

    /** 星标保护格（相对距离 = 四个起飞格）：不可击落、可共存。 */
    public const array STAR_CELLS = [0, 13, 26, 39];

    /** 座位数 → 座位颜色映射（0红/1黄/2蓝/3绿）。2 人取对角（飞线穿越对手区）。 */
    public const array SEAT_COLORS = [2 => [0, 2], 3 => [0, 1, 2], 4 => [0, 1, 2, 3]];

    public const int MAX_PLAYERS = 4;

    public const int HANGAR = -1;

    /** 定先手掷骰（单骰点大者先手）的并列重掷上限；超过后随机定（诚实 RNG 下几乎不可达）。 */
    public const int OPENING_MAX_ROUNDS = 3;

    // ---------------------------------------------------------------- 定先手（开局掷骰仪式）

    /** 定先手阶段还没掷骰的座位（未离开；并列重掷轮只算并列者）。 */
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
     * 定先手掷骰（调用方已校验该轮到该座位）：单骰 1-6，全员掷完即结算。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function rollOpening(array &$state, array $seats, int $seat): array
    {
        $dice = random_int(1, 6);
        $state['opening']['rolls'][(string) $seat] = $dice;
        $events = [['t' => 'openRoll', 'seat' => $seat, 'v' => $dice]];
        return array_merge($events, self::resolveOpeningIfNeeded($state, $seats));
    }

    /**
     * 全员掷完后结算：单骰点大者先手；最大点并列只由并列者重掷；
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
        $best = 0;
        foreach ($opening['rolls'] as $value) {
            $best = max($best, (int) $value);
        }
        $winners = array_keys(array_filter($opening['rolls'], static fn($v) => (int) $v === $best));

        if (count($winners) === 1) {
            $winner = (int) $winners[0];
            $state['phase'] = 'roll';
            $state['currentSeat'] = $winner;
            $state['opening'] = null;
            return [['t' => 'firstPlayer', 'seat' => $winner, 'v' => $opening['rolls']]];
        }
        if ((int) $opening['round'] >= self::OPENING_MAX_ROUNDS) {
            $winner = (int) $winners[random_int(0, count($winners) - 1)];
            $state['phase'] = 'roll';
            $state['currentSeat'] = $winner;
            $state['opening'] = null;
            return [['t' => 'firstPlayer', 'seat' => $winner, 'v' => $opening['rolls'], 'cap' => true]];
        }
        $state['opening'] = [
            'round' => (int) $opening['round'] + 1,
            'tieSeats' => array_map('intval', $winners),
            'rolls' => [],
        ];
        return [['t' => 'openTie', 'v' => array_map('intval', $winners), 'round' => (int) $opening['round'] + 1]];
    }

    /** 某色起飞格的绝对格（红 0 / 黄 13 / 蓝 26 / 绿 39）。 */
    public static function colorStart(int $color): int
    {
        return $color * 13;
    }

    /** 相对距离 d（≤50）的绝对格。 */
    public static function absoluteCell(int $color, int $d): int
    {
        return (self::colorStart($color) + $d) % self::MAIN_CELLS;
    }

    /**
     * 核心求解：座位 $seat 的 $planeIdx 号机掷 $roll 的完整走法。
     * 一份实现两处调用——roll 时逐机生成合法菜单、move 时权威重算应用（防止双实现漂移）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return null|array<string, mixed> 不可走返回 null；否则 {p, from, to, wp[], fx[], finish}
     */
    public static function resolveMove(array $state, array $seats, int $seat, int $planeIdx, int $roll): ?array
    {
        $planes = $state['planes'];
        if ($planeIdx < 0 || $planeIdx >= self::PLANES) {
            return null;
        }
        $pos = (int) $planes[$seat][$planeIdx];
        $color = (int) $state['colors'][$seat];

        if ($pos === self::HANGAR) {
            if ($roll !== self::TAKEOFF_ROLL) {
                return null;
            }
            // 起飞落 d=0 星标格：无击落无效果（与敌机共存）
            return [
                'p' => $planeIdx,
                'from' => $pos,
                'to' => 0,
                'wp' => [['d' => 0]],
                'fx' => [['t' => 'takeoff', 'p' => $planeIdx]],
                'finish' => false,
            ];
        }
        if ($pos === self::JOURNEY) {
            return null; // 已到终点的飞机不能再动（防反弹步把完成机拉回来）
        }

        // 骰步：主道上 pos≤50 掷任何点数都不会越过 56；仅跑道内会反弹
        $target = $pos + $roll;
        $newD = $target <= self::JOURNEY ? $target : 2 * self::JOURNEY - $target;
        $wp = $target <= self::JOURNEY ? [['d' => $newD]] : [['d' => self::JOURNEY], ['d' => $newD]];
        $fx = [];

        // 逐步结算：dice → (capture) → 效果(跳/飞) → (capture) → …；跳后不再跳、但跳上飞行格要飞
        $cur = $newD;
        $mechanism = 'dice';
        for ($hop = 0; $hop < 4; ++$hop) {
            $onMain = $cur <= 50;
            if ($onMain) {
                $victims = self::victimsAt($state, $seats, $seat, $color, $cur);
                if ($victims !== []) {
                    $fx[] = ['t' => 'capture', 'd' => $cur, 'v' => $victims];
                }
            }
            if (! $onMain || $cur % 4 !== 0 || $cur < 4 || $cur > 48) {
                break; // 非己色格 / 起飞格 / 48 死格 / 跑道：无效果
            }
            if ($cur === self::FLY_FROM && $mechanism !== 'fly') {
                // 飞行（取代跳跃；飞落 28 后的接跳走下一轮 hop）
                $fx[] = ['t' => 'fly', 'from' => self::FLY_FROM, 'to' => self::FLY_TO];
                $crush = self::victimsAt($state, $seats, $seat, $color, self::CRUSH_CELL);
                if ($crush !== []) {
                    $fx[] = ['t' => 'crush', 'd' => self::CRUSH_CELL, 'v' => $crush];
                }
                $wp[] = ['d' => self::FLY_TO, 'arc' => true];
                $cur = self::FLY_TO;
                $mechanism = 'fly';
                continue;
            }
            if ($mechanism === 'dice' || $mechanism === 'fly') {
                if ($cur <= 44) { // 48 不跳（目标 52 已入跑道）
                    $fx[] = ['t' => 'jump', 'from' => $cur, 'to' => $cur + 4];
                    $wp[] = ['d' => $cur + 4];
                    $cur += 4;
                    $mechanism = 'jump';
                    continue;
                }
            }
            break; // 跳后不再跳（落点是己色也不再跳）
        }

        return [
            'p' => $planeIdx,
            'from' => $pos,
            'to' => $cur,
            'wp' => $wp,
            'fx' => $fx,
            'finish' => $cur === self::JOURNEY,
        ];
    }

    /**
     * $cell（相对距离 ≤50）上的敌机（除星标格）：被击落/碾压的 [seat, planeIdx] 列表。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<int, int>>
     */
    public static function victimsAt(array $state, array $seats, int $seat, int $color, int $cell): array
    {
        $abs = self::absoluteCell($color, $cell);
        if (in_array($abs, [0, 13, 26, 39], true)) {
            return []; // 星标格保护
        }
        $victims = [];
        $n = count($seats);
        for ($s = 0; $s < $n; ++$s) {
            if ($s === $seat || in_array($s, $state['leftSeats'] ?? [], true)) {
                continue;
            }
            foreach ($state['planes'][$s] as $p => $theirPos) {
                $their = (int) $theirPos;
                if ($their >= 0 && $their <= 50 && self::absoluteCell((int) $state['colors'][$s], $their) === $abs) {
                    $victims[] = [$s, (int) $p];
                }
            }
        }
        return $victims;
    }

    /**
     * 应用走法（调用方已校验合法性）：更新飞机坐标、结算击落/碾压，返回事件列表。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function applyMove(array &$state, array $seats, int $seat, int $planeIdx, int $roll): array
    {
        $outcome = self::resolveMove($state, $seats, $seat, $planeIdx, $roll);
        if ($outcome === null) {
            // 防御：合法走法菜单与实际应用之间状态不一致时静默放弃（不该发生；调用方均先经 legalMoves 校验）
            return [];
        }
        $events = [];
        foreach ($outcome['fx'] as $item) {
            $event = $item + ['seat' => $seat];
            if (in_array($item['t'], ['capture', 'crush'], true)) {
                foreach ($item['v'] as $v) {
                    $state['planes'][$v[0]][$v[1]] = self::HANGAR;
                }
            }
            $events[] = $event;
        }
        $state['planes'][$seat][$planeIdx] = (int) $outcome['to'];
        if ($outcome['finish']) {
            $event = ['t' => 'finish', 'seat' => $seat, 'p' => $planeIdx];
            $events[] = $event;
            if (self::seatFinished($state, $seat) && ! in_array($seat, $state['finishedOrder'], true)) {
                $state['finishedOrder'][] = $seat;
            }
        }
        return $events;
    }

    /**
     * 掷骰后的合法走法菜单（每架可走的机一条）。
     *
     * @param array<string, mixed> $state
     * @param array<int, int> $seats
     * @return array<int, array<string, mixed>>
     */
    public static function legalMoves(array $state, array $seats, int $seat, int $roll): array
    {
        $moves = [];
        for ($p = 0; $p < self::PLANES; ++$p) {
            $move = self::resolveMove($state, $seats, $seat, $p, $roll);
            if ($move !== null) {
                $moves[] = $move;
            }
        }
        return $moves;
    }

    /** 座位是否 4 机全部到终点。 */
    public static function seatFinished(array $state, int $seat): bool
    {
        foreach ($state['planes'][$seat] as $pos) {
            if ((int) $pos !== self::JOURNEY) {
                return false;
            }
        }
        return true;
    }

    /** 活跃（未离开未完成）座位里从 $fromSeat 顺时针下一个；全部扫完仍找不到返回 $fromSeat（防御）。 */
    public static function nextSeat(array $state, array $seats, int $fromSeat): int
    {
        $n = count($seats);
        for ($i = 1; $i <= $n; ++$i) {
            $s = ($fromSeat + $i) % $n;
            if (! in_array($s, $state['leftSeats'] ?? [], true) && ! in_array($s, $state['finishedOrder'] ?? [], true)) {
                return $s;
            }
        }
        return $fromSeat;
    }

    /** 终局判定：活跃未完成座位 ≤ 1。 */
    public static function isGameOver(array $state, array $seats): bool
    {
        $n = count($seats);
        for ($s = 0; $s < $n; ++$s) {
            if (in_array($s, $state['leftSeats'] ?? [], true)) {
                continue;
            }
            if (! in_array($s, $state['finishedOrder'] ?? [], true)) {
                // 找到一个未完成的活跃座位：再确认是否还有第二个
                for ($s2 = $s + 1; $s2 < $n; ++$s2) {
                    if (! in_array($s2, $state['leftSeats'] ?? [], true) && ! in_array($s2, $state['finishedOrder'] ?? [], true)) {
                        return false;
                    }
                }
                return true;
            }
        }
        return true;
    }

    /**
     * 终局排名（seat → 1-based 名次），三组依次：
     * 1) finishedOrder（完成 4 机的顺序）；
     * 2) 活跃未完成（按 到终机数 desc、进度和 desc、座位号 asc）；
     * 3) 离开者（同上比较，用 leftProgress 快照）——中途退出永不排在存活者之前
     *    （2 人局逃跑判负、最后在线者胜的语义由本条保证）。
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
            $planes = in_array($s, $left, true)
                ? ($state['leftProgress'][(string) $s] ?? [])
                : $state['planes'][$s];
            $done = 0;
            $progress = 0;
            foreach ($planes as $pos) {
                $pos = (int) $pos;
                if ($pos === self::JOURNEY) {
                    ++$done;
                }
                if ($pos > 0) {
                    $progress += $pos;
                }
            }
            $entry = ['seat' => $s, 'done' => $done, 'progress' => $progress];
            if (in_array($s, $left, true)) {
                $leftTail[] = $entry;
            } else {
                $activeTail[] = $entry;
            }
        }
        $cmp = static fn($a, $b) => [$b['done'], $b['progress'], $a['seat']] <=> [$a['done'], $a['progress'], $b['seat']];
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

    /**
     * 超时/托管自动选机（确定性）：能终局 > 击落数（含碾压）> 前进量，平局取最小机号。
     * 注意前进量可为负（终点反弹 to<from），初值必须取 INT_MIN——否则唯一走法是反弹时会误返回 null。
     *
     * @param array<int, array<string, mixed>> $moves
     */
    public static function pickAuto(array $moves): ?int
    {
        $best = null;
        $bestScore = PHP_INT_MIN;
        foreach ($moves as $move) {
            $victims = 0;
            foreach ($move['fx'] as $item) {
                if (in_array($item['t'], ['capture', 'crush'], true)) {
                    $victims += count($item['v']);
                }
            }
            $score = ($move['finish'] ? 1000 : 0) + 100 * $victims + ((int) $move['to'] - (int) $move['from']);
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = (int) $move['p'];
            }
        }
        return $best;
    }

    /**
     * 开局状态：座位配色按人数映射、全部入机场；先手由「定先手」掷骰仪式决定
     * （phase=opening，全员掷单骰点大者先手，并列重掷）。
     *
     * @param array<int, int> $seats
     * @return array<string, mixed>
     */
    public static function setupGame(array $seats): array
    {
        $n = count($seats);
        $planes = [];
        for ($s = 0; $s < $n; ++$s) {
            $planes[] = array_fill(0, self::PLANES, self::HANGAR);
        }
        return [
            'phase' => 'opening',
            'currentSeat' => null,
            'opening' => ['round' => 1, 'tieSeats' => [], 'rolls' => []],
            'roll' => null,
            'planes' => $planes,
            'colors' => self::SEAT_COLORS[$n],
            'legalMoves' => null,
            'finishedOrder' => [],
            'leftSeats' => [],
            'leftProgress' => [],
            'auto' => [],
            'idleStrikes' => [],
            'places' => null,
            'events' => [['seq' => 1, 'ts' => time(), 't' => 'start', 'seat' => null, 'v' => 'opening']],
            'scores' => array_fill_keys(array_map('strval', $seats), 0),
        ];
    }

    /** 重开：保留 scores，人数未变时保留座位配色，重置其余。 */
    public static function resetForRematch(array $state, array $seats): array
    {
        $scores = $state['scores'] ?? [];
        $colors = $state['colors'] ?? [];
        $fresh = self::setupGame($seats);
        $fresh['scores'] = $scores;
        if (count($colors) === count($seats)) {
            $fresh['colors'] = $colors;
        }
        return $fresh;
    }
}
