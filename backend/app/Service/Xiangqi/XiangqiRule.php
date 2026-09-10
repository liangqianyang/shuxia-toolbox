<?php

declare(strict_types=1);

namespace App\Service\Xiangqi;

/**
 * 象棋纯规则引擎：无副作用静态方法，服务端权威判定。
 * 棋盘 9 列 × 10 行交点（显示坐标），黑方上半场 r0-4、红方下半场 r5-9，河界在 r4/r5 之间；
 * pieces 用快照 [{side,piece,r,c,alive}…]（含阵亡子，供阵亡托盘）。
 * 核心：车马炮相仕帅兵七种走法（蹩马腿/塞象眼/炮架/过河兵/九宫限位）、
 * 将帅对脸、将军检测（应将过滤）、将死与困毙。
 * 规则唯一事实源：docs/xiangqi-rules.md。
 * 前端 src/utils/xiangqi.ts 有一份平行实现，仅用于落点提示与单测，冲突以本类为准。
 */
final class XiangqiRule
{
    public const int ROWS = 10;

    public const int COLS = 9;

    public const string RED = 'red';

    public const string BLACK = 'black';

    /** 棋子类型码：r车 h马 c炮 e相/象 a仕/士 k帅/将 p兵/卒。 */
    public const array PIECES = ['r', 'h', 'c', 'e', 'a', 'k', 'p'];

    public const array PIECE_NAMES = [
        self::RED => ['r' => '车', 'h' => '马', 'c' => '炮', 'e' => '相', 'a' => '仕', 'k' => '帅', 'p' => '兵'],
        self::BLACK => ['r' => '车', 'h' => '马', 'c' => '炮', 'e' => '象', 'a' => '士', 'k' => '将', 'p' => '卒'],
    ];

