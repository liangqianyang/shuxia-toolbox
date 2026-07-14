<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\ToolCatalogService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

/** 用户侧工具集：读取首页工具与保存选择/排序。 */
final class ToolController extends AbstractController
{
    public function __construct(
        private readonly ToolCatalogService $tools,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function home(RequestInterface $request): array
    {
        return $this->ok($this->tools->userTools($this->requireUserId($request)));
    }

    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function saveHome(RequestInterface $request): array
    {
        $toolKeys = $request->input('toolKeys', []);
        if (! is_array($toolKeys)) {
            throw new BizException(422, '工具列表格式不正确');
        }
        try {
            return $this->ok($this->tools->saveUserTools($this->requireUserId($request), $toolKeys));
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '保存首页工具失败：' . $e->getMessage(), null, $e);
        }
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
