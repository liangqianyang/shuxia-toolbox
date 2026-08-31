<?php

declare(strict_types=1);

namespace App\Service\Adventure;

/**
 * 枫趣冒险棋盘静态配置：100 格蛇形山道（1 在底行，100=枫顶在顶行）。
 *
 * 这是棋盘的唯一服务端真相；前端 src/pages-adventure/utils/adventureBoard.ts 是同步镜像
 * （同拼豆色卡/unoChat 的双份约定，test/algo.test.ts 断言两边一致）。
 * 规则条文见 docs/adventure-rules.md。
 *
 * 静态校验（写进测试）：
 * 1. 云梯/缆车/岔路捷径只前进、滑坡/落石只后退（机关图无环）；
 * 2. 滑坡/落石落点全部是普通格或营地（唯一例外：落石 16 落 13 枫叶格，温和正面格不级联移动）；
 * 3. 云梯 5→10 落温泉、58→62 落缆车是仅有的机关落机关（62 链到 79 终止），链深 ≤ 3。
 */
final class AdventureBoard
{
    public const int SUMMIT = 100;

    /** 营地（存档点 + 安全区）。 */
    public const array CAMPS = [21, 41, 61, 81];

    /** 缆车站（缆车票道具的目标集合）。 */
    public const array CABLE_STATIONS = [14, 38, 62];

    /**
     * 段位定义：格区间、名称、决斗形式（rps/bid/dice）、是否决斗筹码翻倍。
     *
     * @var array<int, array{from: int, to: int, name: string, duel: string, duelDouble: bool}>
     */
    public const array SEGMENTS = [
        ['from' => 1, 'to' => 20, 'name' => '山脚草原', 'duel' => 'rps', 'duelDouble' => false],
        ['from' => 21, 'to' => 40, 'name' => '枫叶林', 'duel' => 'bid', 'duelDouble' => false],
        ['from' => 41, 'to' => 60, 'name' => '清溪谷', 'duel' => 'dice', 'duelDouble' => false],
        ['from' => 61, 'to' => 80, 'name' => '岩壁', 'duel' => 'rps', 'duelDouble' => false],
        ['from' => 81, 'to' => 100, 'name' => '雪线', 'duel' => 'rps', 'duelDouble' => true],
    ];

    /**
     * 机关格定义：格号 => 定义。无键 = 普通格。
     *  - ladder/cable：{to} 前跳目标
     *  - slide：{to} 后退目标（暴风天气翻倍距离）
     *  - rock：{back} 后退格数（暴风翻倍）
     *  - leaf/spring：枫叶/温泉
     *  - shop/supply：商店/补给站
     *  - ambush：埋伏格（是否有雷是运行时状态）
     *  - fate/shrine/arena/avalanche：命运交换/山神小屋/决斗擂台/雪崩
     *  - fork：岔路 {options: [{key, label, to}]}，to=null 表示山道（原地继续）
     *  - camp/summit：营地/枫顶
     *
     * @var array<int, array<string, mixed>>
     */
    public const array CELLS = [
        3 => ['type' => 'leaf'],
        5 => ['type' => 'ladder', 'to' => 10],
        7 => ['type' => 'slide', 'to' => 4],
        10 => ['type' => 'spring'],
        13 => ['type' => 'leaf'],
        14 => ['type' => 'cable', 'to' => 28],
        16 => ['type' => 'rock', 'back' => 3],
        21 => ['type' => 'camp'],
        23 => ['type' => 'leaf'],
        25 => ['type' => 'ambush'],
        27 => ['type' => 'leaf'],
        30 => ['type' => 'fork', 'options' => [
            ['key' => 'cable', 'label' => '缆车直达 44', 'to' => 44],
            ['key' => 'trail', 'label' => '山道捡枫叶', 'to' => null],
        ]],
        32 => ['type' => 'leaf'],
        33 => ['type' => 'shop'],
        35 => ['type' => 'shrine'],
        37 => ['type' => 'slide', 'to' => 31],
        38 => ['type' => 'cable', 'to' => 55],
        40 => ['type' => 'leaf'],
        41 => ['type' => 'camp'],
        43 => ['type' => 'spring'],
        45 => ['type' => 'supply'],
        47 => ['type' => 'ladder', 'to' => 52],
        49 => ['type' => 'ambush'],
        53 => ['type' => 'fate'],
        57 => ['type' => 'leaf'],
        58 => ['type' => 'ladder', 'to' => 62],
        59 => ['type' => 'rock', 'back' => 3],
        61 => ['type' => 'camp'],
        62 => ['type' => 'cable', 'to' => 79],
        66 => ['type' => 'fork', 'options' => [
            ['key' => 'shortcut', 'label' => '捷径直达 78', 'to' => 78],
            ['key' => 'trail', 'label' => '安全绕行', 'to' => null],
        ]],
        67 => ['type' => 'ambush'],
        69 => ['type' => 'rock', 'back' => 4],
        70 => ['type' => 'arena'],
        72 => ['type' => 'ladder', 'to' => 76],
        73 => ['type' => 'slide', 'to' => 63],
        74 => ['type' => 'avalanche'],
        77 => ['type' => 'supply'],
        81 => ['type' => 'camp'],
        83 => ['type' => 'slide', 'to' => 76],
        85 => ['type' => 'ambush'],
        87 => ['type' => 'rock', 'back' => 5],
        89 => ['type' => 'avalanche'],
        91 => ['type' => 'shop'],
        93 => ['type' => 'slide', 'to' => 84],
        95 => ['type' => 'ladder', 'to' => 98],
        96 => ['type' => 'rock', 'back' => 4],
        99 => ['type' => 'shrine'],
        100 => ['type' => 'summit'],
    ];

