<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

/**
 * 账号登录接口。
 */
final class AuthController extends AbstractController
{
    public function __construct(
        private readonly WechatUserService $users,
    ) {}

    /**
     * 微信小程序登录：wx.login code -> openid -> 后端 token。
     */
    #[RateLimit(create: 3, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function wechatLogin(RequestInterface $request): array
    {
        $profile = $request->input('profile', []);
        if (! is_array($profile)) {
            $profile = [];
        }

        try {
            $result = $this->users->login((string) $request->input('code', ''), $profile);
        } catch (Throwable $e) {
            throw new BizException(500, '微信登录失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok($result);
    }
}
