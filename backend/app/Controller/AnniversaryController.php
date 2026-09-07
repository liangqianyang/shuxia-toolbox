<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\AnniversaryService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

/** 时光纪念卡：纪念日、倒数日和卡片偏好。 */
final class AnniversaryController extends AbstractController
{
    public function __construct(
        private readonly AnniversaryService $anniversaries,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function index(RequestInterface $request): array
    {
        return $this->ok([
            'events' => $this->anniversaries->events($this->requireUserId($request)),
        ]);
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function save(RequestInterface $request): array
    {
        $payload = $request->all();
        try {
            return $this->ok([
                'event' => $this->anniversaries->save($this->requireUserId($request), $payload),
            ]);
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '保存纪念日失败：' . $e->getMessage(), null, $e);
        }
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function delete(RequestInterface $request, string $id): array
    {
        $this->anniversaries->delete($this->requireUserId($request), (int) $id);
        return $this->ok(['deleted' => true]);
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function markCalendarAdded(RequestInterface $request, string $id): array
    {
        return $this->ok([
            'event' => $this->anniversaries->markCalendarAdded(
                $this->requireUserId($request),
                (int) $id,
                (string) $request->input('repeatType', 'none'),
            ),
        ]);
    }

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function subscribe(RequestInterface $request, string $id): array
    {
        $userId = $this->requireUserId($request);
        $templateId = (string) $request->input('templateId', '');
        $nextOccurrenceDate = (string) $request->input('nextOccurrenceDate', '');
        if ($templateId === '') {
            throw new BizException(422, 'templateId 不能为空');
        }

        $this->anniversaries->subscribe($userId, (int) $id, $templateId, $nextOccurrenceDate);
        return $this->ok(['subscribed' => true]);
    }

    #[RateLimit(create: 6, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function createInvite(RequestInterface $request, string $id): array
    {
        return $this->ok([
            'invite' => $this->anniversaries->createInvite(
                $this->requireUserId($request),
                (int) $id,
                (string) $request->input('role', 'viewer'),
            ),
        ]);
    }

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function previewInvite(RequestInterface $request, string $code): array
    {
        $this->requireUserId($request);
        return $this->ok($this->anniversaries->previewInvite($code));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function acceptInvite(RequestInterface $request, string $code): array
    {
        return $this->ok($this->anniversaries->acceptInvite($this->requireUserId($request), $code));
    }

    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function members(RequestInterface $request, string $id): array
    {
        return $this->ok($this->anniversaries->members($this->requireUserId($request), (int) $id));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function updateMemberRole(RequestInterface $request, string $id): array
    {
        $userId = (int) $request->input('userId', 0);
        if ($userId <= 0) {
            throw new BizException(422, 'userId 不能为空');
        }
        return $this->ok($this->anniversaries->updateMemberRole(
            $this->requireUserId($request),
            (int) $id,
            $userId,
            (string) $request->input('role', 'viewer'),
        ));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function removeMember(RequestInterface $request, string $id): array
    {
        $userId = (int) $request->input('userId', 0);
        if ($userId <= 0) {
            throw new BizException(422, 'userId 不能为空');
        }
        return $this->ok($this->anniversaries->removeMember($this->requireUserId($request), (int) $id, $userId));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function leaveEvent(RequestInterface $request, string $id): array
    {
        $this->anniversaries->leaveEvent($this->requireUserId($request), (int) $id);
        return $this->ok(['left' => true]);
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
