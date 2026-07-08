<?php

declare(strict_types=1);

return [
    'handler' => [
        'http' => [
            // 限流优先：RateLimitException 必须先于 AppExceptionHandler 被截获，否则会被兜底成 500
            \App\Exception\Handler\RateLimitExceptionHandler::class,
            \App\Exception\Handler\AppExceptionHandler::class,
        ],
    ],
];
