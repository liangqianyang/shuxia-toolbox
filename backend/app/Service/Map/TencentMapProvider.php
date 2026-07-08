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
    private const GEOCODE_URL = 'http://apis.map.qq.com/ws/place/v1/suggestion';

    private readonly Client $client;

    public function __construct()
    {
        // bin/hyperf.php 已禁用 SWOOLE_HOOK_CURL，Guzzle 默认 CurlHandler 走原生 PHP curl 扩展
        //（= 系统 libcurl，含 openssl），与 shell curl 行为一致，避开 Swoole curl 钩子的 option 不兼容。
        $this->client = new Client();
    }

    public function geocode(string $query): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        $timeout = (int) (getenv('MAP_TIMEOUT') ?: 5);

        try {
            $response = $this->client->get(self::GEOCODE_URL, [
                'query' => [
                    'keyword' => $query,
                    'key' => $key,
                ],
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
                'lng' => (float) $location['lng'],
                'lat' => (float) $location['lat'],
                'province' => is_string($item['province'] ?? null) ? $item['province'] : '',
                'city' => is_string($item['city'] ?? null) ? $item['city'] : '',
                'adcode' => isset($item['adcode']) ? (string) $item['adcode'] : '',
            ];
        }

        return $candidates;
    }

    public function staticMap(array $markers, array $paths, array $size): string
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            return '';
        }

        $w = min(928, max(100, (int) ($size['width'] ?? 600)));
        $h = min(928, max(100, (int) ($size['height'] ?? 300)));

        // base 参数：size + key；若调用方提供 center+zoom（无标注底图场景）则带上，
        // 否则留空让腾讯按 markers/path 自动适配范围。
        $base = [
            'size' => $w . '*' . $h,
            'key' => $key,
        ];
        if (isset($size['centerLat'], $size['centerLng'])) {
            $base['center'] = $size['centerLat'] . ',' . $size['centerLng'];
        }
        if (isset($size['zoom'])) {
            $base['zoom'] = $size['zoom'];
        }
        $url = 'https://apis.map.qq.com/ws/staticmap/v2/?' . http_build_query($base);

        // 每站一个 marker 组（带类型色 + 序号 label），逐个 rawurlencode 拼到 URL
        foreach ($markers as $m) {
            $lat = $m['lat'] ?? null;
            $lng = $m['lng'] ?? null;
            if ($lat === null || $lng === null) {
                continue;
            }
            $color = strtoupper(ltrim((string) ($m['color'] ?? 'C8956C'), '#'));
            $size = in_array($m['size'] ?? '', ['tiny', 'small', 'mid', 'normal', 'large'], true)
                ? $m['size']
                : 'large';
            $style = 'size:' . $size . '|color:0x' . $color;
            if (! empty($m['label'])) {
                // 腾讯 label 单字符（A-Z / 0-9）
                $style .= '|label:' . substr((string) $m['label'], 0, 1);
            }
            $url .= '&markers=' . rawurlencode($style . '|' . $lat . ',' . $lng);
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
                $url .= '&path=' . rawurlencode('color:0x' . $color . '|weight:4|' . implode('|', $pts));
            }
        }

        return $url;
    }

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
                'query' => [
                    // 腾讯 from/to 是「纬度,经度」（lat 在前）
                    'from' => $from['lat'] . ',' . $from['lng'],
                    'to' => $to['lat'] . ',' . $to['lng'],
                    'key' => $key,
                ],
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

    public function transit(array $from, array $to): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }

        $timeout = max((int) (getenv('MAP_TIMEOUT') ?: 5), 8);

        try {
            $response = $this->client->get('http://apis.map.qq.com/ws/direction/v1/transit', [
                'query' => [
                    'from' => $from['lat'] . ',' . $from['lng'],
                    'to' => $to['lat'] . ',' . $to['lng'],
                    'policy' => 'LEAST_TIME',
                    'key' => $key,
                ],
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

        $route = $body['result']['routes'][0] ?? null;
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
                ], static fn ($value) => $value !== null && $value !== '');
            }
        }

        if ($lines === []) {
            throw new RuntimeException('公共交通规划无有效线路');
        }

        $summary = implode(' → ', array_map(static fn ($line) => $line['title'], $lines));

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

    public function explore(array $center, int $radius, string $keyword): array
    {
        $key = getenv('TENCENT_MAP_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('地图服务未配置 TENCENT_MAP_KEY');
        }
        $timeout = max((int) (getenv('MAP_TIMEOUT') ?: 5), 8);

        try {
            $response = $this->client->get('http://apis.map.qq.com/ws/place/v1/explore', [
                'query' => [
                    // boundary=nearby(纬度,经度,半径米)
                    'boundary' => sprintf('nearby(%f,%f,%d)', $center['lat'], $center['lng'], $radius),
                    'keyword' => $keyword,
                    'page_size' => 10,
                    'orderby' => '_distance',
                    'key' => $key,
                ],
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
            ];
        }

        return $out;
    }
}
