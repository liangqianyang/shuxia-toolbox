<?php

declare(strict_types=1);

namespace App\Service;

use App\Service\Ai\AiProvider;
use App\Service\Map\MapProvider;
use RuntimeException;

/**
 * 旅游攻略业务编排。地理编码代理 + AI 行程规划（best-effort 给每站补坐标）。
 */
final class TravelService
{
    public function __construct(
        private readonly MapProvider $map,
        private readonly AiProvider $ai,
    ) {}

    /**
     * @return array<int, array{name: string, title: string, lng: float, lat: float, province: string, city: string, adcode: string}>
     */
    public function geocode(string $query): array
    {
        return $this->map->geocode($query);
    }

    /**
     * AI 生成行程，并 best-effort 给每站补坐标 + 站间路线（按出行方式）+ 两张真实地图。
     * 坐标 / 路线查询失败（如未配腾讯 key）留 null，不影响行程输出。
     *
     * @param array{destination: string, days: int, daily_hours: float, preferences?: string, origin?: ?string, travel_mode?: string} $input
     *
     * @return array{title: string, routeMapImage: string|null, poiMapImage: string|null, food: array<int, array{name: string, shop: string, dishes: array<int, string>, note: string}>, tips: array<int, string>, xhs: array{title: string, body: string, tags: array<int, string>}, days: array<int, array{index: int, title: string, stops: array<int, array{name: string, type: string, time: string, note: string, lng: float|null, lat: float|null, travelToNext: array{mode: string, distanceM: int, durationMin: int}|null}>}>}
     */
    public function plan(array $input): array
    {
        $itinerary = $this->ai->generateItinerary($input);
        $destination = (string) ($input['destination'] ?? '');
        // 景点之间的衔接方式由系统按实际距离推荐（<1.5km 步行，更远驾车/打车）。
        // 用户选的 travel_mode 只代表「如何到达目的地」（如火车/自驾跨城，交给 AI 规划时参考），
        // 不套用到景点间——否则选了火车，所有景点衔接都会变成「火车」。

        // best-effort geocode：逐站查坐标，失败留 null
        foreach ($itinerary['days'] as &$day) {
            foreach ($day['stops'] as &$stop) {
                $stop['lng'] = null;
                $stop['lat'] = null;
                $stop['travelToNext'] = null;
                try {
                    $keyword = $destination !== '' ? $stop['name'] . ' ' . $destination : $stop['name'];
                    $candidates = $this->map->geocode($keyword);
                    if (! empty($candidates)) {
                        $stop['lng'] = $candidates[0]['lng'];
                        $stop['lat'] = $candidates[0]['lat'];
                    }
                } catch (RuntimeException $_) {
                    // 无腾讯 key / 查询失败：留 null，前端路线图走线性兜底
                }
            }
            unset($stop);

            // 当天相邻站路线（best-effort）：按两站直线距离推荐出行方式，有坐标才算，失败留 null
            $stops = &$day['stops'];
            for ($i = 0, $n = count($stops); $i < $n - 1; $i++) {
                $a = $stops[$i];
                $b = $stops[$i + 1];
                if (($a['lng'] ?? null) === null || ($b['lng'] ?? null) === null) {
                    continue;
                }
                $roughM = $this->haversineM((float) $a['lat'], (float) $a['lng'], (float) $b['lat'], (float) $b['lng']);
                $legMode = $roughM < 1500 ? 'walking' : 'driving';
                try {
                    $r = $this->map->directions(
                        ['lat' => $a['lat'], 'lng' => $a['lng']],
                        ['lat' => $b['lat'], 'lng' => $b['lng']],
                        $legMode,
                    );
                    $stops[$i]['travelToNext'] = [
                        'mode' => $legMode,
                        'distanceM' => $r['distanceM'],
                        'durationMin' => $r['durationMin'],
                    ];
                } catch (RuntimeException $_) {
                    // 留 null
                }
            }
            unset($stops);
        }

        // 跨城段：出发地 → 目的地（用户所选 travel_mode，如火车）。geocode 出发地，
        // 算到目的地中心的直线距离 + 按方式估时。路线规划图据此画「出发地→目的地」概览，
        // 否则用户选了火车却只看到市内景点间的步行/驾车，误以为整段只有几公里。
        $originName = trim((string) ($input['origin'] ?? ''));
        $mode = (string) ($input['travel_mode'] ?? 'walking');
        $roundTrip = (bool) ($input['round_trip'] ?? false);
        $intercity = null;
        $destCenter = $this->destinationCenter($itinerary['days']);
        if ($originName !== '' && $destCenter !== null) {
            try {
                $originCands = $this->map->geocode($originName);
                if (! empty($originCands)) {
                    $oLat = (float) $originCands[0]['lat'];
                    $oLng = (float) $originCands[0]['lng'];
                    $distM = $this->haversineM($oLat, $oLng, $destCenter['lat'], $destCenter['lng']);
                    $intercity = [
                        'from' => $originName,
                        'to' => $destination !== '' ? $destination : '目的地',
                        'mode' => $mode,
                        'distanceM' => (int) round($distM),
                        'durationMin' => $this->estimateDurationMin($mode, $distM),
                        'roundTrip' => $roundTrip,
                        'lat' => $oLat,
                        'lng' => $oLng,
                    ];
                }
            } catch (RuntimeException $_) {
                // 出发地查不到坐标：无跨城概览，路线图退回市内序列
            }
        }
        $itinerary['intercity'] = $intercity;

        // 市内路线图：编号 markers + 按天连线（游玩顺序），始终生成（「游玩顺序图」用真实地图 + 连线）
        $cityRouteMap = $this->buildMapImage($itinerary['days'], true);
        // 路线规划图：有跨城段时画「出发地→目的地」概览（用户所选方式），否则复用市内路线图
        $itinerary['routeMapImage'] = $intercity !== null
            ? $this->buildOverviewMap($intercity, $destCenter)
            : $cityRouteMap;
        // 景点分布图：仅 markers（无折线），突出市内空间分布
        $itinerary['poiMapImage'] = $this->buildMapImage($itinerary['days'], false);
        // 游玩顺序图底图（真实市内地图 + 编号点 + 按天连线）
        $itinerary['cityRouteMapImage'] = $cityRouteMap;

        return $itinerary;
    }