    /** 格类型（渲染/校验用）。 */
    public const array CELL_TYPES = ['plain', 'camp', 'leaf', 'spring', 'ladder', 'cable', 'slide', 'rock',
        'shop', 'supply', 'ambush', 'fate', 'shrine', 'arena', 'avalanche', 'fork', 'summit'];

    /** 格类型 => 中文短名（播报/前端图例）。 */
    public const array CELL_NAMES = [
        'camp' => '营地', 'leaf' => '枫叶格', 'spring' => '温泉', 'ladder' => '云梯', 'cable' => '缆车',
        'slide' => '滑坡', 'rock' => '落石', 'shop' => '商店', 'supply' => '补给站', 'ambush' => '埋伏格',
        'fate' => '命运交换', 'shrine' => '山神小屋', 'arena' => '决斗擂台', 'avalanche' => '雪崩', 'fork' => '岔路口',
    ];

    /** 格是否为营地（安全区）。 */
    public static function isCamp(int $cell): bool
    {
        return in_array($cell, self::CAMPS, true);
    }

    /** 格的机关定义；普通格返回 null。 */
    public static function cell(int $cell): ?array
    {
        return self::CELLS[$cell] ?? null;
    }

    /** 格类型；普通格返回 'plain'。 */
    public static function cellType(int $cell): string
    {
        return self::CELLS[$cell]['type'] ?? 'plain';
    }

    /** $cell 所在段位定义；0（未上山）视为第一段。 */
    public static function segmentOf(int $cell): array
    {
        foreach (self::SEGMENTS as $seg) {
            if ($cell >= $seg['from'] && $cell <= $seg['to']) {
                return $seg;
            }
        }
        return self::SEGMENTS[0];
    }

    /**
     * 道具定义：id => {name, when('resolve'=掷骰后窗口 / 'any'=自己回合任意阶段), target(是否需要目标座位)}。
     *
     * @var array<string, array{name: string, when: string, target: bool}>
     */
    public const array ITEMS = [
        'pickaxe' => ['name' => '登山镐', 'when' => 'resolve', 'target' => false],
        'skis' => ['name' => '滑雪板', 'when' => 'any', 'target' => false],
        'gale' => ['name' => '大风咒', 'when' => 'resolve', 'target' => true],
        'snowball' => ['name' => '雪球', 'when' => 'resolve', 'target' => true],
        'cloak' => ['name' => '换位斗篷', 'when' => 'resolve', 'target' => true],
        'cablecar' => ['name' => '缆车票', 'when' => 'resolve', 'target' => false],
        'pouch' => ['name' => '枫叶袋', 'when' => 'any', 'target' => false],
        'weather' => ['name' => '改天换地', 'when' => 'any', 'target' => false],
    ];

    /**
     * 天气牌定义：id => {name, kind('instant'|'rule'), desc}。效果实现见 AdventureRule。
     *
     * @var array<string, array{name: string, kind: string, desc: string}>
     */
    public const array WEATHER_CARDS = [
        'tailwind' => ['name' => '顺风', 'kind' => 'instant', 'desc' => '全员前进 2 格'],
        'galewind' => ['name' => '山风骤起', 'kind' => 'instant', 'desc' => '全员后退 3 格'],
        'landslide' => ['name' => '泥石流', 'kind' => 'instant', 'desc' => '第一名退 5，最后一名进 3'],
        'leafrain' => ['name' => '枫叶雨', 'kind' => 'instant', 'desc' => '全员 +3 枫叶'],
        'tornado' => ['name' => '龙卷风', 'kind' => 'instant', 'desc' => '每人掷骰：≥4 前进、≤3 后退'],
        'storm' => ['name' => '暴风', 'kind' => 'rule', 'desc' => '本轮滑坡/落石距离翻倍'],
        'fog' => ['name' => '大雾', 'kind' => 'rule', 'desc' => '本轮禁止使用道具'],
        'cablehalt' => ['name' => '缆车停运', 'kind' => 'rule', 'desc' => '本轮缆车格视为普通格'],
        'sun' => ['name' => '烈日', 'kind' => 'rule', 'desc' => '本轮温泉 +4、补给摸 2'],
        'huntwind' => ['name' => '猎风', 'kind' => 'rule', 'desc' => '本轮决斗胜者额外 +1'],
        'pollen' => ['name' => '花粉季', 'kind' => 'rule', 'desc' => '本轮枫叶格 +4'],
        'summitblizzard' => ['name' => '封顶暴雪', 'kind' => 'rule', 'desc' => '本轮无法进入雪线（目标截断为 81）'],
    ];

    /** 天气牌库（各一张，洗牌后存 state.weather.deck）。 */
    public static function weatherDeckIds(): array
    {
        return array_keys(self::WEATHER_CARDS);
    }
}
