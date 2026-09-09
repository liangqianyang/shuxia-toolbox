<?php

declare(strict_types=1);

namespace App\Service\MountainChess;

/**
 * 军棋（两人暗棋）纯规则引擎：无副作用静态方法，服务端权威判定。
 * 棋盘 5 列 × 12 行（显示坐标），r 0-5 为蓝方上半场、r 6-11 为红方下半场，行 5/6 之间是山界；
 * pieces 用快照 [{side,rank,r,c,alive,revealed}…]（含阵亡子，阵亡即公示）。
 * 核心：铁路直线滑行（工兵 BFS 拐弯）、行营免战、大本营锁足、炸弹同归、
 * 工兵挖雷（非工兵撞雷同归于尽）、司令阵亡亮旗、扛旗获胜。
 * 规则唯一事实源：docs/junqi-rules.md。
 * 前端 src/utils/junqi.ts 有一份平行实现，仅用于落点提示与单测，冲突以本类为准。
 */
final class MountainChessRule
{
    public const int ROWS = 12;

    public const int COLS = 5;

    public const string RED = 'red';

    public const string BLUE = 'blue';

    /** 军衔等级：司令 9 … 工兵 1；zha/lei/qi 为特殊子。 */
    public const array RANKS = [
        'si' => 9,
        'jun' => 8,
        'shi' => 7,
        'lv' => 6,
        'tuan' => 5,
        'ying' => 4,
        'lian' => 3,
        'pai' => 2,
        'gong' => 1,
    ];

    public const array RANK_NAMES = [
        'si' => '司令',
        'jun' => '军长',
        'shi' => '师长',
        'lv' => '旅长',
        'tuan' => '团长',
        'ying' => '营长',
        'lian' => '连长',
        'pai' => '排长',
        'gong' => '工兵',
        'zha' => '炸弹',
        'lei' => '地雷',
        'qi' => '军旗',
    ];

    /** 每方 25 枚的编制。 */
    public const array PIECE_COUNTS = [
        'si' => 1, 'jun' => 1, 'shi' => 2, 'lv' => 2, 'tuan' => 2,
        'ying' => 2, 'lian' => 3, 'pai' => 3, 'gong' => 3,
        'zha' => 2, 'lei' => 3, 'qi' => 1,
    ];

    /** 行营 [r, c]（显示坐标，进入免战、布阵不可放子）。 */
    public const array CAMP_CELLS = [
        self::BLUE => [[2, 1], [2, 3], [3, 2], [4, 1], [4, 3]],
        self::RED => [[9, 1], [9, 3], [8, 2], [7, 1], [7, 3]],
    ];

    /** 大本营 [r, c]（军旗限放于此；任何子进入后不能再移动）。 */
    public const array HQ_CELLS = [
        self::BLUE => [[0, 1], [0, 3]],
        self::RED => [[11, 1], [11, 3]],
    ];

    /** 铁路横线所在显示行（全宽）。 */
    public const array RAIL_ROWS = [1, 5, 6, 10];

    /** 铁路纵线所在显示列，行 1..10 连续（含跨山界）。 */
    public const array RAIL_COLS = [0, 4];

    public const int RAIL_TOP = 1;

    public const int RAIL_BOTTOM = 10;

    /** 山界公路通路（列 2；列 0/4 是铁路通路）。 */
    public const int CROSS_ROAD_COL = 2;

    public static function opponent(string $side): string
    {
        return $side === self::RED ? self::BLUE : self::RED;
    }

    public static function inBoard(int $r, int $c): bool
    {
        return $r >= 0 && $r < self::ROWS && $c >= 0 && $c < self::COLS;
    }