    /** 目的地中心 = 所有已 geocode 站点的经纬度均值（无有效点返回 null） */
    private function destinationCenter(array $days): ?array
    {
        $lats = [];
        $lngs = [];
        foreach ($days as $day) {
            foreach ($day['stops'] ?? [] as $s) {
                if (($s['lng'] ?? null) !== null) {
                    $lats[] = (float) $s['lat'];
                    $lngs[] = (float) $s['lng'];
                }
            }
        }
        if ($lats === []) {
            return null;
        }
        return [
            'lat' => array_sum($lats) / count($lats),
            'lng' => array_sum($lngs) / count($lngs),
        ];
    }

    /** 按出行方式估算跨城耗时（分钟）：火车/高铁 ~180、自驾 ~80、公交 ~40、骑行 ~15、步行 ~5 km/h */
    private function estimateDurationMin(string $mode, float $distM): int
    {
        $speedKmh = match ($mode) {
            'train' => 180.0,
            'driving' => 80.0,
            'transit' => 40.0,
            'cycling' => 15.0,
            default => 5.0,
        };
        return (int) round(($distM / 1000.0) / $speedKmh * 60.0);
    }

    /** 跨城概览 staticmap：起点 + 目的地中心 + 连线，腾讯按两点自动适配范围 */
    private function buildOverviewMap(array $intercity, ?array $destCenter): ?string
    {
        if ($destCenter === null) {
            return null;
        }
        return $this->map->staticMap(
            [
                ['lat' => $intercity['lat'], 'lng' => $intercity['lng'], 'color' => '5A4632', 'label' => 'S', 'size' => 'large'],
                ['lat' => $destCenter['lat'], 'lng' => $destCenter['lng'], 'color' => 'C8956C', 'label' => 'E', 'size' => 'large'],
            ],
            [
                [
                    ['lat' => $intercity['lat'], 'lng' => $intercity['lng']],
                    ['lat' => $destCenter['lat'], 'lng' => $destCenter['lng']],
                ],
            ],
            ['width' => 900, 'height' => 620]
        );
    }

    /**
     * 两点间球面直线距离（米，haversine）。用于按距离推荐景点间出行方式。
     */
    private function haversineM(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $R = 6371000.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        return 2 * $R * asin(sqrt($a));
    }

    /**
     * 由各站坐标构建 staticmap URL（无坐标站跳过；不足 1 点返回 null）。
     *
     * @param array<int, array{stops: array<int, array{lat: float|null, lng: float|null, type: string}>}> $days
     * @param bool $withPath true=按天连折线（路线图）；false=仅打点（分布图）
     */
    private function buildMapImage(array $days, bool $withPath): ?string
    {
        $poiColor = [
            'sight' => 'E8945A',
            'food' => 'D9534F',
            'stay' => '5B8DEF',
            'shop' => '9B59B6',
            'transit' => '27AE60',
        ];

        // 先数有效点：点多则用小号 marker，避免地图拥挤
        $validCount = 0;
        foreach ($days as $day) {
            foreach ($day['stops'] ?? [] as $s) {
                if (($s['lng'] ?? null) !== null) {
                    $validCount++;
                }
            }
        }
        $markerSize = $validCount > 8 ? 'mid' : 'large';

        $markers = [];
        $paths = [];
        $seq = 0;
        foreach ($days as $day) {
            $seg = [];
            foreach ($day['stops'] ?? [] as $s) {
                if (($s['lng'] ?? null) === null) {
                    continue;
                }
                $seq++;
                // 腾讯 staticmap marker label 仅支持单字符（0-9/A-Z）：
                // 1-9 直接用数字（与下方编号清单一一对应）；超过 9 不标号，仅以颜色点呈现，
                // 避免第 10 个的 label「1」与第 1 个重复造成混淆。
                $markers[] = [
                    'lat' => $s['lat'],
                    'lng' => $s['lng'],
                    'color' => $poiColor[$s['type']] ?? 'C8956C',
                    'label' => $seq <= 9 ? (string) $seq : '',
                    'size' => $markerSize,
                ];
                $seg[] = ['lat' => $s['lat'], 'lng' => $s['lng']];
            }
            if ($withPath && count($seg) >= 2) {
                $paths[] = $seg;
            }
        }
        if ($markers === []) {
            return null;
        }

        // 竖版小红书 3:4 比例（1080×1440 的地图区约取正方偏方形，腾讯 staticmap 上限 928）
        return $this->map->staticMap($markers, $paths, ['width' => 900, 'height' => 720]);
    }
}
