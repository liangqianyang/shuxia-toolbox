<?php

declare(strict_types=1);

return [
    'handler' => [
        'http' => [
            // 限流优先：RateLimitException 必须先于 AppExceptionHandler 被截获，否则会被兜底成 500
            \App\Exception\Handler\RateLimitExceptionHandler::class,
            \App\Exception\Handler\AppExceptionHandler::class,
        ],
        // ws server 的握手阶段复用同一套异常转 envelope 逻辑
        'ws' => [
            \App\Exception\Handler\RateLimitExceptionHandler::class,
            \App\Exception\Handler\AppExceptionHandler::class,
        ],
    ],
];
