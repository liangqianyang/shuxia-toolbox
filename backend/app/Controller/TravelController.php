<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\TravelShareService;
use App\Service\TravelService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

class TravelController extends AbstractController
{
    public function __construct(
        private readonly TravelService $travel,
        private readonly TravelShareService $shares,
    )
    {
    }

    /**
     * 地点搜索代理：前端输入地点名，后端走当前地图服务商返回候选坐标。
     */
    #[RateLimit(create: 5, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function geocode(RequestInterface $request): array
    {
        $q = trim((string) $request->input('q', ''));
        if ($q === '') {
            throw new BizException(422, '查询地址不能为空');
        }

        try {
            $candidates = $this->travel->geocode($q, trim((string) $request->input('region', '')));
        } catch (Throwable $e) {
            throw new BizException(500, $e->getMessage(), null, $e);
        }

        return $this->ok([
            'candidates' => $candidates,
        ]);
    }

    /**
     * AI 规划行程：出发地 + 目的地 + 出行方式 + 天数 + 每天时长 + 偏好 → 结构化行程
     * （每站带 best-effort 坐标与站间路线）+ 美食/贴士/小红书文案 + 两张真实地图。
     */
    #[RateLimit(create: 1, capacity: 2, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function plan(RequestInterface $request): array
    {
        $destination = trim((string) $request->input('destination', ''));
        if ($destination === '') {
            throw new BizException(422, '目的地不能为空');
        }

        $days = (int) $request->input('days', 1);
        if ($days < 1) {
            $days = 1;
        }
        if ($days > 30) {
            $days = 30;
        }

        // 出行方式白名单，非法值回退步行
        $mode = (string) $request->input('travel_mode', 'walking');
        if (! in_array($mode, ['walking', 'cycling', 'driving', 'transit', 'train'], true)) {
            $mode = 'walking';
        }

        // 旅行强度白名单，影响 AI 排点密度与缓冲时间
        $intensity = (string) $request->input('intensity', 'standard');
        if (! in_array($intensity, ['relaxed', 'standard', 'packed'], true)) {
            $intensity = 'standard';
        }

        // 每日游玩时长：支持按天数组（[8,6,7]）或单值；非法/空回退 [8]
        $dhRaw = $request->input('daily_hours', 8);
        $dailyHours = is_array($dhRaw)
            ? array_values(array_filter(array_map(fn ($v) => (float) $v, $dhRaw), fn ($v) => $v > 0))
            : [(float) $dhRaw];
        if ($dailyHours === []) {
            $dailyHours = [8.0];
        }

        $input = [
            'destination' => $destination,
            'days' => $days,
            'daily_hours' => $dailyHours,
            'round_trip' => (bool) $request->input('round_trip', false),
            'preferences' => (string) $request->input('preferences', ''),
            'origin' => trim((string) $request->input('origin', '')),
            'travel_mode' => $mode,
            'intensity' => $intensity,
            // 出发日期（可选，自然语言/绝对日期均可，不校验格式）→ AI 据此联网查目的地天气驱动 packingTips
            'departure_date' => trim((string) $request->input('departure_date', '')),
            // 用户指定的景点/美食（可选）→ AI 务必纳入，路线更有针对性
            'sights' => trim((string) $request->input('sights', '')),
            'foods' => trim((string) $request->input('foods', '')),
        ];

        try {
            $plan = $this->travel->plan($input);
        } catch (Throwable $e) {
            throw new BizException(500, 'AI 规划失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($plan);
    }

    /**
     * 局部重写某一天：保留锁定地点，只替换当天未锁定部分。
     */
    #[RateLimit(create: 1, capacity: 2, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function refineDay(RequestInterface $request): array
    {
        $dayIndex = (int) $request->input('day_index', 0);
        if ($dayIndex < 1) {
            throw new BizException(422, 'day_index 不合法');
        }

        $day = $request->input('day', []);
        $days = $request->input('days', []);
        if (! is_array($day) || ! is_array($days) || $days === []) {
            throw new BizException(422, '缺少当前行程数据');
        }

        $mode = (string) $request->input('travel_mode', 'walking');
        if (! in_array($mode, ['walking', 'cycling', 'driving', 'transit', 'train'], true)) {
            $mode = 'walking';
        }
        $intensity = (string) $request->input('intensity', 'standard');
        if (! in_array($intensity, ['relaxed', 'standard', 'packed'], true)) {
            $intensity = 'standard';
        }

        $input = [
            'destination' => trim((string) $request->input('destination', '')),
            'day_index' => $dayIndex,
            'day' => $day,
            'days' => $days,
            'locked_stops' => is_array($request->input('locked_stops', [])) ? $request->input('locked_stops', []) : [],
            'travel_mode' => $mode,
            'intensity' => $intensity,
            'daily_hours' => (float) $request->input('daily_hours', 8),
            'intercity' => $request->input('intercity', null),
        ];

        try {
            $result = $this->travel->refineDay($input);
        } catch (Throwable $e) {
            throw new BizException(500, 'AI 重写失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($result);
    }

    /**
     * 替换某一天里的单个地点：保留其它地点，只让 AI 给一个新 stop。
     */
    #[RateLimit(create: 1, capacity: 2, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function replaceStop(RequestInterface $request): array
    {
        $dayIndex = (int) $request->input('day_index', 0);
        if ($dayIndex < 1) {
            throw new BizException(422, 'day_index 不合法');
        }

        $rawStopIndex = $request->input('stop_index', null);
        if ($rawStopIndex === null || (int) $rawStopIndex < 0) {
            throw new BizException(422, 'stop_index 不合法');
        }

        $day = $request->input('day', []);
        $days = $request->input('days', []);
        if (! is_array($day) || ! is_array($days) || $days === []) {
            throw new BizException(422, '缺少当前行程数据');
        }

        $mode = (string) $request->input('travel_mode', 'walking');
        if (! in_array($mode, ['walking', 'cycling', 'driving', 'transit', 'train'], true)) {
            $mode = 'walking';
        }
        $intensity = (string) $request->input('intensity', 'standard');
        if (! in_array($intensity, ['relaxed', 'standard', 'packed'], true)) {
            $intensity = 'standard';
        }

        $input = [
            'destination' => trim((string) $request->input('destination', '')),
            'day_index' => $dayIndex,
            'stop_index' => (int) $rawStopIndex,
            'day' => $day,
            'days' => $days,
            'target_stop' => is_array($request->input('target_stop', [])) ? $request->input('target_stop', []) : [],
            'locked_stops' => is_array($request->input('locked_stops', [])) ? $request->input('locked_stops', []) : [],
            'travel_mode' => $mode,
            'intensity' => $intensity,
            'daily_hours' => (float) $request->input('daily_hours', 8),
            'intercity' => $request->input('intercity', null),
        ];

        try {
            $result = $this->travel->replaceStop($input);
        } catch (Throwable $e) {
            throw new BizException(500, 'AI 替换失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($result);
    }

    /**
     * 云保存当前行程。
     *
     * 前端传完整 trip JSON，后端只做轻量校验和持久化，返回短分享码；
     * 分享码可用于手动导入，也可拼成小程序路径 pages/travel/index?share=xxxx。
     */
    public function saveShare(RequestInterface $request): array
    {
        $trip = $request->input('trip', []);
        if (! is_array($trip) || $trip === []) {
            throw new BizException(422, '缺少行程数据');
        }

        try {
            return $this->ok($this->shares->save($trip));
        } catch (Throwable $e) {
            throw new BizException(500, '云保存失败：' . $e->getMessage(), null, $e);
        }
    }

    /**
     * 按分享码读取行程。
     *
     * 当前没有账号权限模型，知道分享码即可读取；正式上线若涉及隐私行程，应加 owner/过期时间/访问控制。
     */
    public function getShare(RequestInterface $request, string $code): array
    {
        $record = $this->shares->find($code);
        if ($record === null) {
            throw new BizException(404, '分享行程不存在或已失效');
        }

        return $this->ok($record);
    }
}
