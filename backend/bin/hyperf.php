#!/usr/bin/env php
<?php

declare(strict_types=1);

use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ApplicationInterface;
use Hyperf\Di\ClassLoader;

ini_set('display_errors', 'on');
ini_set('display_startup_errors', 'on');
error_reporting(E_ALL);

! defined('BASE_PATH') && define('BASE_PATH', dirname(__DIR__));

// 轻量 .env 加载（项目未装 vlucas/dotenv）：把 .env 的 KEY=VALUE 注入进程环境供 getenv() 读取
// （TENCENT_MAP_KEY / ZHIPU_API_KEY 等）。worker 由 master fork 继承，故只需在入口加载一次。
// 已存在的真实环境变量优先，不被 .env 覆盖。
$envPath = BASE_PATH . '/.env';
if (is_file($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $raw) {
        $line = trim($raw);
        if ($line === '' || $line[0] === '#' || ! str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        if ($k === '' || getenv($k) !== false) {
            continue;
        }
        $v = trim($v);
        if (strlen($v) >= 2 && (($v[0] === '"' && substr($v, -1) === '"') || ($v[0] === "'" && substr($v, -1) === "'"))) {
            $v = substr($v, 1, -1);
        }
        putenv($k . '=' . $v);
    }
}
// 设置默认时区：Eloquent 的 created_at/updated_at 等由 PHP 层 Carbon::now() 生成后按字符串写入
// datetime 列（列本身不带时区），故写入时间取决于 PHP 默认时区，而非 MySQL time_zone。
// 默认上海时间，可用 .env 的 APP_TIMEZONE 覆盖。
date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'Asia/Shanghai');

if (! defined('SWOOLE_HOOK_FLAGS')) {
    $hookFlags = SWOOLE_HOOK_ALL;
    // 排除 SOCKETS（项目既有限制）与 CURL（Swoole 的 curl 钩子不兼容 Guzzle 的部分 curl 选项，
    // 如 option 20312；禁用后 Guzzle 走原生 PHP curl 扩展 = 系统 libcurl，行为与 shell curl 一致）
    if (defined('SWOOLE_HOOK_SOCKETS')) {
        $hookFlags ^= SWOOLE_HOOK_SOCKETS;
    }
    if (defined('SWOOLE_HOOK_CURL')) {
        $hookFlags ^= SWOOLE_HOOK_CURL;
    }

    define('SWOOLE_HOOK_FLAGS', $hookFlags);
}

require BASE_PATH . '/vendor/autoload.php';

ClassLoader::init();

$container = require BASE_PATH . '/config/container.php';
// 显式注册到 ApplicationContext：AOP 的 ProxyTrait::makePipeline 等处通过静态 getContainer() 取容器，
// 不注册则返回 null、注解切面（如 #[RateLimit]）会抛 TypeError。项目此前未调用，故一直无法用注解 AOP。
ApplicationContext::setContainer($container);
$application = $container->get(ApplicationInterface::class);
$application->run();