    /** 是否行营（任意方）。 */
    public static function isCamp(int $r, int $c): bool
    {
        foreach (self::CAMP_CELLS as $cells) {
            foreach ($cells as [$cr, $cc]) {
                if ($cr === $r && $cc === $c) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 是否 $side 的大本营。 */
    public static function isHqOf(string $side, int $r, int $c): bool
    {
        foreach (self::HQ_CELLS[$side] as [$hr, $hc]) {
            if ($hr === $r && $hc === $c) {
                return true;
            }
        }
        return false;
    }

    /** 是否铁路格。 */
    public static function isRail(int $r, int $c): bool
    {
        if (in_array($r, self::RAIL_ROWS, true)) {
            return true;
        }
        return in_array($c, self::RAIL_COLS, true) && $r >= self::RAIL_TOP && $r <= self::RAIL_BOTTOM;
    }

    /**
     * 公路一步邻格：正交相邻 + 行营四斜角 + 山界中路 (5,2)↔(6,2)。
     * 行 5/6 之间只有列 2 相通（列 0/4 是铁路通路，走子层同样可达但归铁路边）。
     *
     * @return array<int, array{0: int, 1: int}>
     */
    public static function roadNeighbors(int $r, int $c): array
    {
        $out = [];
        foreach ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [$dr, $dc]) {
            $nr = $r + $dr;
            $nc = $c + $dc;
            if (! self::inBoard($nr, $nc)) {
                continue;
            }
            // 山界：行 5↔6 之间公路只有列 2（列 0/4 由铁路边承载）
            if (($r === 5 && $nr === 6) || ($r === 6 && $nr === 5)) {
                if ($c !== self::CROSS_ROAD_COL) {
                    continue;
                }
            }
            $out[] = [$nr, $nc];
        }
        // 行营斜线：仅当本格是行营时，四个对角格可达
        if (self::isCamp($r, $c)) {
            foreach ([-1, 1] as $dr) {
                foreach ([-1, 1] as $dc) {
                    $nr = $r + $dr;
                    $nc = $c + $dc;
                    if (self::inBoard($nr, $nc)) {
                        $out[] = [$nr, $nc];
                    }
                }
            }
        }
        return $out;
    }

    /**
     * 铁路边邻格（仅用于工兵 BFS）：同铁路横线相邻，或同铁路纵线相邻（行 1..10）。
     *
     * @return array<int, array{0: int, 1: int}>
     */
    public static function railNeighbors(int $r, int $c): array
    {
        $out = [];
        if (self::isRail($r, $c)) {
            foreach ([-1, 1] as $dc) {
                $nc = $c + $dc;
                if (self::inBoard($r, $nc) && in_array($r, self::RAIL_ROWS, true)) {
                    $out[] = [$r, $nc];
                }
            }
            if (in_array($c, self::RAIL_COLS, true)) {
                foreach ([-1, 1] as $dr) {
                    $nr = $r + $dr;
                    if (self::inBoard($nr, $c) && $nr >= self::RAIL_TOP && $nr <= self::RAIL_BOTTOM) {
                        $out[] = [$nr, $c];
                    }
                }
            }
        }
        return $out;
    }

    /**
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return null|array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}
     */
    public static function pieceAt(array $pieces, int $r, int $c): ?array
    {
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && (int) $piece['r'] === $r && (int) $piece['c'] === $c) {
                return $piece;
            }
        }
        return null;
    }

    /**
     * 走子是否合法；返回 null 表示合法，否则返回错误键（服务端映射文案、前端 toast 用）.
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     */
    public static function validateMove(array $pieces, string $turn, int $fr, int $fc, int $tr, int $tc): ?string
    {
        if (! self::inBoard($fr, $fc) || ! self::inBoard($tr, $tc)) {
            return 'out_of_range';
        }
        $piece = self::pieceAt($pieces, $fr, $fc);
        if ($piece === null) {
            return 'no_piece';
        }
        if ($piece['side'] !== $turn) {
            return 'not_yours';
        }
        if ($piece['rank'] === 'lei' || $piece['rank'] === 'qi') {
            return 'cannot_move';
        }
        if (self::isHqOf(self::RED, $fr, $fc) || self::isHqOf(self::BLUE, $fr, $fc)) {
            return 'locked_hq';
        }
        if (self::isHqOf($turn, $tr, $tc)) {
            return 'in_own_hq';
        }
        $target = self::pieceAt($pieces, $tr, $tc);
        if ($target !== null && $target['side'] === $turn) {
            return 'blocked_own';
        }
        if ($target !== null && self::isCamp($tr, $tc)) {
            return 'camp_protected';
        }
        if (! in_array([$tr, $tc], self::reachableTargets($pieces, $fr, $fc), true)) {
            return 'not_reachable';
        }
        return null;
    }

