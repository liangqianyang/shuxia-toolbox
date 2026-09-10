<?php

declare(strict_types=1);

return [
    'http' => [
        // 访问日志放最外层：完整计时，且异常（4xx/5xx）也能落一条
        \App\Middleware\AccessLogMiddleware::class,
        \App\Middleware\ApiKeyMiddleware::class,
    ],
];
