<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\Ludo\LudoRoomService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 飞行棋联机：房间创建/加入/开局、轮询同步、掷骰/走子、托管、再来一局与离开。 */
final class LudoController extends AbstractController
{
    public function __construct(
        private readonly LudoRoomService $rooms,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function create(RequestInterface $request): array
    {
        return $this->ok($this->rooms->create($this->requireUserId($request)));
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

    #[RateLimit(create: 2, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function start(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->start($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function roll(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->roll($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function move(string $code, RequestInterface $request): array
    {
        $plane = (int) $request->input('plane', -1);
        if ($plane < 0 || $plane > 3) {
            throw new BizException(422, '飞机编号不正确');
        }
        return $this->ok($this->rooms->move($code, $this->requireUserId($request), $plane));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function auto(string $code, RequestInterface $request): array
    {
        $on = (bool) $request->input('on', false);
        return $this->ok($this->rooms->toggleAuto($code, $this->requireUserId($request), $on));
    }

    #[RateLimit(create: 8, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function chat(string $code, RequestInterface $request): array
    {
        $kind = (string) $request->input('kind', '');
        return $this->ok($this->rooms->chat($code, $this->requireUserId($request), $kind,
            $request->input('id'), $request->input('text')));
    }

    #[RateLimit(create: 2, capacity: 6, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function rematch(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->rematch($code, $this->requireUserId($request)));
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