    /**
     * 某格棋子的所有可达落点（移动规则层，不判断战斗结果——暗棋下任意敌子皆可攻击，胜负服务器裁决）。
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return array<int, array{0: int, 1: int}>
     */
    public static function reachableTargets(array $pieces, int $fr, int $fc): array
    {
        $piece = self::pieceAt($pieces, $fr, $fc);
        if ($piece === null || $piece['rank'] === 'lei' || $piece['rank'] === 'qi') {
            return [];
        }
        if (self::isHqOf(self::RED, $fr, $fc) || self::isHqOf(self::BLUE, $fr, $fc)) {
            return []; // 进入大本营后锁足
        }
        $targets = [];
        foreach (self::roadNeighbors($fr, $fc) as [$tr, $tc]) {
            $targets[] = [$tr, $tc];
        }
        // 铁路：直线滑行（非工兵）或 BFS 任意拐弯（工兵）
        if (self::isRail($fr, $fc)) {
            $railTargets = $piece['rank'] === 'gong'
                ? self::gongRailTargets($pieces, $fr, $fc)
                : self::straightRailTargets($pieces, $fr, $fc);
            foreach ($railTargets as [$tr, $tc]) {
                $targets[] = [$tr, $tc];
            }
        }
        // 去重（公路一步与铁路滑行可能重叠）
        $unique = [];
        foreach ($targets as [$tr, $tc]) {
            if (! self::inBoard($tr, $tc) || ($tr === $fr && $tc === $fc)) {
                continue;
            }
            $unique[$tr . ':' . $tc] = [$tr, $tc];
        }
        return array_values($unique);
    }

    /**
     * 非工兵铁路直线滑行：沿所属铁路横线/纵线向四个方向滑到头（路径必须为空）。
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return array<int, array{0: int, 1: int}>
     */
    private static function straightRailTargets(array $pieces, int $fr, int $fc): array
    {
        $out = [];
        $slide = function (int $r, int $c, int $dr, int $dc) use ($pieces, &$out): void {
            $nr = $r + $dr;
            $nc = $c + $dc;
            while (self::inBoard($nr, $nc) && self::onRailLine($r, $c, $nr, $nc)) {
                $out[] = [$nr, $nc];
                if (self::pieceAt($pieces, $nr, $nc) !== null) {
                    break; // 撞上第一枚子为止（可吃不可穿）
                }
                $nr += $dr;
                $nc += $dc;
            }
        };
        foreach ([[0, 1], [0, -1], [1, 0], [-1, 0]] as [$dr, $dc]) {
            $slide($fr, $fc, $dr, $dc);
        }
        return $out;
    }

    /** 相邻两格是否属于同一条铁路线（滑行合法性）。 */
    private static function onRailLine(int $fr, int $fc, int $tr, int $tc): bool
    {
        if ($fr === $tr) {
            return in_array($fr, self::RAIL_ROWS, true);
        }
        if ($fc === $tc) {
            return in_array($fc, self::RAIL_COLS, true) && $fr >= self::RAIL_TOP && $fr <= self::RAIL_BOTTOM && $tr >= self::RAIL_TOP && $tr <= self::RAIL_BOTTOM;
        }
        return false;
    }

    /**
     * 工兵铁路 BFS：沿铁路网任意拐弯，中间格必须为空（终点可为敌子，可吃不可穿）。
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return array<int, array{0: int, 1: int}>
     */
    private static function gongRailTargets(array $pieces, int $fr, int $fc): array
    {
        $visited = [$fr . ':' . $fc => true];
        $queue = [[$fr, $fc]];
        $out = [];
        while ($queue !== []) {
            [$r, $c] = array_shift($queue);
            foreach (self::railNeighbors($r, $c) as [$nr, $nc]) {
                $key = $nr . ':' . $nc;
                if (isset($visited[$key])) {
                    continue;
                }
                $visited[$key] = true;
                $occupied = self::pieceAt($pieces, $nr, $nc) !== null;
                if ($occupied) {
                    $out[] = [$nr, $nc]; // 第一枚子可作为攻击终点，但不能穿过
                    continue;
                }
                $out[] = [$nr, $nc];
                $queue[] = [$nr, $nc];
            }
        }
        return $out;
    }

    /**
     * 战斗裁决：'flag'（夺旗终局）| 'win'（攻方胜）| 'lose'（攻方亡）| 'both'（同归于尽）。
     *
     * @param array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool} $attacker
     * @param array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool} $defender
     */
    public static function resolveBattle(array $attacker, array $defender): string
    {
        if ($defender['rank'] === 'qi') {
            return 'flag';
        }
        if ($attacker['rank'] === 'zha') {
            return 'both';
        }
        if ($defender['rank'] === 'lei') {
            return $attacker['rank'] === 'gong' ? 'win' : 'both';
        }
        $ar = self::RANKS[$attacker['rank']];
        $dr = self::RANKS[$defender['rank']];
        if ($ar > $dr) {
            return 'win';
        }
        return $ar === $dr ? 'both' : 'lose';
    }

