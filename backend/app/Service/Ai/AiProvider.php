<?php

declare(strict_types=1);

namespace App\Service\Ai;

/**
 * AI 服务商抽象。首版智谱 GLM，后续可接 OpenAI / 通义 / DeepSeek 等。
 * 仅负责「生成结构化行程」；坐标 / 路线 / 地图等能力走 MapProvider。
 */
interface AiProvider
{
    /**
     * 生成结构化行程（可联网搜索目的地当季最新信息后综合）。
     *
     * @param array{destination: string, days: int, daily_hours: float, preferences?: string, origin?: ?string, travel_mode?: string} $input
     * @return array{
     *     title: string,
     *     days: array<int, array{
     *         index: int,
     *         title: string,
     *         routeTag?: string,
     *         stops: array<int, array{name: string, type: string, time: string, note: string}>
     *     }>,
     *     food: array<int, array{name: string, shop: string, dishes: array<int, string>, note: string}>,
     *     tips: array<int, string>,
     *     xhs: array{title: string, body: string, tags: array<int, string>},
     *     packingTips: array<int, string>
     * }
     */
    public function generateItinerary(array $input): array;
}
