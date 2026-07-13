<?php

declare(strict_types=1);

namespace App\Service\Map;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * 高德 Web 服务实现。坐标系同为 GCJ-02，可与当前前端投影直接复用。
 */
final class AmapMapProvider implements MapProvider
{
    private const string INPUT_TIPS_URL = 'https://restapi.amap.com/v3/assistant/inputtips';
    private const string GEOCODE_URL = 'https://restapi.amap.com/v3/geocode/geo';
    private const string REGEOCODE_URL = 'https://restapi.amap.com/v3/geocode/regeo';
    private const string STATIC_MAP_URL = 'https://restapi.amap.com/v3/staticmap';
    private const string WALKING_URL = 'https://restapi.amap.com/v3/direction/walking';
    private const string DRIVING_URL = 'https://restapi.amap.com/v3/direction/driving';
    private const string BICYCLING_URL = 'https://restapi.amap.com/v4/direction/bicycling';
    private const string TRANSIT_URL = 'https://restapi.amap.com/v3/direction/transit/integrated';

    /** @var array<string, bool> */
    private static array $staticMapAvailability = [];

    private readonly Client $client;

    /**
     * 创建 HTTP 客户端；地图请求统一通过原生 Guzzle 发出。
     */
    public function __construct()
    {
        $this->client = new Client();
    }

