<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\AdminAccessService;
use App\Service\ToolCatalogService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

/** 仅工具运营人员可访问的工具上架与默认排序接口。 */
final class AdminToolController extends AbstractController
{
    public function __construct(
        private readonly AdminAccessService $admins,
        private readonly ToolCatalogService $tools,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function index(RequestInterface $request): array
    {
        $this->requireAdmin($request);
        return $this->ok(['tools' => $this->tools->adminTools()]);
    }

    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function setPublication(RequestInterface $request): array
    {
        $this->requireAdmin($request);
        $toolKey = (string) $request->input('toolKey', '');
        $published = filter_var($request->input('published', false), FILTER_VALIDATE_BOOL);
        try {
            return $this->ok(['tool' => $this->tools->setPublished($toolKey, $published)]);
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '更新工具状态失败：' . $e->getMessage(), null, $e);
        }
    }

    #[RateLimit(create: 5, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function saveOrder(RequestInterface $request): array
    {
        $this->requireAdmin($request);
        $toolKeys = $request->input('toolKeys', []);
        if (! is_array($toolKeys)) {
            throw new BizException(422, '工具排序格式不正确');
        }
        try {
            return $this->ok(['tools' => $this->tools->saveCatalogOrder($toolKeys)]);
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '保存工具排序失败：' . $e->getMessage(), null, $e);
        }
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
