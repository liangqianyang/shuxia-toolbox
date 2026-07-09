<?php

declare(strict_types=1);

return [
    // 当前服务商（Provider 接口绑定见 config/autoload/dependencies.php）
    'provider' => getenv('MAP_PROVIDER') ?: 'tencent',
    'tencent' => [
        'key' => getenv('TENCENT_MAP_KEY') ?: '',
        'timeout' => (int) (getenv('MAP_TIMEOUT') ?: 5),
    ],
    'amap' => [
        'key' => getenv('AMAP_WEB_SERVICE_KEY')
            ?: getenv('GAODE_WEB_SERVICE_KEY')
            ?: getenv('AMAP_REST_KEY')
            ?: getenv('GAODE_REST_KEY')
            ?: getenv('AMAP_MAP_KEY')
            ?: getenv('GAODE_MAP_KEY')
            ?: '',
        // 高德静态图不可用时的兜底服务商；当前仅支持 tencent，设为 none 可关闭。
        'static_map_fallback' => getenv('AMAP_STATIC_MAP_FALLBACK') ?: 'tencent',
        // 高德公交规划要求城市上下文。正常会优先用 geocode 返回的城市/adcode；这里是兜底。
        'transit_city' => getenv('AMAP_TRANSIT_CITY') ?: '',
        'timeout' => (int) (getenv('MAP_TIMEOUT') ?: 5),
    ],
];