    /**
     * 在快照副本上执行走子（含战斗结算）。返回新盘面与战报摘要。
     * 阵亡子保留原位置、alive=false、revealed=true（阵亡即公示）；
     * 战斗存活的一方 revealed=true（交战暴露）；司令阵亡时 revealSide 指示亮旗方。
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     * @return array{pieces: array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}>, result: string, captured: null|string, revealSide: null|string}
     */
    public static function applyMove(array $pieces, string $mover, int $fr, int $fc, int $tr, int $tc): array
    {
        $next = [];
        $attacker = null;
        $defender = null;
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && (int) $piece['r'] === $fr && (int) $piece['c'] === $fc) {
                $attacker = $piece;
            } elseif ((bool) $piece['alive'] && (int) $piece['r'] === $tr && (int) $piece['c'] === $tc) {
                $defender = $piece;
            } else {
                $next[] = $piece;
            }
        }
        $result = $defender === null ? 'move' : self::resolveBattle($attacker, $defender);
        $revealSide = null;
        $markDead = function (array $p) use (&$revealSide): array {
            $p['alive'] = false;
            $p['revealed'] = true;
            if ($p['rank'] === 'si') {
                $revealSide = $p['side'];
            }
            return $p;
        };

        if ($result === 'move') {
            $attacker['r'] = $tr;
            $attacker['c'] = $tc;
            $next[] = $attacker;
        } elseif ($result === 'flag') {
            $defender = $markDead($defender);
            $attacker['r'] = $tr;
            $attacker['c'] = $tc;
            $next[] = $attacker;
            $next[] = $defender;
        } elseif ($result === 'win') {
            $defender = $markDead($defender);
            $attacker['revealed'] = true;
            $attacker['r'] = $tr;
            $attacker['c'] = $tc;
            $next[] = $attacker;
            $next[] = $defender;
        } elseif ($result === 'both') {
            $attacker['r'] = $tr;
            $attacker['c'] = $tc;
            $attacker = $markDead($attacker);
            $defender = $markDead($defender);
            $next[] = $attacker;
            $next[] = $defender;
        } else { // lose：攻方亡，守方原地不动
            $attacker['r'] = $tr;
            $attacker['c'] = $tc;
            $attacker = $markDead($attacker);
            $defender['revealed'] = true;
            $next[] = $attacker;
            $next[] = $defender;
        }

        return [
            'pieces' => $next,
            'result' => $result,
            'captured' => $defender !== null && $result !== 'move' ? $defender['rank'] : null,
            'revealSide' => $revealSide,
        ];
    }

    /**
     * 走子后即时胜负：'flag'（攻方夺旗）；对方全灭 'eliminated'；否则 null.
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     */
    public static function findWin(array $pieces, string $mover, string $result): ?string
    {
        if ($result === 'flag') {
            return 'flag';
        }
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $mover && (bool) $piece['alive']) {
                return null;
            }
        }
        return 'eliminated';
    }

    /**
     * $side 是否还有任何合法着法（无步可走判负）.
     *
     * @param array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
     */
    public static function hasAnyMove(array $pieces, string $side): bool
    {
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $side || ! (bool) $piece['alive']) {
                continue;
            }
            if (self::reachableTargets($pieces, (int) $piece['r'], (int) $piece['c']) !== []) {
                return true;
            }
        }
        return false;
    }

    /**
     * 校验一方布阵（25 项 {rank, r, c}，己方半场显示坐标）。返回 null=合法，否则错误键.
     *
     * @param array<int, array{rank: string, r: int, c: int}> $layout
     */
    public static function validateLayout(string $side, array $layout): ?string
    {
        if (count($layout) !== 25) {
            return 'layout_count';
        }
        $counts = [];
        $seen = [];
        [$rMin, $rMax] = $side === self::RED ? [6, 11] : [0, 5];
        [$backMin, $backMax] = $side === self::RED ? [10, 11] : [0, 1];
        $frontRow = $side === self::RED ? 6 : 5;
        foreach ($layout as $item) {
            $rank = (string) $item['rank'];
            $r = (int) $item['r'];
            $c = (int) $item['c'];
            if (! isset(self::PIECE_COUNTS[$rank])) {
                return 'layout_rank';
            }
            $counts[$rank] = ($counts[$rank] ?? 0) + 1;
            $key = $r . ':' . $c;
            if (isset($seen[$key])) {
                return 'layout_overlap';
            }
            $seen[$key] = true;
            if ($r < $rMin || $r > $rMax || $c < 0 || $c >= self::COLS) {
                return 'layout_half';
            }
            if (self::isCamp($r, $c)) {
                return 'layout_camp';
            }
            if ($rank === 'lei' && ($r < $backMin || $r > $backMax)) {
                return 'layout_mine_row';
            }
            if ($rank === 'zha' && $r === $frontRow) {
                return 'layout_bomb_row';
            }
            if ($rank === 'qi' && ! self::isHqOf($side, $r, $c)) {
                return 'layout_flag_hq';
            }
        }
        foreach (self::PIECE_COUNTS as $rank => $count) {
            if (($counts[$rank] ?? 0) !== $count) {
                return 'layout_count';
            }
        }
        return null;
    }

    /**
     * 随机合法布阵：军旗随机占一个大本营，地雷散后两排，炸弹避开前排，其余混洗填空。
     *
     * @return array<int, array{rank: string, r: int, c: int}>
     */
    public static function randomLayout(string $side): array
    {
        [$rMin, $rMax] = $side === self::RED ? [6, 11] : [0, 5];
        [$backMin, $backMax] = $side === self::RED ? [10, 11] : [0, 1];
        $frontRow = $side === self::RED ? 6 : 5;

        $cells = [];
        for ($r = $rMin; $r <= $rMax; ++$r) {
            for ($c = 0; $c < self::COLS; ++$c) {
                if (! self::isCamp($r, $c)) {
                    $cells[] = [$r, $c];
                }
            }
        }
        shuffle($cells);
        $pool = array_values($cells);

        $take = function (callable $filter) use (&$pool): array {
            foreach ($pool as $i => [$r, $c]) {
                if ($filter($r, $c)) {
                    unset($pool[$i]);
                    $pool = array_values($pool);
                    return [$r, $c];
                }
            }
            // 理论不可达（约束下必有解）；兜底取第一个
            $first = $pool[0];
            array_shift($pool);
            return $first;
        };

        $layout = [];
        $hq = self::HQ_CELLS[$side][random_int(0, 1)];
        $take(fn(int $r, int $c): bool => $r === $hq[0] && $c === $hq[1]);
        $layout[] = ['rank' => 'qi', 'r' => $hq[0], 'c' => $hq[1]];

        for ($i = 0; $i < self::PIECE_COUNTS['lei']; ++$i) {
            [$r, $c] = $take(fn(int $r, int $c): bool => $r >= $backMin && $r <= $backMax);
            $layout[] = ['rank' => 'lei', 'r' => $r, 'c' => $c];
        }
        for ($i = 0; $i < self::PIECE_COUNTS['zha']; ++$i) {
            [$r, $c] = $take(fn(int $r, int $c): bool => $r !== $frontRow);
            $layout[] = ['rank' => 'zha', 'r' => $r, 'c' => $c];
        }
        $rest = [];
        foreach (self::PIECE_COUNTS as $rank => $count) {
            if ($rank === 'qi' || $rank === 'lei' || $rank === 'zha') {
                continue;
            }
            for ($i = 0; $i < $count; ++$i) {
                $rest[] = $rank;
            }
        }
        shuffle($rest);
        foreach ($rest as $rank) {
            [$r, $c] = array_shift($pool);
            $layout[] = ['rank' => $rank, 'r' => $r, 'c' => $c];
        }
        return $layout;
    }

    /**
     * 布阵条目转完整 pieces 快照（双方合并），用于落库。
     *
     * @param array<int, array{rank: string, r: int, c: int}> $redLayout
     * @param array<int, array{rank: string, r: int, c: int}> $blueLayout
     * @return array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}>
     */
    public static function buildPieces(array $redLayout, array $blueLayout): array
    {
        $pieces = [];
        foreach ($redLayout as $item) {
            $pieces[] = ['side' => self::RED, 'rank' => (string) $item['rank'], 'r' => (int) $item['r'], 'c' => (int) $item['c'], 'alive' => true, 'revealed' => false];
        }
        foreach ($blueLayout as $item) {
            $pieces[] = ['side' => self::BLUE, 'rank' => (string) $item['rank'], 'r' => (int) $item['r'], 'c' => (int) $item['c'], 'alive' => true, 'revealed' => false];
        }
        return $pieces;
    }
}
