<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\FoodUserDataService;
use App\Service\FoodRoomService;
use App\Service\Map\MapProvider;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
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
            $items = $this->map->explore(['lat' => $lat, 'lng' => $lng], $radius, $keyword);
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
                ];
            }, $items),
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
}
