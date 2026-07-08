<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\TravelService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Throwable;

final class TravelController
{
    public function __construct(private readonly TravelService $travel) {}

    public function geocode(RequestInterface $request): array
    {
        $q = trim((string) $request->input('q', ''));
        if ($q === '') {
            return [
                'code' => 422,
                'message' => '查询地址不能为空',
                'data' => null,
            ];
        }

        try {
            $candidates = $this->travel->geocode($q);
        } catch (Throwable $e) {
            return [
                'code' => 502,
                'message' => $e->getMessage(),
                'data' => null,
            ];
        }

        return [
            'code' => 0,
            'message' => 'ok',
            'data' => [
                'candidates' => $candidates,
            ],
        ];
    }

    /**
     * AI 规划行程：出发地 + 目的地 + 出行方式 + 天数 + 每天时长 + 偏好 → 结构化行程
     * （每站带 best-effort 坐标与站间路线）+ 美食/贴士/小红书文案 + 两张真实地图。
     */
    public function plan(RequestInterface $request): array
    {
        $destination = trim((string) $request->input('destination', ''));
        if ($destination === '') {
            return [
                'code' => 422,
                'message' => '目的地不能为空',
                'data' => null,
            ];
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
            return [
                'code' => 502,
                'message' => 'AI 规划失败：' . $e->getMessage(),
                'data' => null,
            ];
        }

        return [
            'code' => 0,
            'message' => 'ok',
            'data' => $plan,
        ];
    }

    /**
     * 局部重写某一天：保留锁定地点，只替换当天未锁定部分。
     */
    public function refineDay(RequestInterface $request): array
    {
        $dayIndex = (int) $request->input('day_index', 0);
        if ($dayIndex < 1) {
            return [
                'code' => 422,
                'message' => 'day_index 不合法',
                'data' => null,
            ];
        }

        $day = $request->input('day', []);
        $days = $request->input('days', []);
        if (! is_array($day) || ! is_array($days) || $days === []) {
            return [
                'code' => 422,
                'message' => '缺少当前行程数据',
                'data' => null,
            ];
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
            return [
                'code' => 502,
                'message' => 'AI 重写失败：' . $e->getMessage(),
                'data' => null,
            ];
        }

        return [
            'code' => 0,
            'message' => 'ok',
            'data' => $result,
        ];
    }

    /**
     * 替换某一天里的单个地点：保留其它地点，只让 AI 给一个新 stop。
     */
    public function replaceStop(RequestInterface $request): array
    {
        $dayIndex = (int) $request->input('day_index', 0);
        if ($dayIndex < 1) {
            return [
                'code' => 422,
                'message' => 'day_index 不合法',
                'data' => null,
            ];
        }

        $rawStopIndex = $request->input('stop_index', null);
        if ($rawStopIndex === null || (int) $rawStopIndex < 0) {
            return [
                'code' => 422,
                'message' => 'stop_index 不合法',
                'data' => null,
            ];
        }

        $day = $request->input('day', []);
        $days = $request->input('days', []);
        if (! is_array($day) || ! is_array($days) || $days === []) {
            return [
                'code' => 422,
                'message' => '缺少当前行程数据',
                'data' => null,
            ];
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
            return [
                'code' => 502,
                'message' => 'AI 替换失败：' . $e->getMessage(),
                'data' => null,
            ];
        }

        return [
            'code' => 0,
            'message' => 'ok',
            'data' => $result,
        ];
    }
}
