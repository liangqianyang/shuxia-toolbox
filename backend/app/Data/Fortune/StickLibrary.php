<?php

declare(strict_types=1);

namespace App\Data\Fortune;

use RuntimeException;

/**
 * 签文库：四套签种数据的唯一入口（签文为服务端唯一数据源，抽签接口直接返回全文，前端不存副本）。
 *
 * 数据文件（同目录，return 数组）：
 * - GuanyinSticks.php 观音灵签 100 签：[{no, level, title, verse[4], gist, interpretation}…]
 * - GuandiSticks.php  关帝灵签 100 签：同上
 * - YuelaoSticks.php  月老灵签 N 签：同上
 * - AnswerBook.php    答案之书 160 条：[{no, answer}…]（无 level/verse/title）
 */
final class StickLibrary
{
    /** 签种元数据：key => [名称, 一句话定位]。deck key 同时是 API 白名单。 */
    public const array DECKS = [
        'guanyin' => ['name' => '观音灵签', 'tagline' => '慈悲指引，百事可问'],
        'guandi' => ['name' => '关帝灵签', 'tagline' => '忠义决断，事业财运'],
        'yuelao' => ['name' => '月老灵签', 'tagline' => '红线牵缘，专问姻缘'],
        'book' => ['name' => '答案之书', 'tagline' => '默念问题，一句点醒'],
    ];

    private const array FILES = [
        'guanyin' => 'GuanyinSticks.php',
        'guandi' => 'GuandiSticks.php',
        'yuelao' => 'YuelaoSticks.php',
        'book' => 'AnswerBook.php',
    ];

    /** @var array<string, array<int, array<string, mixed>>> 签种 => 已加载数据 */
    private static array $cache = [];

    public static function isDeck(string $deck): bool
    {
        return isset(self::DECKS[$deck]);
    }

    /** @return array<int, array<string, mixed>> */
    public static function deck(string $deck): array
    {
        if (! isset(self::FILES[$deck])) {
            throw new RuntimeException('未知签种：' . $deck);
        }
        if (! isset(self::$cache[$deck])) {
            $data = require __DIR__ . '/' . self::FILES[$deck];
            if (! is_array($data) || $data === []) {
                throw new RuntimeException('签文数据为空：' . $deck);
            }
            self::$cache[$deck] = $data;
        }
        return self::$cache[$deck];
    }

    public static function count(string $deck): int
    {
        return count(self::deck($deck));
    }

    /** @return array<string, mixed>|null */
    public static function stick(string $deck, int $no): ?array
    {
        foreach (self::deck($deck) as $stick) {
            if ((int) $stick['no'] === $no) {
                return $stick;
            }
        }
        return null;
    }
}
