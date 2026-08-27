<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\FeatureFlagService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use App\Middleware\ApiKeyMiddleware;

/** 公开的功能开关查询：前端启动/进页时拉取，决定 AI 入口是否展示（服务端仍硬拦截兜底）。 */
final class FeatureController extends AbstractController
{
    public function __construct(private readonly FeatureFlagService $flags) {}

    #[RateLimit(create: 20, capacity: 40, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function index(RequestInterface $request): array
    {
        return $this->ok(['aiEnabled' => $this->flags->aiEnabled()]);
    }
}
