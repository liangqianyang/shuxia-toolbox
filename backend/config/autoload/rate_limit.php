<?php

declare(strict_types=1);

use Hyperf\RateLimit\Storage\RedisStorage;

// hyperf/rate-limit 配置（令牌桶）：
//  - create  = 每秒生成的令牌数（匀速）
//  - capacity = 桶容量（突发上限）
//  - consume = 每次请求消耗令牌数（默认 1）
//  - key     = 限流维度，方法上用 #[RateLimit(key: ...)] 覆盖；默认按 URI 路径
// 注意：Aspect 用 !empty()/array_filter 合并配置，0 值会被当空过滤；故 waitTimeout 此处不设
// （=null），效果是超限立即拒绝并抛 RateLimitException，由 RateLimitExceptionHandler 转 429 envelope。
return [
    'create' => 1,
    'consume' => 1,
    'capacity' => 2,
    // waitTimeout（秒，int）：RateLimitHandler::build 第 4 参数要求 int（RedisStorage 的 mutex 锁超时），
    // 同时是 Aspect 超限时的等待上限——超限会排队最多 N 秒重试拿令牌，仍拿不到才抛 RateLimitException→429。
    'waitTimeout' => 1,
    'storage' => [
        'class' => RedisStorage::class,
        'options' => [
            'pool' => 'default', // 对应 config/autoload/redis.php 的连接名
        ],
    ],
];
