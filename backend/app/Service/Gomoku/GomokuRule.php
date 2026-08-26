<?php

declare(strict_types=1);

namespace App\Service\Gomoku;

/**
 * 五子棋纯规则引擎：无副作用静态方法，服务端权威判定。
 * 棋盘用 15×15 int 网格：0 空 / 1 黑 / 2 白。休闲规则：无禁手，长连（≥5）算赢。
 * 前端 src/utils/gomoku.ts 有一份平行实现，仅用于即时 UI 反馈与单测，冲突以本类为准。
 */
final class GomokuRule
{
    public const int SIZE = 15;

    public const int EMPTY = 0;

    public const int BLACK = 1;

    public const int WHITE = 2;

    public const int WIN_COUNT = 5;

    /**
     * 由有序落子序列还原棋盘。
     *
     * @param array<int, array{x: int, y: int}> $moves
     * @return array<int, array<int, int>> [y][x] 网格
     */
    public static function boardFromMoves(array $moves): array
    {
        $board = array_fill(0, self::SIZE, array_fill(0, self::SIZE, self::EMPTY));
        foreach (array_values($moves) as $i => $move) {
            $x = (int) ($move['x'] ?? -1);
            $y = (int) ($move['y'] ?? -1);
            if ($x < 0 || $x >= self::SIZE || $y < 0 || $y >= self::SIZE) {
                continue;
            }
            $board[$y][$x] = $i % 2 === 0 ? self::BLACK : self::WHITE;
        }
        return $board;
    }

    /**
     * 当前轮到谁：偶数手轮黑（黑先）。
     *
     * @param array<int, mixed> $moves
     */
    public static function turnFromMoves(array $moves): string
    {
        return count($moves) % 2 === 0 ? 'black' : 'white';
    }

    /**
     * 落点是否合法；返回 null 表示合法，否则返回错误键。
     *
     * @param array<int, array<int, int>> $board
     */
    public static function validateMove(array $board, int $x, int $y): ?string
    {
        if ($x < 0 || $x >= self::SIZE || $y < 0 || $y >= self::SIZE) {
            return 'out_of_range';
        }
        if (($board[$y][$x] ?? self::EMPTY) !== self::EMPTY) {
            return 'occupied';
        }
        return null;
    }

    /**
     * 从最后一手向 4 个方向数连续同色子，≥5 返回整条连线坐标，否则 null。
     *
     * @param array<int, array<int, int>> $board
     * @return null|array<int, array<int, int>> [[x,y],…]
     */
    public static function findWinLine(array $board, int $x, int $y, int $color): ?array
    {
        $directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        foreach ($directions as [$dx, $dy]) {
            $line = [[$x, $y]];
            foreach ([1, -1] as $sign) {
                $cx = $x + $dx * $sign;
                $cy = $y + $dy * $sign;
                while ($cx >= 0 && $cx < self::SIZE && $cy >= 0 && $cy < self::SIZE
                    && ($board[$cy][$cx] ?? self::EMPTY) === $color) {
                    $sign === 1 ? $line[] = [$cx, $cy] : array_unshift($line, [$cx, $cy]);
                    $cx += $dx * $sign;
                    $cy += $dy * $sign;
                }
            }
            if (count($line) >= self::WIN_COUNT) {
                return $line;
            }
        }
        return null;
    }
}
