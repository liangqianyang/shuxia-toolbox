<?php

declare(strict_types=1);

namespace App\Service\Map;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * 腾讯位置服务实现。地理编码：https://lbs.qq.com/service/webService/webServiceGuide/webServiceGeocoder
 */
final class TencentMapProvider implements MapProvider
{
    // 腾讯地点联想 suggestion（该 key 开通了 suggestion、未开通 geocoder；且 suggestion 更贴合
    // 「搜索→候选列表」场景，返回多个含坐标的候选）。HTTP（Swoole 无 openssl）+ StreamHandler（curl 钩子不完整）。
    private const string GEOCODE_URL = 'http://apis.map.qq.com/ws/place/v1/suggestion';
    private const string REGEOCODE_URL = 'https://apis.map.qq.com/ws/geocoder/v1/';

    private readonly Client $client;

    /**
     * 创建 HTTP 客户端；禁用 Swoole curl hook 后走系统 libcurl，HTTPS 行为更稳定。
     */
    public function __construct()
    {
        // bin/hyperf.php 已禁用 SWOOLE_HOOK_CURL，Guzzle 默认 CurlHandler 走原生 PHP curl 扩展
        //（= 系统 libcurl，含 openssl），与 shell curl 行为一致，避开 Swoole curl 钩子的 option 不兼容。
        $this->client = new Client();
    }

    /**
     * 腾讯 SK 签名（SN 校验）：sn = MD5(urlencode(path + 排序参数 + sk))。
     * path 为请求路径（如 /ws/place/v1/suggestion）；参数按 key 字典序、原始值（未 urlencode）拼接。
     * 未配 TENCENT_MAP_SK 时返回空串（不加 sig，回退无签名——仅 key 未开 SN 校验时可用）。
     */
    private function sign(string $path, array $params): string
    {
        $sk = getenv('TENCENT_MAP_SK') ?: '';
        if ($sk === '') {
            return '';
        }
        // 官方算法（lbs.qq.com WebServiceAPI GET 签名）：参数按名升序排序、原始值（不 urlencode）
        // 拼成 key=value&...，再 md5(path + '?' + 排序后原始参数串 + sk)，结果小写。无外层 urlencode。
        ksort($params);
        $pairs = [];
        foreach ($params as $k => $v) {
            $pairs[] = $k . '=' . $v;
        }
        return md5($path . '?' . implode('&', $pairs) . $sk);
    }

    /** Guzzle query 场景（参数名唯一）：算 sig 后并入参数数组。 */
    private function withSig(string $url, array $params): array
    {
        $sig = $this->sign((string) parse_url($url, PHP_URL_PATH), $params);
        if ($sig !== '') {
            $params['sig'] = $sig;
        }
        return $params;
    }

    /**
     * 地点搜索候选。
     *
     * 当前使用 suggestion 而非 geocoder，因为它更适合前端输入框候选列表，并且返回多个带坐标 POI。
     */
    public function geocode(string $query, string $region = ''): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        $timeout = (int) (getenv('MAP_TIMEOUT') ?: 5);

        // region + region_fix=1：把联想结果硬约束在目的地城市内，避免同名 POI 命中外地（坐标离群会撑大地图视口）
        $params = [
            'keyword' => $query,
            'key' => $key,
        ];
        if ($region !== '') {
            $params['region'] = $region;
            $params['region_fix'] = '1';
        }

