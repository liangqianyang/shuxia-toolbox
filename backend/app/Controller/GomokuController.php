<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\Gomoku\GomokuRoomService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 联机五子棋：房间创建/加入、轮询同步、落子、再来一局与离开。 */
final class GomokuController extends AbstractController
{
    public function __construct(
        private readonly GomokuRoomService $rooms,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function create(RequestInterface $request): array
    {
        $color = (string) $request->input('color', 'black');
        if (! in_array($color, ['black', 'white'], true)) {
            throw new BizException(422, '执子颜色不正确');
        }
        return $this->ok($this->rooms->create($this->requireUserId($request), $color));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function join(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->join($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 2, capacity: 24, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function state(string $code, RequestInterface $request): array
    {
        $since = (int) $request->query('since', 0);
        return $this->ok($this->rooms->state($code, $this->requireUserId($request), $since));
    }

    #[RateLimit(create: 4, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function move(string $code, RequestInterface $request): array
    {
        $x = (int) $request->input('x', -1);
        $y = (int) $request->input('y', -1);
        return $this->ok($this->rooms->move($code, $this->requireUserId($request), $x, $y));
    }

    #[RateLimit(create: 2, capacity: 6, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function rematch(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->rematch($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 2, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function requestUndo(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->requestUndo($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 2, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function respondUndo(string $code, RequestInterface $request): array
    {
        $accept = (bool) $request->input('accept', false);
        return $this->ok($this->rooms->respondUndo($code, $this->requireUserId($request), $accept));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function leave(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->leave($code, $this->requireUserId($request)));
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
