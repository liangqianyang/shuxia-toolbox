<?php

declare(strict_types=1);

// Redis 连接（限流计数用）。开发环境 redis 为同 docker 网络的服务名（已实测可连通）。
return [
    'default' => [
        'host' => getenv('REDIS_HOST') ?: 'redis',
        'port' => (int) (getenv('REDIS_PORT') ?: 6379),
        'auth' => getenv('REDIS_PASSWORD') ?: null,
        'db' => (int) (getenv('REDIS_DB') ?: 0),
        'timeout' => 3.0,
        'reserved' => null,
        'retry_interval' => 0,
        'pool' => [
            // worker_num=1：连接池极小即可，过度开连接占协程资源
            'min_connections' => 1,
            'max_connections' => 8,
            'connect_timeout' => 3.0,
            'wait_timeout' => 3.0,
            'heartbeat' => -1,
            'max_idle_time' => 60,
        ],
    ],
];
