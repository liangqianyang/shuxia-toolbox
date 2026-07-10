<?php

declare(strict_types=1);

// hyperf/db-connection 连接池配置：模型与 Db 门面走这里的 default 连接。
// .env 由 bin/hyperf.php 注入进程环境，故直接用 getenv() 与其它 autoload 配置保持一致。
return [
    'default' => [
        'driver' => getenv('DB_DRIVER') ?: 'mysql',
        'host' => getenv('DB_HOST') ?: 'dev-mysql',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'database' => getenv('DB_DATABASE') ?: 'shuxia_toolbox',
        'username' => getenv('DB_USERNAME') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '123456',
        'charset' => getenv('DB_CHARSET') ?: 'utf8mb4',
        'collation' => getenv('DB_COLLATION') ?: 'utf8mb4_unicode_ci',
        'prefix' => getenv('DB_PREFIX') ?: '',
        'pool' => [
            'min_connections' => 1,
            'max_connections' => 10,
            'connect_timeout' => 10.0,
            'wait_timeout' => 3.0,
            'heartbeat' => -1,
            'max_idle_time' => (float) (getenv('DB_MAX_IDLE_TIME') ?: 60),
        ],
    ],
];
