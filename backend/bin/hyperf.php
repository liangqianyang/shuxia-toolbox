#!/usr/bin/env php
<?php

declare(strict_types=1);

use Hyperf\Contract\ApplicationInterface;
use Hyperf\Di\ClassLoader;

ini_set('display_errors', 'on');
ini_set('display_startup_errors', 'on');
error_reporting(E_ALL);

! defined('BASE_PATH') && define('BASE_PATH', dirname(__DIR__));
if (! defined('SWOOLE_HOOK_FLAGS')) {
    $hookFlags = defined('SWOOLE_HOOK_SOCKETS')
        ? SWOOLE_HOOK_ALL ^ SWOOLE_HOOK_SOCKETS
        : SWOOLE_HOOK_ALL;

    define('SWOOLE_HOOK_FLAGS', $hookFlags);
}

require BASE_PATH . '/vendor/autoload.php';

ClassLoader::init();

$container = require BASE_PATH . '/config/container.php';
$application = $container->get(ApplicationInterface::class);
$application->run();
