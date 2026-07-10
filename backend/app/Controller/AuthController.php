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

    /**
     * 保存用户主动选择/填写的资料。
     */
    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function saveProfile(RequestInterface $request): array
    {
        $userId = $this->users->userIdByToken((string) $request->header('X-User-Token', ''));
        if ($userId === null) {
            throw new BizException(401, '请先微信登录');
        }

        try {
            $user = $this->users->updateProfile(
                $userId,
                (string) $request->input('nickname', ''),
                (string) $request->input('avatarUrl', ''),
            );
        } catch (Throwable $e) {
            throw new BizException(500, '资料保存失败：' . $e->getMessage(), null, $e);
        }

        return $this->ok(['user' => $user]);
    }
}