    /** 马的 8 个日字目标与对应马腿（腿位偏移）。 */
    private const array HORSE_JUMPS = [
        [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
    ];

    public static function opponent(string $side): string
    {
        return $side === self::RED ? self::BLACK : self::RED;
    }

    public static function inBoard(int $r, int $c): bool
    {
        return $r >= 0 && $r < self::ROWS && $c >= 0 && $c < self::COLS;
    }

    /** 是否九宫内（己方 c3-5 × 后三行）。 */
    public static function inPalace(string $side, int $r, int $c): bool
    {
        if ($c < 3 || $c > 5) {
            return false;
        }
        return $side === self::BLACK ? $r <= 2 : $r >= 7;
    }

    /** 己方半场（红 r5-9、黑 r0-4）. */
    public static function ownHalf(string $side, int $r): bool
    {
        return $side === self::RED ? $r >= 5 : $r <= 4;
    }

    /** 是否已过河（红 r≤4、黑 r≥5）. */
    public static function crossedRiver(string $side, int $r): bool
    {
        return $side === self::RED ? $r <= 4 : $r >= 5;
    }

    /**
     * 标准开局 32 子：黑上（r0 背排、r2 炮、r3 卒）、红下（r9 背排、r7 炮、r6 兵）。
     *
     * @return array<int, array{side: string, piece: string, r: int, c: int, alive: bool}>
     */
    public static function standardPieces(): array
    {
        $pieces = [];
        $back = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'];
        foreach ($back as $c => $piece) {
            $pieces[] = ['side' => self::BLACK, 'piece' => $piece, 'r' => 0, 'c' => $c, 'alive' => true];
            $pieces[] = ['side' => self::RED, 'piece' => $piece, 'r' => 9, 'c' => $c, 'alive' => true];
        }
        foreach ([[1, 2], [7, 2]] as [$c, $r]) {
            $pieces[] = ['side' => self::BLACK, 'piece' => 'c', 'r' => $r, 'c' => $c, 'alive' => true];
            $pieces[] = ['side' => self::RED, 'piece' => 'c', 'r' => 9 - $r, 'c' => $c, 'alive' => true];
        }
        foreach ([0, 2, 4, 6, 8] as $c) {
            $pieces[] = ['side' => self::BLACK, 'piece' => 'p', 'r' => 3, 'c' => $c, 'alive' => true];
            $pieces[] = ['side' => self::RED, 'piece' => 'p', 'r' => 6, 'c' => $c, 'alive' => true];
        }
        return $pieces;
    }

    /**
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     * @return null|array{side: string, piece: string, r: int, c: int, alive: bool}
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

    /** 定位某方的将/帅. */
    public static function kingSquare(array $pieces, string $side): ?array
    {
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && $piece['side'] === $side && $piece['piece'] === 'k') {
                return [(int) $piece['r'], (int) $piece['c']];
            }
        }
        return null;
    }

    /**
     * 伪合法目标（走法层；目标为己方子排除；应将/对脸过滤在 legalTargets）.
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     * @return array<int, array{0: int, 1: int}>
     */
    public static function pseudoTargets(array $pieces, int $fr, int $fc): array
    {
        $piece = self::pieceAt($pieces, $fr, $fc);
        if ($piece === null) {
            return [];
        }
        $side = $piece['side'];
        $type = $piece['piece'];
        $out = [];
        $push = function (int $tr, int $tc) use ($pieces, $side, &$out): void {
            if (! self::inBoard($tr, $tc)) {
                return;
            }
            $target = self::pieceAt($pieces, $tr, $tc);
            if ($target !== null && $target['side'] === $side) {
                return;
            }
            $out[] = [$tr, $tc];
        };

        if ($type === 'r' || $type === 'c') {
            // 车：滑行；炮：移动滑行 + 隔一炮架吃子
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $dc]) {
                $screen = false;
                $tr = $fr + $dr;
                $tc = $fc + $dc;
                while (self::inBoard($tr, $tc)) {
                    $blocker = self::pieceAt($pieces, $tr, $tc);
                    if ($blocker === null) {
                        if (! $screen) {
                            $out[] = [$tr, $tc]; // 车与炮的移动段
                        }
                    } else {
                        if (! $screen) {
                            if ($type === 'r' && $blocker['side'] !== $side) {
                                $out[] = [$tr, $tc]; // 车可直接吃
                            }
                            $screen = true; // 第一个子成为炮架
                            if ($type === 'r') {
                                break; // 车遇子即止
                            }
                        } else {
                            if ($type === 'c' && $blocker['side'] !== $side) {
                                $out[] = [$tr, $tc]; // 炮隔架吃
                            }
                            break;
                        }
                    }
                    $tr += $dr;
                    $tc += $dc;
                }
            }
            return $out;
        }

        if ($type === 'h') {
            foreach (self::HORSE_JUMPS as [$dr, $dc, $lr, $lc]) {
                $tr = $fr + $dr;
                $tc = $fc + $dc;
                $legR = $fr + $lr;
                $legC = $fc + $lc;
                if (! self::inBoard($tr, $tc) || self::pieceAt($pieces, $legR, $legC) !== null) {
                    continue; // 蹩马腿
                }
                $push($tr, $tc);
            }
            return $out;
        }

        if ($type === 'e') {
            foreach ([[-2, -2], [-2, 2], [2, -2], [2, 2]] as [$dr, $dc]) {
                $tr = $fr + $dr;
                $tc = $fc + $dc;
                if (! self::inBoard($tr, $tc) || ! self::ownHalf($side, $tr)) {
                    continue; // 象不过河
                }
                if (self::pieceAt($pieces, $fr + $dr / 2, $fc + $dc / 2) !== null) {
                    continue; // 塞象眼
                }
                $push($tr, $tc);
            }
            return $out;
        }

        if ($type === 'a') {
            foreach ([[-1, -1], [-1, 1], [1, -1], [1, 1]] as [$dr, $dc]) {
                $tr = $fr + $dr;
                $tc = $fc + $dc;
                if (self::inPalace($side, $tr, $tc)) {
                    $push($tr, $tc);
                }
            }
            return $out;
        }

        if ($type === 'k') {
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $dc]) {
                $tr = $fr + $dr;
                $tc = $fc + $dc;
                if (self::inPalace($side, $tr, $tc)) {
                    $push($tr, $tc);
                }
            }
            return $out;
        }

        // 兵/卒：过河前只进；过河后可横；永不后退
        $forward = $side === self::RED ? -1 : 1;
        $push($fr + $forward, $fc);
        if (self::crossedRiver($side, $fr)) {
            $push($fr, $fc - 1);
            $push($fr, $fc + 1);
        }
        return $out;
    }

    /**
     * 合法目标 = 伪合法目标中，走子后己方将帅不被攻击、且不与对方将帅对脸者.
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     * @return array<int, array{0: int, 1: int}>
     */
    public static function legalTargets(array $pieces, string $side, int $fr, int $fc): array
    {
        $out = [];
        foreach (self::pseudoTargets($pieces, $fr, $fc) as [$tr, $tc]) {
            $simulated = self::simulateMove($pieces, $fr, $fc, $tr, $tc);
            $king = self::kingSquare($simulated, $side);
            if ($king === null) {
                continue;
            }
            if (self::isSquareAttacked($simulated, $side, $king[0], $king[1])) {
                continue;
            }
            if (self::kingsFacing($simulated)) {
                continue;
            }
            $out[] = [$tr, $tc];
        }
        return $out;
    }

    /**
     * 走子是否合法；返回 null 表示合法，否则返回错误键（与前端镜像一字不差）.
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
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
        $target = self::pieceAt($pieces, $tr, $tc);
        if ($target !== null && $target['side'] === $turn) {
            return 'blocked_own';
        }
        if (! in_array([$tr, $tc], self::legalTargets($pieces, $turn, $fr, $fc), true)) {
            return 'illegal_move';
        }
        return null;
    }

    /**
     * 在副本上模拟走子（返回新数组；被吃子标记 alive=false，供攻击检测用）.
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     * @return array<int, array{side: string, piece: string, r: int, c: int, alive: bool}>
     */
    public static function simulateMove(array $pieces, int $fr, int $fc, int $tr, int $tc): array
    {
        $next = [];
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && (int) $piece['r'] === $fr && (int) $piece['c'] === $fc) {
                $next[] = ['side' => $piece['side'], 'piece' => $piece['piece'], 'r' => $tr, 'c' => $tc, 'alive' => true];
            } elseif ((bool) $piece['alive'] && (int) $piece['r'] === $tr && (int) $piece['c'] === $tc) {
                $next[] = ['side' => $piece['side'], 'piece' => $piece['piece'], 'r' => $tr, 'c' => $tc, 'alive' => false];
            } else {
                $next[] = $piece;
            }
        }
        return $next;
    }

    /**
     * 在快照副本上执行走子（明棋：被吃子保留原位 alive=false 供阵亡托盘）。
     * 返回新盘面、是否吃子、被吃子类型码。
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     * @return array{pieces: array<int, array{side: string, piece: string, r: int, c: int, alive: bool}>, captured: null|string}
     */
    public static function applyMove(array $pieces, int $fr, int $fc, int $tr, int $tc): array
    {
        $next = [];
        $captured = null;
        foreach ($pieces as $piece) {
            if ((bool) $piece['alive'] && (int) $piece['r'] === $fr && (int) $piece['c'] === $fc) {
                $next[] = ['side' => $piece['side'], 'piece' => $piece['piece'], 'r' => $tr, 'c' => $tc, 'alive' => true];
            } elseif ((bool) $piece['alive'] && (int) $piece['r'] === $tr && (int) $piece['c'] === $tc) {
                $captured = (string) $piece['piece'];
                $next[] = ['side' => $piece['side'], 'piece' => $piece['piece'], 'r' => $tr, 'c' => $tc, 'alive' => false];
            } else {
                $next[] = $piece;
            }
        }
        return ['pieces' => $next, 'captured' => $captured];
    }

    /**
     * (kr,kc) 是否被 $side 的对方攻击（用于应将检测；炮含隔架、兵含横攻）.
     *
     * @param array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
     */
    public static function isSquareAttacked(array $pieces, string $side, int $kr, int $kc): bool
    {
        $enemy = self::opponent($side);
        foreach ($pieces as $piece) {
            if (! (bool) $piece['alive'] || $piece['side'] !== $enemy) {
                continue;
            }
            foreach (self::pseudoTargets($pieces, (int) $piece['r'], (int) $piece['c']) as [$tr, $tc]) {
                if ($tr === $kr && $tc === $kc) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 将帅是否对脸（同列且中间无子）. */
    public static function kingsFacing(array $pieces): bool
    {
        $red = self::kingSquare($pieces, self::RED);
        $black = self::kingSquare($pieces, self::BLACK);
        if ($red === null || $black === null || $red[1] !== $black[1]) {
            return false;
        }
        $top = min($red[0], $black[0]);
        $bottom = max($red[0], $black[0]);
        for ($r = $top + 1; $r < $bottom; ++$r) {
            if (self::pieceAt($pieces, $r, $red[1]) !== null) {
                return false;
            }
        }
        return true;
    }

    /** 某方是否被将军. */
    public static function inCheck(array $pieces, string $side): bool
    {
        $king = self::kingSquare($pieces, $side);
        if ($king === null) {
            return true;
        }
        return self::isSquareAttacked($pieces, $side, $king[0], $king[1]);
    }

    /** 某方是否还有任何合法着法（无步 = 将死或困毙）. */
    public static function hasAnyLegalMove(array $pieces, string $side): bool
    {
        foreach ($pieces as $piece) {
            if ($piece['side'] !== $side || ! (bool) $piece['alive']) {
                continue;
            }
            if (self::legalTargets($pieces, $side, (int) $piece['r'], (int) $piece['c']) !== []) {
                return true;
            }
        }
        return false;
    }
}
