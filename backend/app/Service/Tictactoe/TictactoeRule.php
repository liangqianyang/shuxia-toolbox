<?php

declare(strict_types=1);

namespace App\Service\Tictactoe;

/**
 * 井字棋纯规则引擎：极小静态集（胜利线检测/空格/代落）。
 * 规则唯一事实源：docs/tictactoe-rules.md。
 * 前端 src/utils/tictactoe.ts 有一份平行实现，冲突以本类为准。
 */
final class TictactoeRule
{
    public const string X = 'x';

    public const string O = 'o';

    /** 8 条胜利线（行优先格索引 0-8）：3 横 3 竖 2 斜。 */
    public const array LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    /**
     * 落子后检测胜利线；返回 [执子方, 线下标] 或 null.
     *
     * @param array<int, null|string> $board
     * @return null|array{0: string, 1: int}
     */
    public static function findWin(array $board, string $mark): ?array
    {
        foreach (self::LINES as $i => [$a, $b, $c]) {
            if ($board[$a] === $mark && $board[$b] === $mark && $board[$c] === $mark) {
                return [$mark, $i];
            }
        }
        return null;
    }

    /** 棋盘是否已满（平局判定）. */
    public static function isFull(array $board): bool
    {
        foreach ($board as $cell) {
            if ($cell === null || $cell === '') {
                return false;
            }
        }
        return true;
    }

    /** @return array<int, int> 空格下标列表 */
    public static function emptyCells(array $board): array
    {
        $out = [];
        foreach ($board as $i => $cell) {
            if ($cell === null || $cell === '') {
                $out[] = (int) $i;
            }
        }
        return $out;
    }

    /** 随机空格下标；无可落子返回 null. */
    public static function randomEmpty(array $board): ?int
    {
        $empty = self::emptyCells($board);
        return $empty === [] ? null : $empty[random_int(0, count($empty) - 1)];
    }
}