        try {
            $response = $this->client->get(self::GEOCODE_URL, [
                'query' => $this->withSig(self::GEOCODE_URL, $params),
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('地图服务请求失败: ' . $e->getMessage(), 0, $e);
        }

        $status = $body['status'] ?? -1;
        if ($status !== 0) {
            $message = is_string($body['message'] ?? null) ? $body['message'] : "status={$status}";
            throw new RuntimeException('地图服务返回错误: ' . $message);
        }

        $candidates = [];
        // suggestion 返回 data 数组（geocoder 是 result）；省市区在顶层（geocoder 嵌在 ad_info）
        foreach (($body['data'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $location = $item['location'] ?? null;
            if (! is_array($location) || ! isset($location['lng'], $location['lat'])) {
                continue;
            }
            $title = is_string($item['title'] ?? null) ? $item['title'] : $query;
            $candidates[] = [
                'name' => $title,
                'title' => $title,
                'address' => is_string($item['address'] ?? null) ? $item['address'] : '',
                'lng' => (float) $location['lng'],
                'lat' => (float) $location['lat'],
                'province' => is_string($item['province'] ?? null) ? $item['province'] : '',
                'city' => is_string($item['city'] ?? null) ? $item['city'] : '',
                'adcode' => isset($item['adcode']) ? (string) $item['adcode'] : '',
            ];
        }

        return $candidates;
    }

    /**
     * 反向地理编码：把坐标转成地址/城市信息。
     */
    public function reverseGeocode(array $center): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        $params = [
            'location' => $center['lat'] . ',' . $center['lng'],
            'key' => $key,
        ];

        try {
            $response = $this->client->get(self::REGEOCODE_URL, [
                'query' => $this->withSig(self::REGEOCODE_URL, $params),
                'timeout' => (int) (getenv('MAP_TIMEOUT') ?: 5),
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('腾讯逆地理编码请求失败: ' . $e->getMessage(), 0, $e);
        }

        $status = $body['status'] ?? -1;
        if ($status !== 0) {
            $message = is_string($body['message'] ?? null) ? $body['message'] : "status={$status}";
            throw new RuntimeException('腾讯逆地理编码返回错误: ' . $message);
        }

        $result = is_array($body['result'] ?? null) ? $body['result'] : [];
        $adInfo = is_array($result['ad_info'] ?? null) ? $result['ad_info'] : [];

        return [
            'address' => is_string($result['address'] ?? null) ? $result['address'] : '',
            'province' => is_string($adInfo['province'] ?? null) ? $adInfo['province'] : '',
            'city' => is_string($adInfo['city'] ?? null) ? $adInfo['city'] : '',
            'adcode' => isset($adInfo['adcode']) ? (string) $adInfo['adcode'] : '',
        ];
    }

    /**
     * 生成腾讯静态图 URL。
     *
     * 支持 marker/path 栅格图，也支持 center/zoom 无标注底图；多同名参数用列表保存，避免 PHP 数组覆盖。
     */
    public function staticMap(array $markers, array $paths, array $size): string
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            return '';
        }
        $sk = getenv('TENCENT_MAP_SK') ?: '';

        $w = min(928, max(100, (int) ($size['width'] ?? 600)));
        $h = min(928, max(100, (int) ($size['height'] ?? 300)));

        // 收集参数为 [key, rawValue] 列表：markers/path 可多个同名，关联数组会覆盖，故用列表。
        // base：size + key；若调用方提供 center+zoom（无标注底图场景）则带上，否则留空让腾讯按 markers/path 自动适配。
        $params = [];
        $params[] = ['size', $w . '*' . $h];
        $params[] = ['key', $key];
        if (isset($size['centerLat'], $size['centerLng'])) {
            $params[] = ['center', $size['centerLat'] . ',' . $size['centerLng']];
        }
        if (isset($size['zoom'])) {
            $params[] = ['zoom', (string) $size['zoom']];
        }

        // 每站一个 marker 组（带类型色 + 序号 label）
        foreach ($markers as $m) {
            $lat = $m['lat'] ?? null;
            $lng = $m['lng'] ?? null;
            if ($lat === null || $lng === null) {
                continue;
            }
            $color = strtoupper(ltrim((string) ($m['color'] ?? 'C8956C'), '#'));
            $mSize = in_array($m['size'] ?? '', ['tiny', 'small', 'mid', 'normal', 'large'], true)
                ? $m['size']
                : 'large';
            $style = 'size:' . $mSize . '|color:0x' . $color;
            if (! empty($m['label'])) {
                // 腾讯 label 单字符（A-Z / 0-9）
                $style .= '|label:' . substr((string) $m['label'], 0, 1);
            }
            $params[] = ['markers', $style . '|' . $lat . ',' . $lng];
        }

        // 折线：多段（如按天）。每段可自带 color；兼容旧形态（纯点列表，默认米色）。
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
                    $pts[] = $p['lat'] . ',' . $p['lng'];
                }
            }
            if (count($pts) >= 2) {
                $params[] = ['path', 'color:0x' . $color . '|weight:4|' . implode('|', $pts)];
            }
        }

