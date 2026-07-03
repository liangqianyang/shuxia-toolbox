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
}
