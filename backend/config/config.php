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
    'commands' => [
        // hyperf/database 迁移与模型生成命令（该组件未随 ConfigProvider 自动注册，需在此登记）
        \Hyperf\Database\Commands\Migrations\MigrateCommand::class,
        \Hyperf\Database\Commands\Migrations\FreshCommand::class,
        \Hyperf\Database\Commands\Migrations\InstallCommand::class,
        \Hyperf\Database\Commands\Migrations\RefreshCommand::class,
        \Hyperf\Database\Commands\Migrations\ResetCommand::class,
        \Hyperf\Database\Commands\Migrations\RollbackCommand::class,
        \Hyperf\Database\Commands\Migrations\StatusCommand::class,
        \Hyperf\Database\Commands\Migrations\GenMigrateCommand::class,
        \Hyperf\Database\Commands\Seeders\GenSeederCommand::class,
        \Hyperf\Database\Commands\Seeders\SeedCommand::class,
        \Hyperf\Database\Commands\ModelCommand::class,
    ],
];
