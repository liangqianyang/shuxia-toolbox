<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\AdminAccessService;
use App\Service\AvatarUploadService;
use App\Service\WechatUserService;
use Hyperf\Context\ResponseContext;
use Hyperf\HttpMessage\Stream\SwooleFileStream;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Psr\Http\Message\ResponseInterface;
use Throwable;

/**
 * 账号登录接口。
 */
final class AuthController extends AbstractController
{
    public function __construct(
        private readonly WechatUserService $users,
        private readonly AdminAccessService $admins,
        private readonly AvatarUploadService $avatars,
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
        $userId = $this->requireUserId($request);

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

    /** 接收小程序 chooseAvatar 的临时文件，返回可长期展示的头像地址。 */
    #[RateLimit(create: 3, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function uploadAvatar(RequestInterface $request): array
    {
        $file = $request->file('file');
        if (! $file instanceof \Psr\Http\Message\UploadedFileInterface) {
            throw new BizException(422, '请选择头像文件');
        }

        try {
            return $this->ok(['avatarUrl' => $this->avatars->store($file, $this->requireUserId($request))]);
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '头像上传失败：' . $e->getMessage(), null, $e);
        }
    }

    /** 头像文件需要供 image 组件直接读取，因此放在 API Key 鉴权范围之外。 */
    public function avatar(string $filename): ResponseInterface
    {
        $path = $this->avatars->pathFor($filename);
        if ($path === null) {
            throw new BizException(404, '头像不存在');
        }

        return ResponseContext::get()
            ->withHeader('Content-Type', $this->avatars->mimeType($path))
            ->withHeader('Cache-Control', 'public, max-age=2592000')
            ->withBody(new SwooleFileStream($path));
    }

    /** 读取当前登录用户，用于“我的”页与管理员入口判断。 */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function me(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $user = $this->users->findUser($userId);
        if ($user === null) {
            throw new BizException(404, '用户不存在');
        }

        return $this->ok([
            'user' => $user,
            'isAdmin' => $this->admins->isAdmin($userId),
        ]);
    }

    private function requireUserId(RequestInterface $request): int
    {
        $userId = $this->users->userIdByToken((string) $request->header('X-User-Token', ''));
        if ($userId === null) {
            throw new BizException(401, '请先微信登录');
        }
        return $userId;
    }
}