        // SK 签名（官方 GET 算法）：多同名参数按 key 升序、同 key 按 value 升序，原始值，md5(path+'?'+串+sk)，无 urlencode。
        if ($sk !== '') {
            $sorted = $params;
            usort($sorted, static fn($a, $b) => $a[0] <=> $b[0] ?: strcmp((string) $a[1], (string) $b[1]));
            $raw = implode('&', array_map(static fn($p) => $p[0] . '=' . $p[1], $sorted));
            $params[] = ['sig', md5('/ws/staticmap/v2/?' . $raw . $sk)];
        }

        // 拼 URL：每个值 rawurlencode
        return 'https://apis.map.qq.com/ws/staticmap/v2/?'
            . implode('&', array_map(static fn($p) => $p[0] . '=' . rawurlencode((string) $p[1]), $params));
    }

    /**
     * 两点路线规划。
     *
     * 步行/驾车/骑行接口返回结构相近，这里统一转换为 MapProvider 的 distanceM、durationMin、polyline。
     */
    public function directions(array $from, array $to, string $mode = 'walking'): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        // walking/driving 同形 from/to；cycling 走 bicycling 端点；transit 需 city、多方案，暂不支持
        $endpoints = [
            'walking' => 'http://apis.map.qq.com/ws/direction/v1/walking',
            'driving' => 'http://apis.map.qq.com/ws/direction/v1/driving',
            'cycling' => 'http://apis.map.qq.com/ws/direction/v1/bicycling',
        ];
        $endpoint = $endpoints[$mode] ?? null;
        if ($endpoint === null) {
            throw new RuntimeException("不支持的路线模式: {$mode}");
        }

        $timeout = max((int) (getenv('MAP_TIMEOUT') ?: 5), 8);

        try {
            $response = $this->client->get($endpoint, [
                'query' => $this->withSig($endpoint, [
                    // 腾讯 from/to 是「纬度,经度」（lat 在前）
                    'from' => $from['lat'] . ',' . $from['lng'],
                    'to' => $to['lat'] . ',' . $to['lng'],
                    'key' => $key,
                ]),
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('路线规划请求失败: ' . $e->getMessage(), 0, $e);
        }

        $status = $body['status'] ?? -1;
        if ($status !== 0) {
            $message = is_string($body['message'] ?? null) ? $body['message'] : "status={$status}";
            throw new RuntimeException('路线规划返回错误: ' . $message);
        }

        $route = $body['result']['routes'][0] ?? null;
        if ($route === null) {
            throw new RuntimeException('路线规划无结果');
        }

        $polyline = is_array($route['polyline'] ?? null) ? array_map('floatval', $route['polyline']) : [];

        return [
            'distanceM' => (int) ($route['distance'] ?? 0),
            'durationMin' => (int) ($route['duration'] ?? 0), // walking 实测为分钟
            'polyline' => $polyline,
        ];
    }

    /**
     * 公共交通规划。
     *
     * 腾讯 transit 不单独要求 city；服务端会从多方案里重新评分，避免默认第一条公交压过更合理的地铁方案。
     */
    public function transit(array $from, array $to, ?string $city = null): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        $timeout = max((int) (getenv('MAP_TIMEOUT') ?: 5), 8);

        try {
            $response = $this->client->get('http://apis.map.qq.com/ws/direction/v1/transit', [
                'query' => $this->withSig('http://apis.map.qq.com/ws/direction/v1/transit', [
                    'from' => $from['lat'] . ',' . $from['lng'],
                    'to' => $to['lat'] . ',' . $to['lng'],
                    'policy' => 'LEAST_TIME',
                    'key' => $key,
                ]),
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('公共交通规划请求失败: ' . $e->getMessage(), 0, $e);
        }

        $status = $body['status'] ?? -1;
        if ($status !== 0) {
            $message = is_string($body['message'] ?? null) ? $body['message'] : "status={$status}";
            throw new RuntimeException('公共交通规划返回错误: ' . $message);
        }

        $routes = $body['result']['routes'] ?? [];
        $route = $this->pickBestTransitRoute(is_array($routes) ? $routes : []);
        if (! is_array($route)) {
            throw new RuntimeException('公共交通规划无结果');
        }

        $lines = [];
        $walkingM = 0;
        foreach ($this->flattenTransitSteps($route['steps'] ?? []) as $step) {
            $mode = strtoupper((string) ($step['mode'] ?? ''));
            if ($mode === 'WALKING' || $mode === 'WALK') {
                $walkingM += (int) ($step['distance'] ?? 0);
            }
            foreach (($step['lines'] ?? []) as $line) {
                if (! is_array($line)) {
                    continue;
                }
                $title = $this->stringField($line, ['title', 'name', 'line_name']);
                if ($title === '') {
                    continue;
                }
                $lines[] = array_filter([
                    'vehicle' => strtoupper($this->stringField($line, ['vehicle', 'type', 'mode']) ?: $mode ?: 'TRANSIT'),
                    'title' => $title,
                    'geton' => $this->stationName($line['geton'] ?? null),
                    'getoff' => $this->stationName($line['getoff'] ?? null),
                    'stationCount' => (int) ($line['station_count'] ?? $line['stations'] ?? 0),
                    'distanceM' => (int) ($line['distance'] ?? 0),
                    'durationMin' => (int) ($line['duration'] ?? 0),
                    'price' => isset($line['price']) ? (float) $line['price'] : null,
                    'startTime' => $this->stringField($line, ['start_time', 'startTime']),
                    'endTime' => $this->stringField($line, ['end_time', 'endTime']),
                ], static fn($value) => $value !== null && $value !== '');
            }
        }

        if ($lines === []) {
            throw new RuntimeException('公共交通规划无有效线路');
        }

        $summary = implode(' → ', array_map(static fn($line) => $line['title'], $lines));

        return [
            'distanceM' => (int) ($route['distance'] ?? 0),
            'durationMin' => (int) ($route['duration'] ?? 0),
            'walkingM' => $walkingM,
            'transferCount' => max(0, count($lines) - 1),
            'summary' => $summary,
            'lines' => $lines,
        ];
    }

    /**
     * 腾讯 transit 会返回多方案。不能只拿第 1 条，否则容易出现“公交排第一，但地铁实际更合理”的体验。
     * 这里按总耗时、步行距离、换乘次数做轻量评分，并在耗时接近时优先地铁方案。
     *
     * @param array<int, mixed> $routes
     */
    private function pickBestTransitRoute(array $routes): ?array
    {
        $best = null;
        $bestScore = PHP_FLOAT_MAX;
        foreach ($routes as $route) {
            if (! is_array($route)) {
                continue;
            }
            $lines = [];
            $walkingM = 0;
            $hasMetro = false;
            foreach ($this->flattenTransitSteps($route['steps'] ?? []) as $step) {
                $mode = strtoupper((string) ($step['mode'] ?? ''));
                if ($mode === 'WALKING' || $mode === 'WALK') {
                    $walkingM += (int) ($step['distance'] ?? 0);
                }
                foreach (($step['lines'] ?? []) as $line) {
                    if (! is_array($line)) {
                        continue;
                    }
                    $title = $this->stringField($line, ['title', 'name', 'line_name']);
                    if ($title === '') {
                        continue;
                    }
                    $vehicle = strtoupper($this->stringField($line, ['vehicle', 'type', 'mode']) ?: $mode ?: 'TRANSIT');
                    $lines[] = ['title' => $title, 'vehicle' => $vehicle];
                    if ($this->isMetroLine($title, $vehicle)) {
                        $hasMetro = true;
                    }
                }
            }
            if ($lines === []) {
                continue;
            }
            $duration = (int) ($route['duration'] ?? 0);
            if ($duration <= 0) {
                continue;
            }
            $transferCount = max(0, count($lines) - 1);
            $score = $duration + $walkingM / 90.0 + $transferCount * 6.0;
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
     * 通过线路标题和 vehicle 字段判断是否为地铁/轨道交通。
     */
    private function isMetroLine(string $title, string $vehicle): bool
    {
        return preg_match('/地铁|轨道|轻轨|subway|metro/i', $title . ' ' . $vehicle) === 1;
    }

    /**
     * 腾讯 transit steps 在不同城市/方案里可能是一层或多层数组，这里统一摊平成 step 列表。
     *
     * @return array<int, array>
     */
    private function flattenTransitSteps(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }
        if (isset($raw['mode']) || isset($raw['lines'])) {
            return [$raw];
        }
        $out = [];
        foreach ($raw as $item) {
            foreach ($this->flattenTransitSteps($item) as $step) {
                $out[] = $step;
            }
        }
        return $out;
    }

    /**
     * 从多个候选字段里安全取第一个非空字符串，兼容腾讯不同接口字段差异。
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
     * 统一读取上下车站点名；腾讯有时给字符串，有时给对象。
     */
    private function stationName(mixed $station): string
    {
        if (is_string($station)) {
            return trim($station);
        }
        if (! is_array($station)) {
            return '';
        }
        return $this->stringField($station, ['title', 'name', 'station_name']);
    }

    /**
     * 周边搜索：中心点 radius 米内、匹配 keyword 的 POI。
     *
     * 走 place/v1/search（关键词搜索 + boundary=nearby）而非 place/v1/explore：该 key 下 explore
     * 不按 keyword 过滤（实测 keyword=火锅 / 烧烤 / category=美食 都返回同一批住宅小区），会把附近无关
     * POI 混进结果；search 才真正按关键词命中（keyword=火锅 全部返回 category=美食:火锅 的店家）。
     * 两个接口 data 元素结构一致（title/address/_distance/location），解析逻辑无需改动。
     */
    public function explore(array $center, int $radius, string $keyword): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }
        $timeout = max((int) (getenv('MAP_TIMEOUT') ?: 5), 8);

        $url = 'http://apis.map.qq.com/ws/place/v1/search';
        try {
            $response = $this->client->get($url, [
                'query' => $this->withSig($url, [
                    // boundary=nearby(纬度,经度,半径米)；auto_extend=0 关闭「半径内结果少时自动扩大范围」，
                    // 否则会返回远超请求半径的门店（随机场景会抽到很远的店）。
                    'boundary' => sprintf('nearby(%f,%f,%d,0)', $center['lat'], $center['lng'], $radius),
                    'keyword' => $keyword,
                    'page_size' => 20,
                    'orderby' => '_distance',
                    'key' => $key,
                ]),
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('周边搜索请求失败: ' . $e->getMessage(), 0, $e);
        }

        $status = $body['status'] ?? -1;
        if ($status !== 0) {
            $message = is_string($body['message'] ?? null) ? $body['message'] : "status={$status}";
            throw new RuntimeException('周边搜索返回错误: ' . $message);
        }

        $out = [];
        foreach (($body['data'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $loc = $item['location'] ?? null;
            if (! is_array($loc) || ! isset($loc['lng'], $loc['lat'])) {
                continue;
            }
            $out[] = [
                'name' => is_string($item['title'] ?? null) ? $item['title'] : '',
                'address' => is_string($item['address'] ?? null) ? $item['address'] : '',
                'distanceM' => (int) ($item['_distance'] ?? 0),
                'lat' => (float) $loc['lat'],
                'lng' => (float) $loc['lng'],
                'category' => is_string($item['category'] ?? null) ? $item['category'] : '',
                'typecode' => '',
            ];
        }

        return $out;
    }
}
