<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\AdminAccessService;
use App\Service\FeatureFlagService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 运营台的全局功能开关（与工具上架同一套管理员鉴权）。 */
final class AdminFeatureController extends AbstractController
{
    public function __construct(
        private readonly AdminAccessService $admins,
        private readonly FeatureFlagService $flags,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function index(RequestInterface $request): array
    {
        $this->requireAdmin($request);
        return $this->ok([
            'aiEnabled' => $this->flags->aiEnabled(),
            'unoChatTextEnabled' => $this->flags->unoChatTextEnabled(),
        ]);
    }

    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function save(RequestInterface $request): array
    {
        $this->requireAdmin($request);
        $result = [];
        if ($request->input('aiEnabled') !== null) {
            $result['aiEnabled'] = $this->flags->setAiEnabled(filter_var($request->input('aiEnabled'), FILTER_VALIDATE_BOOL));
        }
        if ($request->input('unoChatTextEnabled') !== null) {
            $result['unoChatTextEnabled'] = $this->flags->setUnoChatTextEnabled(filter_var($request->input('unoChatTextEnabled'), FILTER_VALIDATE_BOOL));
        }
        return $this->ok($result === [] ? [
            'aiEnabled' => $this->flags->aiEnabled(),
            'unoChatTextEnabled' => $this->flags->unoChatTextEnabled(),
        ] : $result);
    }

    private function requireAdmin(RequestInterface $request): void
    {
        $userId = $this->users->userIdByToken((string) $request->header('X-User-Token', ''));
        if ($userId === null) {
            throw new BizException(401, '请先微信登录');
        }
        $this->admins->requireAdmin($userId);
    }
}
