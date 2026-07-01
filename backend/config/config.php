<?php

declare(strict_types=1);

return [
    'app_name' => getenv('APP_NAME') ?: 'shuxia-toolbox-api',
    'app_env' => getenv('APP_ENV') ?: 'dev',
    'scan' => [
        'paths' => [
            BASE_PATH . '/app',
        ],
        'ignore_annotations' => [
            'mixin',
        ],
    ],
    'commands' => [],
];
