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
     * @param array{destination: string, days: int, daily_hours: float|array<int, float>, preferences?: string, origin?: ?string, travel_mode?: string, intensity?: string, round_trip?: bool, departure_date?: string, sights?: string, foods?: string} $input
     * @return array{
     *     title: string,
     *     days: array<int, array{
     *         index: int,
     *         title: string,
     *         routeTag?: string,
     *         dayMood?: string,
     *         handbookSummary?: string,
     *         stops: array<int, array{name: string, type: string, time: string, note: string, handbookText?: string}>
     *     }>,
     *     food: array<int, array{name: string, shop: string, dishes: array<int, string>, note: string, poiInfo?: array{openHours: string, reservation: string, ticket: string, duration: string}}>,
     *     tips: array<int, string>,
     *     xhs: array{title: string, body: string, tags: array<int, string>},
     *     packingMust: array<int, string>,
     *     packingNotes: array<int, string>,
     *     intercity: array{durationMin: int|null, distanceM: int|null, note: string}|null
     * }
     */
    public function generateItinerary(array $input): array;

    /**
     * 局部重写单日行程。锁定地点由调用方传入，AI 必须保留。
     *
     * @param array{destination: string, day_index: int, day: array, locked_stops: array<int, array>, travel_mode?: string, intensity?: string, daily_hours?: float} $input
     * @return array{index: int, title: string, routeTag?: string, dayMood?: string, handbookSummary?: string, stops: array<int, array{name: string, type: string, time: string, note: string, handbookText?: string}>}
     */
    public function regenerateDay(array $input): array;

    /**
     * 替换单日行程中的一个地点。调用方负责把返回地点合并回当天行程。
     *
     * @param array{destination: string, day_index: int, stop_index: int, day: array, target_stop: array, locked_stops?: array<int, array>, travel_mode?: string, intensity?: string, daily_hours?: float} $input
     * @return array{name: string, type: string, time: string, note: string, handbookText?: string, poiInfo: array{openHours: string, reservation: string, ticket: string, duration: string}}
     */
    public function replaceStop(array $input): array;
}
