<?php

declare(strict_types=1);

namespace App\Service\Map;

/**
 * 地图服务商抽象。首版实现腾讯位置服务，后续可换高德。
 */
interface MapProvider
{
    /**
     * 地址 → 坐标候选列表（供前端搜索确认）。
     *
     * @return array<int, array{
     *     name: string,
     *     title: string,
     *     lng: float,
     *     lat: float,
     *     province: string,
     *     city: string,
     *     adcode: string
     * }>
     */
    public function geocode(string $query): array;

    /**
     * 静态地图图片 URL：markers + 路径折线，自动适配范围（无需 center/zoom）。
     *
     * @param array<int, array{lat: float, lng: float, color?: string, label?: string}> $markers
     * @param array<int, array<int, array{lat: float, lng: float}>> $paths 多段折线（如按天），每段至少 2 点
     * @param array{width: int, height: int} $size
     * @return string 图片 URL（空字符串表示不支持 / 无有效点）
     */
    public function staticMap(array $markers, array $paths, array $size): string;

    /**
     * 两点间路线规划。腾讯 walking 的 duration 实测为「分钟」（非秒）。
     *
     * @param array{lat: float, lng: float} $from
     * @param array{lat: float, lng: float} $to
     * @param string $mode walking|driving|cycling
     * @return array{distanceM: int, durationMin: int, polyline: array<int, float>}
     */
    public function directions(array $from, array $to, string $mode = 'walking'): array;

    /**
     * 周边搜索（探索）：中心点 radius 米内、匹配 keyword 的 POI。
     *
     * @param array{lat: float, lng: float} $center
     * @return array<int, array{name: string, address: string, distanceM: int, lat: float, lng: float}>
     */
    public function explore(array $center, int $radius, string $keyword): array;
}
