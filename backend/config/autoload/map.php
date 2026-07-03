<?php

declare(strict_types=1);

return [
    // 当前服务商（Provider 接口绑定见 config/autoload/dependencies.php）
    'provider' => getenv('MAP_PROVIDER') ?: 'tencent',
    'tencent' => [
        'key' => getenv('TENCENT_MAP_KEY') ?: '',
        'timeout' => (int) (getenv('MAP_TIMEOUT') ?: 5),
    ],
];