    /**
     * 地址解析：优先用 inputtips 拿多候选 POI，失败时退回 geocode。
     *
     * inputtips 更适合前端「地图搜索」交互；geocode 作为兜底，保证普通地址仍能解析。
     */
    public function geocode(string $query, string $region = ''): array
    {
        $key = $this->key();
        $timeout = $this->timeout();
        $candidates = [];

        try {
            $tipsParams = [
                'keywords' => $query,
                'key' => $key,
            ];
            // city + citylimit=true：把输入提示硬约束在目的地城市，避免同名 POI 命中外地
            if ($region !== '') {
                $tipsParams['city'] = $region;
                $tipsParams['citylimit'] = 'true';
            }
            $response = $this->client->get(self::INPUT_TIPS_URL, [
                'query' => $tipsParams,
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德输入提示返回错误');
            foreach (($body['tips'] ?? []) as $tip) {
                if (! is_array($tip)) {
                    continue;
                }
                $location = is_string($tip['location'] ?? null) ? trim($tip['location']) : '';
                if ($location === '' || $location === '[]') {
                    continue;
                }
                $parts = array_map('trim', explode(',', $location));
                if (count($parts) !== 2 || ! is_numeric($parts[0]) || ! is_numeric($parts[1])) {
                    continue;
                }
                $district = is_string($tip['district'] ?? null) ? $tip['district'] : '';
                $candidates[] = [
                    'name' => is_string($tip['name'] ?? null) ? $tip['name'] : $query,
                    'title' => is_string($tip['name'] ?? null) ? $tip['name'] : $query,
                    'address' => is_string($tip['address'] ?? null) ? $tip['address'] : '',
                    'lng' => (float) $parts[0],
                    'lat' => (float) $parts[1],
                    'province' => '',
                    'city' => $district,
                    'adcode' => isset($tip['adcode']) ? (string) $tip['adcode'] : '',
                ];
            }
        } catch (Throwable $e) {
            // 输入提示失败后再尝试地理编码，避免偶发接口问题直接让整条路线无坐标。
        }

        if ($candidates !== []) {
            return $candidates;
        }

        try {
            $geoParams = [
                'address' => $query,
                'key' => $key,
            ];
            if ($region !== '') {
                $geoParams['city'] = $region;
            }
            $response = $this->client->get(self::GEOCODE_URL, [
                'query' => $geoParams,
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德地理编码返回错误');
        } catch (Throwable $e) {
            throw new RuntimeException('高德地理编码请求失败: ' . $e->getMessage(), 0, $e);
        }

        foreach (($body['geocodes'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $location = is_string($item['location'] ?? null) ? trim($item['location']) : '';
            $parts = array_map('trim', explode(',', $location));
            if (count($parts) !== 2 || ! is_numeric($parts[0]) || ! is_numeric($parts[1])) {
                continue;
            }
            $city = $item['city'] ?? '';
            if (is_array($city)) {
                $city = '';
            }
            $candidates[] = [
                'name' => is_string($item['formatted_address'] ?? null) ? $item['formatted_address'] : $query,
                'title' => is_string($item['formatted_address'] ?? null) ? $item['formatted_address'] : $query,
                'address' => is_string($item['formatted_address'] ?? null) ? $item['formatted_address'] : '',
                'lng' => (float) $parts[0],
                'lat' => (float) $parts[1],
                'province' => is_string($item['province'] ?? null) ? $item['province'] : '',
                'city' => is_string($city) ? $city : '',
                'adcode' => isset($item['adcode']) ? (string) $item['adcode'] : '',
            ];
        }

        return $candidates;
    }

    /**
     * 反向地理编码：把当前位置坐标转成可展示地址和城市/adcode。
     */
    public function reverseGeocode(array $center): array
    {
        $key = $this->key();
        try {
            $response = $this->client->get(self::REGEOCODE_URL, [
                'query' => [
                    'location' => $center['lng'] . ',' . $center['lat'],
                    'key' => $key,
                    'extensions' => 'base',
                ],
                'timeout' => $this->timeout(),
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德逆地理编码返回错误');
        } catch (Throwable $e) {
            throw new RuntimeException('高德逆地理编码请求失败: ' . $e->getMessage(), 0, $e);
        }

        $regeo = is_array($body['regeocode'] ?? null) ? $body['regeocode'] : [];
        $component = is_array($regeo['addressComponent'] ?? null) ? $regeo['addressComponent'] : [];
        $city = $component['city'] ?? '';
        if (is_array($city)) {
            $city = '';
        }

        return [
            'address' => is_string($regeo['formatted_address'] ?? null) ? $regeo['formatted_address'] : '',
            'province' => is_string($component['province'] ?? null) ? $component['province'] : '',
            'city' => is_string($city) ? $city : '',
            'adcode' => isset($component['adcode']) ? (string) $component['adcode'] : '',
        ];
    }

    /**
     * 生成高德静态图 URL。
     *
     * 支持两类场景：传 markers/paths 画服务商栅格标记，或传 center/zoom 生成无标注底图给前端叠加。
     * 高德静态图 key 若不可用，会按配置尝试腾讯静态图兜底。
     */
    public function staticMap(array $markers, array $paths, array $size): string
    {
        $key = $this->key();
        $w = min(1024, max(100, (int) ($size['width'] ?? 600)));
        $h = min(1024, max(100, (int) ($size['height'] ?? 300)));

        $params = [
            'key' => $key,
            'size' => $w . '*' . $h,
        ];
        if (isset($size['centerLat'], $size['centerLng'])) {
            $params['location'] = $size['centerLng'] . ',' . $size['centerLat'];
        }
        if (isset($size['zoom'])) {
            $params['zoom'] = (string) $size['zoom'];
        }

        $markerGroups = [];
        foreach ($markers as $m) {
            $lat = $m['lat'] ?? null;
            $lng = $m['lng'] ?? null;
            if ($lat === null || $lng === null) {
                continue;
            }
            $color = '0x' . strtoupper(ltrim((string) ($m['color'] ?? 'C8956C'), '#'));
            $label = trim((string) ($m['label'] ?? ''));
            $sizeName = $this->amapMarkerSize((string) ($m['size'] ?? 'mid'));
            $markerGroups[] = $sizeName . ',' . $color . ',' . $label . ':' . $lng . ',' . $lat;
        }
        if ($markerGroups !== []) {
            $params['markers'] = implode('|', $markerGroups);
        }

        $pathGroups = [];
        foreach ($paths as $polyline) {
            if (isset($polyline['points']) && is_array($polyline['points'])) {
                $raw = $polyline['points'];
                $color = strtoupper(ltrim((string) ($polyline['color'] ?? 'C8A98A'), '#'));
            } else {
                $raw = $polyline;
                $color = 'C8A98A';
            }
            $pts = [];
            foreach ($raw as $p) {
                if (($p['lat'] ?? null) !== null && ($p['lng'] ?? null) !== null) {
                    $pts[] = $p['lng'] . ',' . $p['lat'];
                }
            }
            if (count($pts) >= 2) {
                $pathGroups[] = '4,0x' . $color . ',0.85,,:' . implode(';', $pts);
            }
        }
        if ($pathGroups !== []) {
            $params['paths'] = implode('|', $pathGroups);
        }

        $url = self::STATIC_MAP_URL . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        if ($this->staticMapAvailable($key)) {
            return $url;
        }

        $fallback = $this->fallbackStaticMap($markers, $paths, $size);
        return $fallback !== '' ? $fallback : $url;
    }

    /**
     * 两点路线规划入口。
     *
     * 高德骑行走 v4 bicycling，其它步行/驾车走 v3 direction，统一返回 MapProvider 的距离/时长结构。
     */
    public function directions(array $from, array $to, string $mode = 'walking'): array
    {
        return $mode === 'cycling'
            ? $this->bicycling($from, $to)
            : $this->v3Direction($from, $to, $mode);
    }

    /**
     * 公交/地铁换乘规划。
     *
     * 高德 transit 接口需要城市上下文；调用方优先传 geocode 得到的 city/adcode，配置项只做兜底。
     */
    public function transit(array $from, array $to, ?string $city = null): array
    {
        $key = $this->key();
        $timeout = max($this->timeout(), 8);
        $cityParam = $city !== null && trim($city) !== '' ? trim($city) : (getenv('AMAP_TRANSIT_CITY') ?: '');
        if ($cityParam === '') {
            throw new RuntimeException('高德公交规划需要 city，可配置 AMAP_TRANSIT_CITY 或从地点解析城市');
        }

        try {
            $response = $this->client->get(self::TRANSIT_URL, [
                'query' => [
                    'origin' => $from['lng'] . ',' . $from['lat'],
                    'destination' => $to['lng'] . ',' . $to['lat'],
                    'city' => $cityParam,
                    'strategy' => 0,
                    'key' => $key,
                ],
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德公交规划返回错误');
        } catch (Throwable $e) {
            throw new RuntimeException('高德公交规划请求失败: ' . $e->getMessage(), 0, $e);
        }

        $transits = $body['route']['transits'] ?? [];
        $route = $this->pickBestTransit(is_array($transits) ? $transits : []);
        if (! is_array($route)) {
            throw new RuntimeException('高德公交规划无结果');
        }

        $segments = is_array($route['segments'] ?? null) ? $route['segments'] : [];
        $lines = [];
        $walkingM = 0;
        foreach ($segments as $segment) {
            if (! is_array($segment)) {
                continue;
            }
            $walking = $segment['walking'] ?? null;
            if (is_array($walking)) {
                $walkingM += (int) ($walking['distance'] ?? 0);
            }
            $bus = $segment['bus'] ?? null;
            if (! is_array($bus)) {
                continue;
            }
            foreach (($bus['buslines'] ?? []) as $line) {
                if (! is_array($line)) {
                    continue;
                }
                $title = $this->stringField($line, ['name']);
                if ($title === '') {
                    continue;
                }
                $lines[] = array_filter([
                    'vehicle' => $this->isMetroLine($title) ? 'SUBWAY' : 'BUS',
                    'title' => $title,
                    'geton' => $this->busStopName($line['departure_stop'] ?? null),
                    'getoff' => $this->busStopName($line['arrival_stop'] ?? null),
                    'stationCount' => (int) ($line['via_num'] ?? 0),
                    'distanceM' => (int) ($line['distance'] ?? 0),
                    'durationMin' => (int) ceil(((int) ($line['duration'] ?? 0)) / 60),
                    'price' => isset($line['price']) ? (float) $line['price'] : null,
                ], static fn($value) => $value !== null && $value !== '');
            }
        }

        if ($lines === []) {
            throw new RuntimeException('高德公交规划无有效线路');
        }

        return [
            'distanceM' => (int) ($route['distance'] ?? 0),
            'durationMin' => (int) ceil(((int) ($route['duration'] ?? 0)) / 60),
            'walkingM' => $walkingM,
            'transferCount' => max(0, count($lines) - 1),
            'summary' => implode(' → ', array_map(static fn($line) => $line['title'], $lines)),
            'lines' => $lines,
        ];
    }

    /**
     * 周边搜索，用于后续探索附近餐厅/景点等扩展能力。
     */
    public function explore(array $center, int $radius, string $keyword): array
    {
        $key = $this->key();
        $timeout = max($this->timeout(), 8);

        try {
            $response = $this->client->get('https://restapi.amap.com/v3/place/around', [
                'query' => [
                    'location' => $center['lng'] . ',' . $center['lat'],
                    'keywords' => $keyword,
                    'radius' => $radius,
                    'offset' => 25,
                    'sortrule' => 'distance',
                    'key' => $key,
                ],
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德周边搜索返回错误');
        } catch (Throwable $e) {
            $fallback = $this->fallbackExplore($center, $radius, $keyword);
            if ($fallback !== []) {
                return $fallback;
            }
            throw new RuntimeException('高德周边搜索请求失败: ' . $e->getMessage(), 0, $e);
        }

        $out = [];
        foreach (($body['pois'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $location = is_string($item['location'] ?? null) ? trim($item['location']) : '';
            $parts = array_map('trim', explode(',', $location));
            if (count($parts) !== 2 || ! is_numeric($parts[0]) || ! is_numeric($parts[1])) {
                continue;
            }
            $out[] = [
                'name' => is_string($item['name'] ?? null) ? $item['name'] : '',
                'address' => is_string($item['address'] ?? null) ? $item['address'] : '',
                'distanceM' => (int) ($item['distance'] ?? 0),
                'lat' => (float) $parts[1],
                'lng' => (float) $parts[0],
                'category' => is_string($item['type'] ?? null) ? $item['type'] : '',
                'typecode' => is_string($item['typecode'] ?? null) ? $item['typecode'] : '',
            ];
        }
        return $out;
    }

    /**
     * 高德周边搜索不可用时，用腾讯周边搜索兜底。
     *
     * 常见场景：高德 key 绑定了 IP 白名单，后端出口 IP 未放行，会返回 INVALID_USER_IP。
     *
     * @return array<int, array{name: string, address: string, distanceM: int, lat: float, lng: float, category?: string, typecode?: string}>
     */
    private function fallbackExplore(array $center, int $radius, string $keyword): array
    {
        if ((getenv('TENCENT_MAP_KEY') ?: '') === '') {
            return [];
        }

        try {
            return new TencentMapProvider()->explore($center, $radius, $keyword);
        } catch (Throwable $e) {
            error_log('[AmapMapProvider] 腾讯周边搜索兜底失败: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * 调用高德 v3 步行/驾车路线接口，并转换为统一距离、分钟和 polyline。
     */
    private function v3Direction(array $from, array $to, string $mode): array
    {
        $endpoint = match ($mode) {
            'walking' => self::WALKING_URL,
            'driving' => self::DRIVING_URL,
            default => throw new RuntimeException("高德不支持的路线模式: {$mode}"),
        };
        $key = $this->key();
        $timeout = max($this->timeout(), 8);

        try {
            $response = $this->client->get($endpoint, [
                'query' => [
                    'origin' => $from['lng'] . ',' . $from['lat'],
                    'destination' => $to['lng'] . ',' . $to['lat'],
                    'key' => $key,
                ],
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertOk($body, '高德路线规划返回错误');
        } catch (Throwable $e) {
            throw new RuntimeException('高德路线规划请求失败: ' . $e->getMessage(), 0, $e);
        }

        $path = $body['route']['paths'][0] ?? null;
        if (! is_array($path)) {
            throw new RuntimeException('高德路线规划无结果');
        }

        return [
            'distanceM' => (int) ($path['distance'] ?? 0),
            'durationMin' => (int) ceil(((int) ($path['duration'] ?? 0)) / 60),
            'polyline' => $this->pathPolyline($path['steps'] ?? []),
        ];
    }

    /**
     * 调用高德 v4 骑行路线接口；返回结构与 v3Direction 对齐。
     */
    private function bicycling(array $from, array $to): array
    {
        $key = $this->key();
        $timeout = max($this->timeout(), 8);

        try {
            $response = $this->client->get(self::BICYCLING_URL, [
                'query' => [
                    'origin' => $from['lng'] . ',' . $from['lat'],
                    'destination' => $to['lng'] . ',' . $to['lat'],
                    'key' => $key,
                ],
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            if ((int) ($body['errcode'] ?? 0) !== 0) {
                throw new RuntimeException((string) ($body['errmsg'] ?? '骑行路线返回错误'));
            }
        } catch (Throwable $e) {
            throw new RuntimeException('高德骑行路线请求失败: ' . $e->getMessage(), 0, $e);
        }

        $path = $body['data']['paths'][0] ?? null;
        if (! is_array($path)) {
            throw new RuntimeException('高德骑行路线无结果');
        }

        return [
            'distanceM' => (int) ($path['distance'] ?? 0),
            'durationMin' => (int) ceil(((int) ($path['duration'] ?? 0)) / 60),
            'polyline' => $this->pathPolyline($path['steps'] ?? []),
        ];
    }

    /**
     * 将高德步骤 polyline 字符串拆成历史兼容的 [lng, lat, lng, lat...] 浮点数组。
     *
     * @param array<int, mixed> $steps
     * @return array<int, float>
     */
    private function pathPolyline(array $steps): array
    {
        $out = [];
        foreach ($steps as $step) {
            if (! is_array($step)) {
                continue;
            }
            $polyline = is_string($step['polyline'] ?? null) ? $step['polyline'] : '';
            foreach (explode(';', $polyline) as $pair) {
                $parts = array_map('trim', explode(',', $pair));
                if (count($parts) === 2 && is_numeric($parts[0]) && is_numeric($parts[1])) {
                    // MapProvider 历史上只透传 polyline；保持 float 列表，顺序为 lng,lat。
                    $out[] = (float) $parts[0];
                    $out[] = (float) $parts[1];
                }
            }
        }
        return $out;
    }

    /**
     * 从多条公交方案里选出综合体验最好的一条。
     *
     * 评分偏向耗时短、步行少、换乘少，并给地铁方案一定奖励，贴近用户对稳定性的期待。
     *
     * @param array<int, mixed> $routes
     */
    private function pickBestTransit(array $routes): ?array
    {
        $best = null;
        $bestScore = PHP_FLOAT_MAX;
        foreach ($routes as $route) {
            if (! is_array($route)) {
                continue;
            }
            $durationMin = (int) ceil(((int) ($route['duration'] ?? 0)) / 60);
            if ($durationMin <= 0) {
                continue;
            }
            $walkingM = 0;
            $lineCount = 0;
            $hasMetro = false;
            foreach (($route['segments'] ?? []) as $segment) {
                if (! is_array($segment)) {
                    continue;
                }
                if (is_array($segment['walking'] ?? null)) {
                    $walkingM += (int) ($segment['walking']['distance'] ?? 0);
                }
                $bus = is_array($segment['bus'] ?? null) ? $segment['bus'] : [];
                foreach (($bus['buslines'] ?? []) as $line) {
                    if (! is_array($line)) {
                        continue;
                    }
                    $lineCount++;
                    $title = $this->stringField($line, ['name']);
                    if ($this->isMetroLine($title)) {
                        $hasMetro = true;
                    }
                }
            }
            if ($lineCount === 0) {
                continue;
            }
            $score = $durationMin + $walkingM / 90.0 + max(0, $lineCount - 1) * 6.0;
            if ($hasMetro) {
                $score -= 8.0;
            }
            if ($score < $bestScore) {
                $bestScore = $score;
                $best = $route;
            }
        }
        return $best;
    }

    /**
     * 将应用内部 marker size 映射为高德 staticmap 支持的尺寸枚举。
     */
    private function amapMarkerSize(string $size): string
    {
        return match ($size) {
            'tiny', 'small' => 'small',
            'large', 'normal' => 'large',
            default => 'mid',
        };
    }

    /**
     * 读取高德 Web 服务 key，兼容 AMAP/GAODE 多组环境变量命名。
     */
    private function key(): string
    {
        $key = getenv('AMAP_WEB_SERVICE_KEY')
            ?: getenv('GAODE_WEB_SERVICE_KEY')
            ?: getenv('AMAP_REST_KEY')
            ?: getenv('GAODE_REST_KEY')
            ?: getenv('AMAP_MAP_KEY')
            ?: getenv('GAODE_MAP_KEY')
            ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 AMAP_WEB_SERVICE_KEY/AMAP_MAP_KEY');
        }
        return $key;
    }

    /**
     * 统一读取地图服务超时时间，默认 5 秒。
     */
    private function timeout(): int
    {
        return (int) (getenv('MAP_TIMEOUT') ?: 5);
    }

    /**
     * 校验高德 v3 风格响应 status；失败时带上接口上下文。
     */
    private function assertOk(array $body, string $prefix): void
    {
        if ((string) ($body['status'] ?? '0') === '1') {
            return;
        }
        $message = is_string($body['info'] ?? null) ? $body['info'] : (string) ($body['errmsg'] ?? 'status=' . ($body['status'] ?? 'unknown'));
        throw new RuntimeException($prefix . ': ' . $message);
    }

    /**
     * 探测高德静态图 key 是否真的能返回图片，并按 key 缓存结果。
     *
     * 一些高德 key 只开了小程序或 Web 服务，staticmap 会返回 JSON 错误；提前探测可避免前端拿到坏图。
     */
    private function staticMapAvailable(string $key): bool
    {
        if ((string) (getenv('AMAP_STATIC_MAP_PROBE') ?: '1') === '0') {
            return true;
        }

        $cacheKey = hash('sha256', $key);
        if (array_key_exists($cacheKey, self::$staticMapAvailability)) {
            return self::$staticMapAvailability[$cacheKey];
        }

        $url = self::STATIC_MAP_URL . '?' . http_build_query([
            'key' => $key,
            'size' => '100*100',
            'location' => '116.3975,39.9087',
            'zoom' => '12',
        ], '', '&', PHP_QUERY_RFC3986);

        try {
            $response = $this->client->get($url, [
                'timeout' => min(3, max(1, $this->timeout())),
                'http_errors' => false,
            ]);
            $contentType = strtolower($response->getHeaderLine('Content-Type'));
            $ok = $response->getStatusCode() >= 200
                && $response->getStatusCode() < 300
                && str_starts_with($contentType, 'image/');
            if (! $ok) {
                $message = $this->amapErrorMessage((string) $response->getBody());
                error_log('[AmapMapProvider] 高德静态图不可用，已尝试兜底: ' . $message);
            }
        } catch (Throwable $e) {
            $ok = false;
            error_log('[AmapMapProvider] 高德静态图探测失败，已尝试兜底: ' . $e->getMessage());
        }

        self::$staticMapAvailability[$cacheKey] = $ok;
        return $ok;
    }

    /**
     * 高德静态图不可用时，用腾讯静态图生成同等底图/标记图。
     */
    private function fallbackStaticMap(array $markers, array $paths, array $size): string
    {
        $fallback = strtolower((string) (getenv('AMAP_STATIC_MAP_FALLBACK') ?: 'tencent'));
        if ($fallback !== 'tencent' || (getenv('TENCENT_MAP_KEY') ?: '') === '') {
            return '';
        }

        try {
            return new TencentMapProvider()->staticMap($markers, $paths, $size);
        } catch (Throwable $e) {
            error_log('[AmapMapProvider] 腾讯静态图兜底失败: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * 从高德 staticmap 的 JSON 错误体中提取可读错误信息。
     */
    private function amapErrorMessage(string $body): string
    {
        try {
            $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
            if (is_array($decoded)) {
                $info = is_string($decoded['info'] ?? null) ? $decoded['info'] : '';
                $infocode = is_string($decoded['infocode'] ?? null) ? $decoded['infocode'] : '';
                if ($info !== '' || $infocode !== '') {
                    return trim($info . ($infocode !== '' ? " ({$infocode})" : ''));
                }
            }
        } catch (Throwable) {
            // ignore non-json responses
        }

        return '返回内容不是图片';
    }

    /**
     * 从多个候选字段里安全取第一个非空字符串，兼容高德不同接口字段差异。
     *
     * @param array<int, string> $keys
     */
    private function stringField(array $source, array $keys): string
    {
        foreach ($keys as $key) {
            if (is_string($source[$key] ?? null) && trim((string) $source[$key]) !== '') {
                return trim((string) $source[$key]);
            }
        }
        return '';
    }

    /**
     * 安全读取高德公交站点名；缺字段时返回空串。
     */
    private function busStopName(mixed $station): string
    {
        if (! is_array($station)) {
            return '';
        }
        return $this->stringField($station, ['name']);
    }

    /**
     * 通过线路名判断是否为地铁/轨道交通，用于前端显示地铁优先的图标和文案。
     */
    private function isMetroLine(string $title): bool
    {
        return preg_match('/地铁|轨道|轻轨|subway|metro/i', $title) === 1;
    }
}
