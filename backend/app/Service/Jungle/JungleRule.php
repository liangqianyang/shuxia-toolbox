<?php

declare(strict_types=1);

namespace App\Service\Jungle;

/**
 * 斗兽棋纯规则引擎：无副作用静态方法，服务端权威判定。
 * 棋盘 7 列 × 9 行，row 0 顶部为蓝方、row 8 底部为红方；pieces 用存活快照 [{side,animal,r,c}…]。
 * 核心：等级吃子（大吃小、同级互吃）、鼠吃象特例、河流只有鼠能下且水陆互不攻击、
 * 狮虎沿水平方向跳河（水中有鼠挡道则跳不成）、踩对方陷阱等级归零、入对方兽穴获胜。
 * 前端 src/utils/jungle.ts 有一份平行实现，仅用于落点提示与单测，冲突以本类为准。
 */
final class JungleRule
{
    public const int ROWS = 9;

    public const int COLS = 7;

    public const string RED = 'red';

    public const string BLUE = 'blue';

    /** 动物等级：鼠 1 … 象 8 */
    public const array RANKS = [
        'rat' => 1,
        'cat' => 2,
        'dog' => 3,
        'wolf' => 4,
        'leopard' => 5,
        'tiger' => 6,
        'lion' => 7,
        'elephant' => 8,
    ];

    /** 河流格 [r, c]：rows 3-5 × cols {1,2,4,5} */
    public const array RIVER_CELLS = [
        [3, 1], [3, 2], [3, 4], [3, 5],
        [4, 1], [4, 2], [4, 4], [4, 5],
        [5, 1], [5, 2], [5, 4], [5, 5],
    ];

    /** 兽穴 side => [r, c] */
    public const array DEN_CELLS = [
        self::BLUE => [0, 3],
        self::RED => [8, 3],
    ];

    /** 陷阱 side => [[r, c]…]（该方兽穴旁三格，敌方踏入等级归零） */
    public const array TRAP_CELLS = [
        self::BLUE => [[0, 2], [0, 4], [1, 3]],
        self::RED => [[8, 2], [8, 4], [7, 3]],
    ];

    /** 狮虎跳河的水平列配对：0↔3、3↔6（跨过两格河面） */
    public const array JUMP_COL_PAIRS = [[0, 3], [3, 6]];

    private const array RIVER_LOOKUP = [
        3 => [1 => true, 2 => true, 4 => true, 5 => true],
        4 => [1 => true, 2 => true, 4 => true, 5 => true],
        5 => [1 => true, 2 => true, 4 => true, 5 => true],
    ];

    /**
     * 经典初始摆位 16 子：蓝方（上方）+ 红方（180° 镜像）。
     *
     * @return array<int, array{side: string, animal: string, r: int, c: int}>
     */
    public static function initialPieces(): array
    {
        $blue = [
            ['animal' => 'lion', 'r' => 0, 'c' => 0],
            ['animal' => 'tiger', 'r' => 0, 'c' => 6],
            ['animal' => 'dog', 'r' => 1, 'c' => 1],
            ['animal' => 'cat', 'r' => 1, 'c' => 5],
            ['animal' => 'rat', 'r' => 2, 'c' => 0],
            ['animal' => 'leopard', 'r' => 2, 'c' => 2],
            ['animal' => 'wolf', 'r' => 2, 'c' => 4],
            ['animal' => 'elephant', 'r' => 2, 'c' => 6],
        ];
        $pieces = [];
        foreach ($blue as $piece) {
            $pieces[] = ['side' => self::BLUE] + $piece;
        }
        foreach ($blue as $piece) {
            $pieces[] = [
                'side' => self::RED,
                'animal' => $piece['animal'],
                'r' => self::ROWS - 1 - $piece['r'],
                'c' => self::COLS - 1 - $piece['c'],
            ];
        }
        return $pieces;
    }

    public static function opponent(string $side): string
    {
        return $side === self::RED ? self::BLUE : self::RED;
    }

    public static function inBoard(int $r, int $c): bool
    {
        return $r >= 0 && $r < self::ROWS && $c >= 0 && $c < self::COLS;
    }

    public static function isRiver(int $r, int $c): bool
    {
        return (self::RIVER_LOOKUP[$r][$c] ?? false) === true;
    }

    /**
     * 是否为 $side 的兽穴格.
     */
    public static function isDenOf(string $side, int $r, int $c): bool
    {
        [$dr, $dc] = self::DEN_CELLS[$side];
        return $r === $dr && $c === $dc;
    }

