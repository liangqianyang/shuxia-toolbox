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
    public function geocode(string $query, string $region = ''): array
    {
        return $this->map->geocode($query, $region);
    }

    /**
     * 局部重写某一天：AI 只改当天未锁定地点，服务端合并锁定点、补坐标、重建地图。
     *
     * @param array{destination: string, day_index: int, day: array, days: array<int, array>, locked_stops: array<int, array>, travel_mode?: string, intensity?: string, intercity?: array|null} $input
     * @return array{
     *   day: array,
     *   routeMapImage: string|null,
     *   poiMapImage: string|null,
     *   cityRouteMapImage: string|null,
     *   mapViewport: array|null
     * }
     */
    public function refineDay(array $input): array
    {
        $destination = trim((string) ($input['destination'] ?? ''));
        $dayIndex = max(1, (int) ($input['day_index'] ?? 1));
        $days = is_array($input['days'] ?? null) ? array_values($input['days']) : [];
        if ($days === []) {
            throw new RuntimeException('缺少当前行程数据');
        }

        $day = $this->ai->regenerateDay($input);
        $day['index'] = $dayIndex;
        $day = $this->mergeLockedStops($day, is_array($input['locked_stops'] ?? null) ? $input['locked_stops'] : []);
        $this->enrichDay($day, $destination);

        $replaced = false;
        foreach ($days as &$existingDay) {
            if ((int) ($existingDay['index'] ?? 0) === $dayIndex) {
                $existingDay = $day;
                $replaced = true;
                break;
            }
        }
        unset($existingDay);
        if (! $replaced) {
            $days[] = $day;
        }

        $viewport = $this->computeViewport($days);
        $cityRouteMap = $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($days, true, true);
        $intercity = is_array($input['intercity'] ?? null) ? $input['intercity'] : null;
        $destCenter = $this->destinationCenter($days);
        $hasOverviewCoords = $intercity !== null && ($intercity['lat'] ?? null) !== null && ($intercity['lng'] ?? null) !== null;

        return [
            'day' => $day,
            'routeMapImage' => $hasOverviewCoords ? $this->buildOverviewMap($intercity, $destCenter) : $cityRouteMap,
            'poiMapImage' => $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($days, false),
            'cityRouteMapImage' => $cityRouteMap,
            'mapViewport' => $viewport,
        ];
    }

    /**
     * 替换当天单个地点：其它地点保持原样，只对目标 slot 换新 stop，并重算坐标/站间交通/地图。
     *
     * @param array{destination: string, day_index: int, stop_index: int, day: array, days: array<int, array>, target_stop?: array, locked_stops?: array<int, array>, travel_mode?: string, intensity?: string, intercity?: array|null} $input
     * @return array{
     *   day: array,
     *   routeMapImage: string|null,
     *   poiMapImage: string|null,
     *   cityRouteMapImage: string|null,
     *   mapViewport: array|null
     * }
     */
    public function replaceStop(array $input): array
    {
        $destination = trim((string) ($input['destination'] ?? ''));
        $dayIndex = max(1, (int) ($input['day_index'] ?? 1));
        $stopIndex = max(0, (int) ($input['stop_index'] ?? 0));
        $days = is_array($input['days'] ?? null) ? array_values($input['days']) : [];
        $day = is_array($input['day'] ?? null) ? $input['day'] : [];
        $stops = is_array($day['stops'] ?? null) ? array_values($day['stops']) : [];
        if ($days === [] || $stops === []) {
            throw new RuntimeException('缺少当前行程数据');
        }
        if (! isset($stops[$stopIndex]) || ! is_array($stops[$stopIndex])) {
            throw new RuntimeException('要替换的地点不存在');
        }
        if ((bool) ($stops[$stopIndex]['locked'] ?? false)) {
            throw new RuntimeException('锁定地点不能替换，请先解锁');
        }

        $input['target_stop'] = $stops[$stopIndex];
        $replacement = $this->ai->replaceStop($input);
        $replacement['lng'] = null;
        $replacement['lat'] = null;
        $replacement['travelToNext'] = null;
        $replacement['photo'] = null;
        $replacement['locked'] = false;

        $stops[$stopIndex] = $replacement;
        $day['index'] = $dayIndex;
        $day['stops'] = array_values($stops);
        $this->enrichDay($day, $destination);

        $replaced = false;
        foreach ($days as &$existingDay) {
            if ((int) ($existingDay['index'] ?? 0) === $dayIndex) {
                $existingDay = $day;
                $replaced = true;
                break;
            }
        }
        unset($existingDay);
        if (! $replaced) {
            $days[] = $day;
        }

        $viewport = $this->computeViewport($days);
        $cityRouteMap = $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($days, true, true);
        $intercity = is_array($input['intercity'] ?? null) ? $input['intercity'] : null;
        $destCenter = $this->destinationCenter($days);
        $hasOverviewCoords = $intercity !== null && ($intercity['lat'] ?? null) !== null && ($intercity['lng'] ?? null) !== null;

        return [
            'day' => $day,
            'routeMapImage' => $hasOverviewCoords ? $this->buildOverviewMap($intercity, $destCenter) : $cityRouteMap,
            'poiMapImage' => $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($days, false),
            'cityRouteMapImage' => $cityRouteMap,
            'mapViewport' => $viewport,
        ];
    }

    /**
     * AI 生成行程，并 best-effort 给每站补坐标 + 站间路线（按出行方式）+ 两张真实地图。
     * 坐标 / 路线查询失败（如未配腾讯 key）留 null，不影响行程输出。
     *
     * @param array{destination: string, days: int, daily_hours: float|array<int, float>, preferences?: string, origin?: ?string, travel_mode?: string, intensity?: string, round_trip?: bool, departure_date?: string, sights?: string, foods?: string} $input
     *
     * @return array{
     *   title: string,
     *   routeMapImage: string|null,
     *   poiMapImage: string|null,
     *   cityRouteMapImage: string|null,
     *   intercity: array|null,
     *   packingTips: array<int, string>,
     *   food: array<int, array{name: string, shop: string, dishes: array<int, string>, note: string, poiInfo?: array{openHours: string, reservation: string, ticket: string, duration: string}}>,
     *   tips: array<int, string>,
     *   xhs: array{title: string, body: string, tags: array<int, string>},
     *   days: array<int, array{
     *     index: int,
     *     title: string,
     *     routeTag?: string,
     *     stops: array<int, array{name: string, type: string, time: string, note: string, lng: float|null, lat: float|null, travelToNext: array{mode: string, distanceM: int, durationMin: int}|null}>
     *   }>
     * }
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
                    // 目的地作为 region 硬约束（region_fix），避免同名 POI 命中外地把地图视口撑大
                    $candidates = $this->map->geocode($stop['name'], $destination);
                    if (! empty($candidates)) {
                        $this->applyGeocodeCandidate($stop, $candidates[0]);
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
                $leg = $this->recommendLeg($a, $b, $roughM, $destination);
                if ($leg !== null) {
                    $stops[$i]['travelToNext'] = $leg;
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
        if ($originName !== '' && $originName !== $destination && $destCenter !== null) {
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
        // AI 联网查到的真实跨城耗时/里程/备注（来自 generateItinerary 返回的 intercity 字段）。
        // 合并必须放在 geocode 的 try 块之外：geocode 失败时 $intercity 仍为 null，但 AI 可能已给出真实耗时，
        // 此时也不能丢——geocode 成功用 AI 值覆盖 haversine 估算；geocode 失败但 AI 有耗时则构造无坐标 intercity
        // （前端能展示「约 2 小时」但不画概览图）。
        $aiInter = $itinerary['intercity'] ?? null;
        if (is_array($aiInter)) {
            $aiDur = $aiInter['durationMin'] ?? null;
            $aiDist = $aiInter['distanceM'] ?? null;
            $aiNote = is_string($aiInter['note'] ?? null) ? trim((string) $aiInter['note']) : '';
            if ($intercity !== null) {
                if ($aiDur !== null) {
                    $intercity['durationMin'] = $aiDur;
                }
                if ($aiDist !== null) {
                    $intercity['distanceM'] = $aiDist;
                }
                if ($aiNote !== '') {
                    $intercity['note'] = $aiNote;
                }
            } elseif ($aiDur !== null) {
                // geocode 失败兜底：仅耗时/备注可用，无坐标 → 路线图退回市内序列
                $intercity = [
                    'from' => $originName,
                    'to' => $destination !== '' ? $destination : '目的地',
                    'mode' => $mode,
                    'distanceM' => $aiDist ?? 0,
                    'durationMin' => $aiDur,
                    'roundTrip' => $roundTrip,
                    'lat' => null,
                    'lng' => null,
                    'note' => $aiNote,
                ];
            }
        }
        $itinerary['intercity'] = $intercity;

        // 景点分布图：无标注地理底图（按视口 center+zoom）+ 前端 canvas 叠加清晰编号点。
        // 腾讯 staticMap 栅格 marker 在 2x 导出会糊；改为前端画编号点（矢量，导出清晰，且与底图同视口严格对齐）。
        // 无视口（无有效坐标）时退回旧的带 marker 栅格图。
        $viewport = $this->computeViewport($itinerary['days']);
        // 市内路线图同样使用无标注底图，前端叠加清晰编号点和按天路线色。
        $cityRouteMap = $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($itinerary['days'], true, true);
        // 路线规划图：有跨城段且有出发地坐标时画「出发地→目的地」概览（用户所选方式），否则复用市内路线图。
        // 无坐标 intercity（geocode 失败兜底）不能进 buildOverviewMap——staticMap 收 null 经纬度会失败。
        $hasOverviewCoords = $intercity !== null && ($intercity['lat'] ?? null) !== null;
        $itinerary['routeMapImage'] = $hasOverviewCoords
            ? $this->buildOverviewMap($intercity, $destCenter)
            : $cityRouteMap;
        $itinerary['poiMapImage'] = $viewport !== null ? $this->buildBaseMap($viewport) : $this->buildMapImage($itinerary['days'], false);
        $itinerary['mapViewport'] = $viewport;
        // 游玩顺序图底图（真实市内地图；编号点 + 按天连线由前端 Canvas 叠加，保证清晰可控）
        $itinerary['cityRouteMapImage'] = $cityRouteMap;

        return $itinerary;
    }

    private function mergeLockedStops(array $day, array $lockedStops): array
    {
        $stops = is_array($day['stops'] ?? null) ? array_values($day['stops']) : [];
        usort($lockedStops, fn ($a, $b) => (int) ($a['slot'] ?? 0) <=> (int) ($b['slot'] ?? 0));
        foreach ($lockedStops as $item) {
            if (! is_array($item)) {
                continue;
            }
            $slot = max(0, (int) ($item['slot'] ?? 0));
            $rawStop = is_array($item['stop'] ?? null) ? $item['stop'] : $item;
            $locked = $this->normalizeLockedStop($rawStop);
            if ($slot >= count($stops)) {
                $stops[] = $locked;
            } else {
                $stops[$slot] = $locked;
            }
        }
        $day['stops'] = array_values($stops);
        return $day;
    }

    private function normalizeLockedStop(array $stop): array
    {
        $type = (string) ($stop['type'] ?? 'sight');
        if (! in_array($type, ['sight', 'food', 'stay', 'shop', 'transit'], true)) {
            $type = 'sight';
        }
        $out = [
            'name' => is_string($stop['name'] ?? null) ? trim((string) $stop['name']) : '锁定地点',
            'type' => $type,
            'time' => is_string($stop['time'] ?? null) ? trim((string) $stop['time']) : '',
            'note' => is_string($stop['note'] ?? null) ? trim((string) $stop['note']) : '',
            'handbookText' => is_string($stop['handbookText'] ?? null) ? trim((string) $stop['handbookText']) : '',
            'lng' => isset($stop['lng']) && $stop['lng'] !== null ? (float) $stop['lng'] : null,
            'lat' => isset($stop['lat']) && $stop['lat'] !== null ? (float) $stop['lat'] : null,
            'travelToNext' => null,
            'locked' => true,
        ];
        if (is_array($stop['poiInfo'] ?? null)) {
            $out['poiInfo'] = [
                'openHours' => is_string($stop['poiInfo']['openHours'] ?? null) ? trim((string) $stop['poiInfo']['openHours']) : '',
                'reservation' => is_string($stop['poiInfo']['reservation'] ?? null) ? trim((string) $stop['poiInfo']['reservation']) : '',
                'ticket' => is_string($stop['poiInfo']['ticket'] ?? null) ? trim((string) $stop['poiInfo']['ticket']) : '',
                'duration' => is_string($stop['poiInfo']['duration'] ?? null) ? trim((string) $stop['poiInfo']['duration']) : '',
            ];
        }
        if (is_string($stop['id'] ?? null)) {
            $out['id'] = $stop['id'];
        }
        if (is_string($stop['photo'] ?? null)) {
            $out['photo'] = $stop['photo'];
        }
        if (is_string($stop['illustrationPrompt'] ?? null)) {
            $out['illustrationPrompt'] = trim((string) $stop['illustrationPrompt']);
        }
        return $out;
    }

    private function enrichDay(array &$day, string $destination): void
    {
        foreach ($day['stops'] as &$stop) {
            $stop['travelToNext'] = null;
            if (($stop['lng'] ?? null) !== null && ($stop['lat'] ?? null) !== null) {
                continue;
            }
            try {
                // 目的地作为 region 硬约束，避免同名 POI 命中外地
                $candidates = $this->map->geocode($stop['name'], $destination);
                if (! empty($candidates)) {
                    $this->applyGeocodeCandidate($stop, $candidates[0]);
                } else {
                    $stop['lng'] = null;
                    $stop['lat'] = null;
                }
            } catch (RuntimeException $_) {
                $stop['lng'] = $stop['lng'] ?? null;
                $stop['lat'] = $stop['lat'] ?? null;
            }
        }
        unset($stop);

        $stops = &$day['stops'];
        for ($i = 0, $n = count($stops); $i < $n - 1; $i++) {
            $a = $stops[$i];
            $b = $stops[$i + 1];
            if (($a['lng'] ?? null) === null || ($b['lng'] ?? null) === null) {
                continue;
            }
            $roughM = $this->haversineM((float) $a['lat'], (float) $a['lng'], (float) $b['lat'], (float) $b['lng']);
            $leg = $this->recommendLeg($a, $b, $roughM, $destination);
            if ($leg !== null) {
                $stops[$i]['travelToNext'] = $leg;
            }
        }
        unset($stops);
    }

    private function applyGeocodeCandidate(array &$stop, array $candidate): void
    {
        $stop['lng'] = (float) $candidate['lng'];
        $stop['lat'] = (float) $candidate['lat'];
        $stop['_mapCity'] = (string) ($candidate['city'] ?? '');
        $stop['_mapAdcode'] = (string) ($candidate['adcode'] ?? '');
    }

    private function recommendLeg(array $a, array $b, float $roughM, string $cityHint = ''): ?array
    {
        $from = $this->pointOf($a);
        $to = $this->pointOf($b);
        if ($from === null || $to === null) {
            return null;
        }

        $candidates = [];
        $walking = $this->tryDirectionCandidate($from, $to, 'walking', 'walking', '步行直达');
        if ($walking !== null && ($roughM <= 2600 || $walking['durationMin'] <= 35)) {
            $candidates[] = $walking;
        }

        $cycling = $this->tryDirectionCandidate($from, $to, 'cycling', 'cycling', '共享单车');
        if ($cycling === null && $roughM >= 700 && $roughM <= 9000) {
            $cycling = $this->estimatedCyclingCandidate($roughM);
        }
        if ($cycling !== null && $roughM >= 700 && $roughM <= 9000) {
            $candidates[] = $cycling;
        }

        $taxi = $this->tryDirectionCandidate($from, $to, 'driving', 'taxi', '打车');
        if ($taxi !== null && $roughM >= 1000) {
            $candidates[] = $taxi;
        }

        $transit = $this->tryTransitRoute($a, $b, $roughM, $cityHint);
        if ($transit !== null) {
            $mainMode = $this->transitMainMode($transit);
            $candidates[] = [
                'mode' => $mainMode,
                'distanceM' => (int) ($transit['distanceM'] ?: $roughM),
                'durationMin' => (int) $transit['durationMin'],
                'detail' => $this->transitDetail($transit),
                'transit' => $transit,
            ];
        }

        if ($candidates === []) {
            return null;
        }

        $ranked = $this->rankLegCandidates($candidates, $roughM);
        $best = $ranked[0];
        $best['reason'] = $this->legReason($best, $ranked, $roughM);
        $best['alternatives'] = $this->legAlternatives($ranked, (string) $best['mode']);
        if ($transit !== null && ! isset($best['transit'])) {
            // 备用公共交通详情仍挂上去，让“地铁公交换乘图”可用，也方便用户手动改成公交/地铁。
            $best['transit'] = $transit;
        }
        return $best;
    }

    private function pointOf(array $stop): ?array
    {
        if (($stop['lng'] ?? null) === null || ($stop['lat'] ?? null) === null) {
            return null;
        }
        return ['lat' => (float) $stop['lat'], 'lng' => (float) $stop['lng']];
    }

    private function tryDirectionCandidate(array $from, array $to, string $requestMode, string $displayMode, string $detail): ?array
    {
        try {
            $route = $this->map->directions($from, $to, $requestMode);
        } catch (RuntimeException $_) {
            return null;
        }
        $duration = (int) ($route['durationMin'] ?? 0);
        $distance = (int) ($route['distanceM'] ?? 0);
        if ($duration <= 0 || $distance <= 0) {
            return null;
        }
        return [
            'mode' => $displayMode,
            'distanceM' => $distance,
            'durationMin' => $duration,
            'detail' => $detail,
        ];
    }

    private function estimatedCyclingCandidate(float $roughM): array
    {
        // 骑行 API 偶尔不可用时的兜底：按实际路网绕行 1.18 倍、共享单车均速约 13km/h，再加取还车缓冲。
        $distanceM = (int) round($roughM * 1.18);
        $duration = (int) ceil(($distanceM / 1000.0) / 13.0 * 60.0 + 4);
        return [
            'mode' => 'cycling',
            'distanceM' => $distanceM,
            'durationMin' => $duration,
            'detail' => '共享单车',
        ];
    }

    /**
     * @param array<int, array<string, mixed>> $candidates
     */
    private function rankLegCandidates(array $candidates, float $roughM): array
    {
        usort($candidates, function (array $a, array $b) use ($roughM): int {
            return $this->legScore($a, $roughM) <=> $this->legScore($b, $roughM);
        });
        return $candidates;
    }

    private function legScore(array $candidate, float $roughM): float
    {
        $mode = (string) ($candidate['mode'] ?? '');
        $duration = max(1, (int) ($candidate['durationMin'] ?? 0));
        $distanceKm = $roughM / 1000.0;
        $score = (float) $duration;

        if ($mode === 'walking') {
            if ($roughM <= 900) {
                $score -= 8.0;
            } elseif ($roughM > 1800) {
                $score += 12.0;
            } elseif ($duration <= 22) {
                $score -= 3.0;
            }
        } elseif ($mode === 'cycling') {
            $score += 4.0; // 找车/停车的真实摩擦
            if ($roughM >= 1200 && $roughM <= 4500) {
                $score -= 5.0;
            }
        } elseif ($mode === 'taxi') {
            $score += 8.0 + min(12.0, $distanceKm * 1.4); // 成本、等车、拥堵不确定性
        } elseif ($mode === 'metro' || $mode === 'bus') {
            $transit = is_array($candidate['transit'] ?? null) ? $candidate['transit'] : [];
            $walkingM = (int) ($transit['walkingM'] ?? 0);
            $transferCount = (int) ($transit['transferCount'] ?? 0);
            $score += $walkingM / 120.0 + $transferCount * 6.0;
            if ($mode === 'metro') {
                $score -= $roughM >= 2200 ? 9.0 : 3.0;
            } else {
                $score += 5.0; // 公交受拥堵/等车影响更大
            }
        }

        return $score;
    }

    /**
     * @param array<int, array<string, mixed>> $ranked
     */
    private function legReason(array $best, array $ranked, float $roughM): string
    {
        $mode = (string) ($best['mode'] ?? '');
        $duration = (int) ($best['durationMin'] ?? 0);
        $fastest = $ranked[0] ?? $best;
        foreach ($ranked as $candidate) {
            if ((int) ($candidate['durationMin'] ?? PHP_INT_MAX) < (int) ($fastest['durationMin'] ?? PHP_INT_MAX)) {
                $fastest = $candidate;
            }
        }
        $fastestDuration = (int) ($fastest['durationMin'] ?? $duration);
        $saved = max(0, $fastestDuration - $duration);
        $distanceText = $roughM >= 1000 ? sprintf('约 %.1fkm', $roughM / 1000.0) : '约 ' . (int) round($roughM) . 'm';

        return match ($mode) {
            'walking' => $roughM <= 900
                ? "{$distanceText}，距离很近，步行最省心。"
                : "步行 {$duration} 分钟可控，省去等车和换乘。",
            'cycling' => "{$distanceText}，适合共享单车，通常比步行省时且不受拥堵影响。",
            'taxi' => $saved > 0
                ? "打车总体最快，适合跨区移动或保留体力。"
                : "打车耗时短，换乘和步行成本最低。",
            'metro' => "地铁/轨道交通更稳定，换乘和步行成本可接受。",
            'bus' => "公共交通整体更合适，适合控制费用和减少打车。",
            default => "综合耗时、距离和换乘成本后推荐。",
        };
    }

    /**
     * @param array<int, array<string, mixed>> $ranked
     * @return array<int, array{mode: string, distanceM: int, durationMin: int, detail: string, reason: string}>
     */
    private function legAlternatives(array $ranked, string $bestMode): array
    {
        $out = [];
        $seen = [$bestMode => true];
        $best = $ranked[0] ?? null;
        foreach ($ranked as $candidate) {
            $mode = (string) ($candidate['mode'] ?? '');
            if ($mode === '' || isset($seen[$mode])) {
                continue;
            }
            $seen[$mode] = true;
            $out[] = [
                'mode' => $mode,
                'distanceM' => (int) ($candidate['distanceM'] ?? 0),
                'durationMin' => (int) ($candidate['durationMin'] ?? 0),
                'detail' => (string) ($candidate['detail'] ?? ''),
                'reason' => $this->alternativeReason($candidate, is_array($best) ? $best : null),
            ];
            if (count($out) >= 3) {
                break;
            }
        }
        return $out;
    }

    private function alternativeReason(array $candidate, ?array $best): string
    {
        $mode = (string) ($candidate['mode'] ?? '');
        $duration = (int) ($candidate['durationMin'] ?? 0);
        $bestDuration = is_array($best) ? (int) ($best['durationMin'] ?? 0) : 0;
        $delta = $bestDuration > 0 ? $duration - $bestDuration : 0;
        if ($delta > 0) {
            return match ($mode) {
                'walking' => "慢约 {$delta} 分钟，但最省心。",
                'cycling' => "慢约 {$delta} 分钟，适合天气好时。",
                'metro', 'bus' => "慢约 {$delta} 分钟，但费用更可控。",
                'taxi' => "慢约 {$delta} 分钟，可作为少走路备选。",
                default => "慢约 {$delta} 分钟，可按现场情况选择。",
            };
        }
        return match ($mode) {
            'taxi' => '可能更快，但成本和拥堵不确定性更高。',
            'metro' => '稳定性更好，适合高峰期。',
            'bus' => '费用更低，但等车和拥堵更不确定。',
            'cycling' => '适合天气好、行李少时。',
            'walking' => '适合不赶时间时。',
            default => '可按现场情况选择。',
        };
    }

    private function transitMainMode(array $transit): string
    {
        foreach (($transit['lines'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $text = strtoupper((string) ($line['vehicle'] ?? '')) . ' ' . (string) ($line['title'] ?? '');
            if (preg_match('/地铁|轨道|轻轨|SUBWAY|METRO/i', $text) === 1) {
                return 'metro';
            }
        }
        return 'bus';
    }

    private function transitDetail(array $transit): string
    {
        $titles = [];
        foreach (($transit['lines'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $title = trim((string) ($line['title'] ?? ''));
            if ($title !== '') {
                $titles[] = preg_replace('/\([^)]+\)/', '', $title) ?: $title;
            }
        }
        return implode(' → ', array_slice($titles, 0, 3));
    }

    private function tryTransitRoute(array $a, array $b, float $roughM, string $cityHint = ''): ?array
    {
        if ($roughM < 1200) {
            return null;
        }
        if (strtolower((string) (getenv('MAP_TRANSIT_ENABLED') ?: 'true')) === 'false') {
            return null;
        }
        try {
            return $this->map->transit(
                ['lat' => $a['lat'], 'lng' => $a['lng']],
                ['lat' => $b['lat'], 'lng' => $b['lng']],
                $this->transitCity($a, $b, $cityHint),
            );
        } catch (RuntimeException $_) {
            return null;
        }
    }

    private function transitCity(array $a, array $b, string $cityHint = ''): ?string
    {
        $hint = trim($cityHint);
        if ($hint !== '') {
            return $hint;
        }
        foreach ([$a, $b] as $stop) {
            $adcode = trim((string) ($stop['_mapAdcode'] ?? ''));
            if ($adcode !== '') {
                return $adcode;
            }
            $city = trim((string) ($stop['_mapCity'] ?? ''));
            if ($city !== '') {
                return $city;
            }
        }
        $fallback = trim((string) (getenv('AMAP_TRANSIT_CITY') ?: ''));
        return $fallback !== '' ? $fallback : null;
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
            ['width' => 928, 'height' => 620]
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
     * @param bool $byDay  true=按天上色（marker+路径用当日色，与前端 routeCard DAY_COLORS 一致，
     *                    用于分日路线图）；false=按景点类型色（景点分布图）
     */
    private function buildMapImage(array $days, bool $withPath, bool $byDay = false): ?string
    {
        // 与前端 routeCard.ts 的 DAY_COLORS 完全一致，确保地图配色 ↔ 分日清单配色一致
        $dayColors = ['F6A6A1', 'A8D5A2', '9FC3F0', 'F3C98B', 'C9A8E0'];
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
        foreach ($days as $di => $day) {
            $dayColor = $dayColors[$di % count($dayColors)];
            $seg = [];
            foreach ($day['stops'] ?? [] as $s) {
                if (($s['lng'] ?? null) === null) {
                    continue;
                }
                // transit（火车站/机场等跨城枢纽）不算市内景点：已在路线规划图跨城段体现，
                // 这里跳过，避免污染景点分布图/市内路线图的编号点与折线。
                if (($s['type'] ?? '') === 'transit') {
                    continue;
                }
                $seq++;
                // 腾讯 staticmap marker label 仅支持单字符（0-9/A-Z）：
                // 1-9 直接用数字（与下方编号清单一一对应）；超过 9 不标号，仅以颜色点呈现，
                // 避免第 10 个的 label「1」与第 1 个重复造成混淆。
                $markers[] = [
                    'lat' => $s['lat'],
                    'lng' => $s['lng'],
                    'color' => $byDay ? $dayColor : ($poiColor[$s['type']] ?? 'C8956C'),
                    'label' => $seq <= 9 ? (string) $seq : '',
                    'size' => $markerSize,
                ];
                $seg[] = ['lat' => $s['lat'], 'lng' => $s['lng']];
            }
            if ($withPath && count($seg) >= 2) {
                // 每段路径自带颜色：byDay 用当日色，否则默认米色
                $paths[] = ['color' => $byDay ? $dayColor : 'C8A98A', 'points' => $seg];
            }
        }
        if ($markers === []) {
            return null;
        }

        // 竖版小红书 3:4 比例。腾讯 staticmap 硬上限 ~928px，宽吃满 928 让导出放大前像素尽量多
        return $this->map->staticMap($markers, $paths, ['width' => 928, 'height' => 720]);
    }

    /**
     * 由非 transit 站点坐标算地图视口（center + zoom）。
     * 用标准 Web Mercator（slippy map）反推能装下所有点的最大 zoom，前后端共用同一视口 →
     * 前端投影坐标与腾讯底图严格对齐。供「无标注底图 + 前端 canvas 叠加清晰编号点」场景。
     *
     * @return array{centerLat: float, centerLng: float, zoom: int}|null
     */
    private function computeViewport(array $days): ?array
    {
        $lats = [];
        $lngs = [];
        foreach ($days as $day) {
            foreach ($day['stops'] ?? [] as $s) {
                if (($s['lng'] ?? null) !== null && ($s['type'] ?? '') !== 'transit') {
                    $lats[] = (float) $s['lat'];
                    $lngs[] = (float) $s['lng'];
                }
            }
        }
        if ($lats === []) {
            return null;
        }
        // 剔除离群点：单个坏坐标（同名 POI 命中外地）会把 bbox 撑大、zoom 压到很小，
        // 使底图变成"半个华东"的大地图。以中位数中心为参照，丢弃远超其余点的极端点。
        [$lats, $lngs] = $this->rejectViewportOutliers($lats, $lngs);
        $minLat = min($lats);
        $maxLat = max($lats);
        $minLng = min($lngs);
        $maxLng = max($lngs);
        $cLat = ($minLat + $maxLat) / 2;
        $cLng = ($minLng + $maxLng) / 2;
        $mercY = static function (float $lat): float {
            $r = deg2rad($lat);
            return (1.0 - log(tan($r) + 1.0 / cos($r)) / M_PI) / 2.0;
        };
        $imgW = 928.0;
        $imgH = 720.0;
        $pad = 0.10;
        $latSpan = $maxLat - $minLat;
        $lngSpan = $maxLng - $minLng;
        if ($latSpan < 1e-6 && $lngSpan < 1e-6) {
            $zoom = 15; // 单点
        } else {
            $xSpanTiles = max($lngSpan / 360.0, 1e-6);
            $ySpanTiles = max(abs($mercY($maxLat) - $mercY($minLat)), 1e-6);
            $zByLng = log(($imgW * (1 - 2 * $pad) / 256.0) / $xSpanTiles, 2);
            $zByLat = log(($imgH * (1 - 2 * $pad) / 256.0) / $ySpanTiles, 2);
            $zoom = (int) floor(min($zByLng, $zByLat));
            $zoom = max(3, min(17, $zoom));
        }
        return ['centerLat' => $cLat, 'centerLng' => $cLng, 'zoom' => $zoom];
    }

    /**
     * 剔除视口离群点。以中位数经纬度为稳健中心，丢弃距其过远的极端点
     * （通常是同名 POI 命中外地的坏坐标）。保守策略：至少 3 点才启用，
     * 且仅当离群点远超其余点的分布时才丢，避免误删真实的远景点。
     *
     * @param array<int, float> $lats
     * @param array<int, float> $lngs
     * @return array{0: array<int, float>, 1: array<int, float>}
     */
    private function rejectViewportOutliers(array $lats, array $lngs): array
    {
        $n = count($lats);
        if ($n < 3) {
            return [$lats, $lngs];
        }
        $sortedLat = $lats;
        $sortedLng = $lngs;
        sort($sortedLat);
        sort($sortedLng);
        $median = static fn (array $a): float => $a[intdiv(count($a), 2)];
        $medLat = $median($sortedLat);
        $medLng = $median($sortedLng);

        // 各点到中位数中心的直线距离
        $dists = [];
        for ($i = 0; $i < $n; $i++) {
            $dists[$i] = $this->haversineM($lats[$i], $lngs[$i], $medLat, $medLng);
        }
        $sortedD = $dists;
        sort($sortedD);
        $medDist = $median($sortedD);

        // 阈值：中位距离的 6 倍，且绝对值 ≥ 40km（避免市内正常跨区被误删）
        $threshold = max($medDist * 6.0, 40000.0);

        $keepLats = [];
        $keepLngs = [];
        for ($i = 0; $i < $n; $i++) {
            if ($dists[$i] <= $threshold) {
                $keepLats[] = $lats[$i];
                $keepLngs[] = $lngs[$i];
            }
        }
        // 若过滤后不足 2 点（阈值意外过严），退回原始集合
        if (count($keepLats) < 2) {
            return [$lats, $lngs];
        }
        return [$keepLats, $keepLngs];
    }

    /** 无标注地理底图（指定 center+zoom，由前端叠加 canvas 编号点，2x 导出也清晰）*/
    private function buildBaseMap(array $vp): string
    {
        return $this->map->staticMap([], [], [
            'width' => 928,
            'height' => 720,
            'centerLat' => $vp['centerLat'],
            'centerLng' => $vp['centerLng'],
            'zoom' => $vp['zoom'],
        ]);
    }
}
