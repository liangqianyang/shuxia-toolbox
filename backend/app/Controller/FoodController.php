<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\FoodUserDataService;
use App\Service\FoodRoomService;
use App\Service\Map\MapProvider;
use App\Service\Map\TencentMapProvider;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use RuntimeException;
use Throwable;

/**
 * 吃饭决策器接口：当前只提供附近美食候选，随机决策由前端完成。
 */
final class FoodController extends AbstractController
{
    public function __construct(
        private readonly MapProvider $map,
        private readonly FoodRoomService $rooms,
        private readonly FoodUserDataService $foodData,
        private readonly WechatUserService $users,
    ) {}

    /**
     * 根据中心点搜索附近美食/餐厅候选。
     *
     * 高德与腾讯都通过 MapProvider::explore 适配，前端只需要传 lat/lng/radius/keyword。
     */
    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function nearby(RequestInterface $request): array
    {
        $lat = (float) $request->input('lat', 0);
        $lng = (float) $request->input('lng', 0);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat === 0.0 && $lng === 0.0)) {
            throw new BizException(422, '中心点坐标不合法');
        }

        // 产品上最多支持 20km；太小容易搜不到，太大又会偏离“附近吃饭”的场景。
        $radius = max(100, min(20000, (int) $request->input('radius', 1000)));
        $keyword = trim((string) $request->input('keyword', '美食'));
        if ($keyword === '') {
            $keyword = '美食';
        }

        try {
            $items = $this->exploreMerged(['lat' => $lat, 'lng' => $lng], $radius, $keyword);
        } catch (Throwable $e) {
            throw new BizException(500, '附近美食搜索失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok([
            'items' => array_map(static function (array $item): array {
                $name = (string) ($item['name'] ?? '');
                $address = (string) ($item['address'] ?? '');

                return [
                    'id' => hash('crc32b', $name . '|' . $address . '|' . ($item['lat'] ?? '') . ',' . ($item['lng'] ?? '')),
                    'name' => $name,
                    'address' => $address,
                    'distanceM' => (int) ($item['distanceM'] ?? 0),
                    'lat' => (float) ($item['lat'] ?? 0),
                    'lng' => (float) ($item['lng'] ?? 0),
                    'category' => (string) ($item['category'] ?? ''),
                    'typecode' => (string) ($item['typecode'] ?? ''),
                ];
            }, $items),
        ]);
    }

    /**
     * 饭池录入店名搜索：优先按当前位置做周边 POI，再用地图联想兜底。
     *
     * 这个接口避免前端一次输入打多个地图代理接口，也能保证候选按“离我近”优先。
     */
    #[RateLimit(create: 4, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function searchShops(RequestInterface $request): array
    {
        $q = trim((string) $request->input('q', ''));
        if ($q === '') {
            throw new BizException(422, '查询店名不能为空');
        }

        $region = trim((string) $request->input('region', ''));
        $lat = (float) $request->input('lat', 0);
        $lng = (float) $request->input('lng', 0);
        $hasCenter = $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180 && ! ($lat === 0.0 && $lng === 0.0);
        $radius = max(1000, min(20000, (int) $request->input('radius', 5000)));
        $center = $hasCenter ? ['lat' => $lat, 'lng' => $lng] : null;

        $candidates = [];
        $errors = [];

        if ($hasCenter) {
            try {
                foreach ($this->exploreMerged($center, $radius, $q) as $item) {
                    $candidates[] = $this->shopCandidateFromNearby($item, $region);
                }
            } catch (Throwable $e) {
                $errors[] = '附近搜索失败：' . $e->getMessage();
            }
        }

        try {
            foreach ($this->map->geocode($q, $region) as $item) {
                $candidates[] = $this->shopCandidateFromGeocode($item, $center);
            }
        } catch (Throwable $e) {
            $errors[] = '地点联想失败：' . $e->getMessage();
        }

        if (! $this->map instanceof TencentMapProvider && (getenv('TENCENT_MAP_KEY') ?: '') !== '') {
            try {
                foreach (new TencentMapProvider()->geocode($q, $region) as $item) {
                    $candidates[] = $this->shopCandidateFromGeocode($item, $center);
                }
            } catch (Throwable $e) {
                $errors[] = '腾讯联想兜底失败：' . $e->getMessage();
            }
        }

        $candidates = $this->sortShopCandidates($this->uniqueShopCandidates($candidates));
        if ($candidates === [] && $errors !== []) {
            throw new BizException(500, implode('；', $errors));
        }

        return $this->ok([
            'candidates' => array_slice($candidates, 0, 8),
        ]);
    }

    /**
     * 当前位置反查：用于展示具体位置，并把城市作为后续地点搜索的 region。
     */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function reverseGeocode(RequestInterface $request): array
    {
        $lat = (float) $request->input('lat', 0);
        $lng = (float) $request->input('lng', 0);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat === 0.0 && $lng === 0.0)) {
            throw new BizException(422, '中心点坐标不合法');
        }

        try {
            $location = $this->map->reverseGeocode(['lat' => $lat, 'lng' => $lng]);
        } catch (Throwable $e) {
            throw new BizException(500, '当前位置解析失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($location);
    }

    /**
     * 保存饭局房间，返回可复制给朋友的饭局码。
     */
    #[RateLimit(create: 3, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function saveRoom(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $room = $request->input('room', []);
        if (! is_array($room) || $room === []) {
            throw new BizException(422, '饭局数据不能为空');
        }

        try {
            $record = $this->rooms->save($room, $userId, (string) $request->input('code', ''));
        } catch (Throwable $e) {
            throw new BizException(500, '饭局保存失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($record);
    }

    /**
     * 按饭局码读取房间数据。
     */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function getRoom(string $code): array
    {
        $record = $this->rooms->find($code);
        if ($record === null) {
            throw new BizException(404, '饭局不存在或已过期');
        }

        return $this->ok($record);
    }

    /**
     * 读取当前登录用户的饭池和吃过历史。
     */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function getMine(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);

        return $this->ok($this->foodData->get($userId));
    }

    /**
     * 保存当前登录用户的饭池和吃过历史。
     */
    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function saveMine(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $poolItems = $request->input('poolItems', []);
        $history = $request->input('history', []);
        $preferences = $request->input('preferences', []);
        $poolGroups = $request->input('poolGroups', []);
        if (! is_array($poolItems)) {
            $poolItems = [];
        }
        if (! is_array($history)) {
            $history = [];
        }
        if (! is_array($preferences)) {
            $preferences = [];
        }
        if (! is_array($poolGroups)) {
            $poolGroups = [];
        }

        try {
            $data = $this->foodData->save($userId, $poolItems, $history, $preferences, $poolGroups);
        } catch (Throwable $e) {
            throw new BizException(500, '吃饭数据保存失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($data);
    }

    /** 从 X-User-Token 读取当前用户。 */
    private function requireUserId(RequestInterface $request): int
    {
        $token = (string) $request->header('X-User-Token', '');
        $userId = $this->users->userIdByToken($token);
        if ($userId === null) {
            throw new BizException(401, '请先微信登录');
        }
        return $userId;
    }

    /**
     * 高德 + 腾讯双数据源周边搜索，合并去重后按距离排序。
     *
     * 单家地图的 POI 覆盖并不完整（例如高德开放平台搜不到「粉小主蜀山万象汇店」，腾讯有），
     * 两家一起搜能显著减少漏店。两家 explore() 返回结构一致，都带 distanceM。
     * 只要有一家成功就返回结果；两家都失败才抛错。
     *
     * @param array{lat: float, lng: float} $center
     * @return array<int, array{name: string, address: string, distanceM: int, lat: float, lng: float, category: string, typecode: string}>
     */
    private function exploreMerged(array $center, int $radius, string $keyword): array
    {
        $merged = [];
        $errors = [];

        // 主 provider（由 MAP_PROVIDER 决定，默认腾讯；线上是高德）。
        try {
            foreach ($this->map->explore($center, $radius, $keyword) as $item) {
                $merged[] = $item;
            }
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }

        // 若主 provider 不是腾讯，再补一路腾讯，补足高德漏掉的门店。
        if (! $this->map instanceof TencentMapProvider && (getenv('TENCENT_MAP_KEY') ?: '') !== '') {
            try {
                foreach (new TencentMapProvider()->explore($center, $radius, $keyword) as $item) {
                    $merged[] = $item;
                }
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        if ($merged === [] && $errors !== []) {
            throw new RuntimeException(implode('；', $errors));
        }

        // 兜底：两家地图偶尔会返回超出请求半径的门店（自动扩圈/召回策略），
        // 随机场景下会抽到很远的店，这里按半径 + 20% 容差过滤掉离谱的结果。
        $limit = (int) ($radius * 1.2);
        $merged = array_values(array_filter($merged, static function (array $item) use ($limit): bool {
            $d = (int) ($item['distanceM'] ?? 0);
            return $d === 0 || $d <= $limit;
        }));

        return $this->dedupeNearbyItems($merged);
    }

    /**
     * 周边 POI 去重：同一家店在高德/腾讯的名称或坐标会有细微差异，
     * 用「归一化店名 + 三位坐标」聚合，保留距离更近的那条。
     *
     * @param array<int, array<string, mixed>> $items
     * @return array<int, array{name: string, address: string, distanceM: int, lat: float, lng: float, category: string, typecode: string}>
     */
    private function dedupeNearbyItems(array $items): array
    {
        $byKey = [];
        foreach ($items as $item) {
            $name = (string) ($item['name'] ?? '');
            $lat = (float) ($item['lat'] ?? 0);
            $lng = (float) ($item['lng'] ?? 0);
            if ($name === '' || ($lat === 0.0 && $lng === 0.0)) {
                continue;
            }
            $distance = (int) ($item['distanceM'] ?? 0);
            // 店名归一化：去掉括号分店后缀、分隔符（·・•)和空白，再配三位坐标（~100m）聚合两家数据。
            $normalized = preg_replace('/[（(].*$/u', '', $name) ?? $name;
            $normalized = preg_replace('/[·・•\s]+/u', '', $normalized) ?? $normalized;
            $key = strtolower(trim($normalized)) . '|' . round($lat, 3) . ',' . round($lng, 3);

            $normItem = [
                'name' => $name,
                'address' => (string) ($item['address'] ?? ''),
                'distanceM' => $distance,
                'lat' => $lat,
                'lng' => $lng,
                'category' => (string) ($item['category'] ?? ''),
                'typecode' => (string) ($item['typecode'] ?? ''),
            ];

            $existing = $byKey[$key] ?? null;
            if ($existing === null) {
                $byKey[$key] = $normItem;
                continue;
            }

            // 同一家店的两条数据合并：取更近的距离/坐标，取更「具体」的店名（带分店后缀）和更长的地址。
            $closer = ($distance > 0 && ($existing['distanceM'] === 0 || $distance < $existing['distanceM'])) ? $normItem : $existing;
            $nameHasBranch = str_contains($name, '(') || str_contains($name, '（');
            $existingHasBranch = str_contains((string) $existing['name'], '(') || str_contains((string) $existing['name'], '（');
            $byKey[$key] = [
                'name' => ($nameHasBranch && ! $existingHasBranch) ? $name : $existing['name'],
                'address' => strlen($normItem['address']) > strlen((string) $existing['address']) ? $normItem['address'] : $existing['address'],
                'distanceM' => $closer['distanceM'],
                'lat' => $closer['lat'],
                'lng' => $closer['lng'],
                'category' => $existing['category'] !== '' ? $existing['category'] : $normItem['category'],
                'typecode' => $existing['typecode'] !== '' ? $existing['typecode'] : $normItem['typecode'],
            ];
        }

        $out = array_values($byKey);
        usort($out, static fn(array $a, array $b): int => ($a['distanceM'] ?: PHP_INT_MAX) <=> ($b['distanceM'] ?: PHP_INT_MAX));

        return $out;
    }

    /**
     * 把周边 POI 统一成前端地点候选结构。
     *
     * @param array<string, mixed> $item
     * @return array{name: string, title: string, address: string, lng: float, lat: float, province: string, city: string, adcode: string, distanceM: int}
     */
    private function shopCandidateFromNearby(array $item, string $region): array
    {
        $name = (string) ($item['name'] ?? '');

        return [
            'name' => $name,
            'title' => $name,
            'address' => (string) ($item['address'] ?? ''),
            'lng' => (float) ($item['lng'] ?? 0),
            'lat' => (float) ($item['lat'] ?? 0),
            'province' => '',
            'city' => $region,
            'adcode' => '',
            'distanceM' => (int) ($item['distanceM'] ?? 0),
        ];
    }

    /**
     * 兼容地图 geocode / suggestion 的候选结构。
     *
     * geocode 结果本身不带距离，若有当前位置就用坐标算 haversine 距离，
     * 让腾讯兜底命中的门店也能按“离我近”参与排序，而不是永远沉底。
     *
     * @param array<string, mixed> $item
     * @param array{lat: float, lng: float}|null $center
     * @return array{name: string, title: string, address: string, lng: float, lat: float, province: string, city: string, adcode: string, distanceM?: int}
     */
    private function shopCandidateFromGeocode(array $item, ?array $center): array
    {
        $name = (string) ($item['name'] ?? $item['title'] ?? '');
        $title = (string) ($item['title'] ?? $name);
        $lng = (float) ($item['lng'] ?? 0);
        $lat = (float) ($item['lat'] ?? 0);

        $candidate = [
            'name' => $name,
            'title' => $title,
            'address' => (string) ($item['address'] ?? ''),
            'lng' => $lng,
            'lat' => $lat,
            'province' => (string) ($item['province'] ?? ''),
            'city' => (string) ($item['city'] ?? ''),
            'adcode' => (string) ($item['adcode'] ?? ''),
        ];

        if ($center !== null && ! ($lat === 0.0 && $lng === 0.0)) {
            $candidate['distanceM'] = $this->haversineMeters($center['lat'], $center['lng'], $lat, $lng);
        }

        return $candidate;
    }

    /**
     * 两个经纬度之间的球面距离（米）。用于给无距离的联想结果补上距离，参与近到远排序。
     */
    private function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): int
    {
        $earthRadius = 6371000.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return (int) round($earthRadius * $c);
    }

    /**
     * 按名称、地址和五位坐标去重；附近 POI 在前，因此会优先保留带距离的候选。
     *
     * @param array<int, array<string, mixed>> $candidates
     * @return array<int, array<string, mixed>>
     */
    private function uniqueShopCandidates(array $candidates): array
    {
        $seen = [];
        $out = [];
        foreach ($candidates as $item) {
            $title = trim((string) ($item['title'] ?? $item['name'] ?? ''));
            $address = trim((string) ($item['address'] ?? ''));
            $lat = (float) ($item['lat'] ?? 0);
            $lng = (float) ($item['lng'] ?? 0);
            if ($title === '' || ($lat === 0.0 && $lng === 0.0)) {
                continue;
            }
            $key = strtolower($title . '|' . $address . '|' . round($lng, 5) . ',' . round($lat, 5));
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $item;
        }
        return $out;
    }

    /**
     * 有距离的候选按近到远排序；无距离的联想结果放后面，作为兜底。
     *
     * @param array<int, array<string, mixed>> $candidates
     * @return array<int, array<string, mixed>>
     */
    private function sortShopCandidates(array $candidates): array
    {
        usort($candidates, static function (array $a, array $b): int {
            $ad = isset($a['distanceM']) ? (int) $a['distanceM'] : PHP_INT_MAX;
            $bd = isset($b['distanceM']) ? (int) $b['distanceM'] : PHP_INT_MAX;
            return $ad <=> $bd;
        });

        return $candidates;
    }
}