    /**
     * 是否为 $side 的陷阱格（敌方动物踩上后等级归零）.
     */
    public static function isTrapOf(string $side, int $r, int $c): bool
    {
        foreach (self::TRAP_CELLS[$side] as [$tr, $tc]) {
            if ($tr === $r && $tc === $c) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array<int, array{side: string, animal: string, r: int, c: int}> $pieces
     * @return null|array{side: string, animal: string, r: int, c: int}
     */
    public static function pieceAt(array $pieces, int $r, int $c): ?array
    {
        foreach ($pieces as $piece) {
            if ((int) $piece['r'] === $r && (int) $piece['c'] === $c) {
                return $piece;
            }
        }
        return null;
    }

    /**
     * 攻击方能否吃掉守方（两者必相邻，守方即目标格上的子）。
     * 水陆隔离优先：水中鼠与岸上动物互相不能攻击（水中鼠对水中鼠可互吃）。
     * 守方踩在攻方一方的陷阱上 → 有效等级 0（任意子可吃，含象吃鼠）。
     * 鼠吃象特例仅限陆对陆；象不能吃鼠（除非鼠踩了象方陷阱）。
     *
     * @param array{side: string, animal: string, r: int, c: int} $attacker
     * @param array{side: string, animal: string, r: int, c: int} $defender
     */
    public static function canCapture(array $attacker, array $defender): bool
    {
        if (self::isRiver((int) $attacker['r'], (int) $attacker['c'])
            !== self::isRiver((int) $defender['r'], (int) $defender['c'])) {
            return false;
        }
        if (self::isTrapOf($attacker['side'], (int) $defender['r'], (int) $defender['c'])) {
            return true;
        }
        $attackRank = self::RANKS[$attacker['animal']];
        $defendRank = self::RANKS[$defender['animal']];
        if ($attacker['animal'] === 'rat' && $defender['animal'] === 'elephant') {
            return true;
        }
        if ($attacker['animal'] === 'elephant' && $defender['animal'] === 'rat') {
            return false;
        }
        return $attackRank >= $defendRank;
    }

    /**
     * 走子是否合法；返回 null 表示合法，否则返回错误键（前端 toast/回滚用）.
     *
     * @param array<int, array{side: string, animal: string, r: int, c: int}> $pieces
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
        if (self::isDenOf($turn, $tr, $tc)) {
            return 'own_den';
        }
        if (self::isRiver($tr, $tc) && $piece['animal'] !== 'rat') {
            return 'into_water';
        }
        $target = self::pieceAt($pieces, $tr, $tc);
        if ($target !== null && $target['side'] === $turn) {
            return 'blocked_own';
        }

        $adjacent = abs($fr - $tr) + abs($fc - $tc) === 1;
        if (! $adjacent) {
            // 只有狮虎可以水平跳河（同行、河区行、0↔3 或 3↔6），路径水格有子（必为鼠）则挡
            if (! in_array($piece['animal'], ['lion', 'tiger'], true)) {
                return 'not_adjacent';
            }
            if ($fr !== $tr || $fr < 3 || $fr > 5) {
                return 'jump_invalid';
            }
            $pair = null;
            foreach (self::JUMP_COL_PAIRS as [$a, $b]) {
                if (($fc === $a && $tc === $b) || ($fc === $b && $tc === $a)) {
                    $pair = true;
                    break;
                }
            }
            if ($pair === null) {
                return 'jump_invalid';
            }
            $step = $fc < $tc ? 1 : -1;
            for ($c = $fc + $step; $c !== $tc; $c += $step) {
                if (! self::isRiver($fr, $c) || self::pieceAt($pieces, $fr, $c) !== null) {
                    return 'jump_blocked';
                }
            }
        }

        if ($target !== null && ! self::canCapture($piece, $target)) {
            return 'cannot_capture';
        }
        return null;
    }

    /**
     * 在快照副本上执行走子（移除被吃子并位移），返回 [新盘面, 被吃子|null].
     *
     * @param array<int, array{side: string, animal: string, r: int, c: int}> $pieces
     * @return array{0: array<int, array{side: string, animal: string, r: int, c: int}>, 1: null|array{side: string, animal: string, r: int, c: int}}
     */
    public static function applyMove(array $pieces, int $fr, int $fc, int $tr, int $tc): array
    {
        $captured = null;
        $next = [];
        foreach ($pieces as $piece) {
            if ((int) $piece['r'] === $fr && (int) $piece['c'] === $fc) {
                $moved = $piece;
                $moved['r'] = $tr;
                $moved['c'] = $tc;
                $next[] = $moved;
            } elseif ((int) $piece['r'] === $tr && (int) $piece['c'] === $tc) {
                $captured = $piece;
            } else {
                $next[] = $piece;
            }
        }
        return [$next, $captured];
    }

    /**
     * 落子后即时胜负：入对方兽穴 'den'；对方棋子被吃光 'eliminated'；否则 null.
     *
     * @param array<int, array{side: string, animal: string, r: int, c: int}> $pieces
     */
    public static function findWin(array $pieces, string $mover, int $tr, int $tc): ?string
    {
        if (self::isDenOf(self::opponent($mover), $tr, $tc)) {
            return 'den';
        }
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $mover) {
                return null;
            }
        }
        return 'eliminated';
    }

    /**
     * $side 是否还有任何合法着法（困毙判定：走完一步后查对手，无着法即负）.
     *
     * @param array<int, array{side: string, animal: string, r: int, c: int}> $pieces
     */
    public static function hasAnyMove(array $pieces, string $side): bool
    {
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $side) {
                continue;
            }
            $fr = (int) $piece['r'];
            $fc = (int) $piece['c'];
            $targets = [[$fr - 1, $fc], [$fr + 1, $fc], [$fr, $fc - 1], [$fr, $fc + 1]];
            if (in_array($piece['animal'], ['lion', 'tiger'], true) && $fr >= 3 && $fr <= 5) {
                foreach (self::JUMP_COL_PAIRS as [$a, $b]) {
                    $targets[] = [$fr, $fc === $a ? $b : ($fc === $b ? $a : $fc)];
                }
            }
            foreach ($targets as [$tr, $tc]) {
                if (self::validateMove($pieces, $side, $fr, $fc, $tr, $tc) === null) {
                    return true;
                }
            }
        }
        return false;
    }
}
