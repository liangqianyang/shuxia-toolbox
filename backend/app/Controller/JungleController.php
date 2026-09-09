<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\Jungle\JungleRoomService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 联机斗兽棋：房间创建/加入、轮询同步、走子、再来一局与离开。 */
final class JungleController extends AbstractController
{
    public function __construct(
        private readonly JungleRoomService $rooms,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function create(RequestInterface $request): array
    {
        // 执子颜色由开局猜拳定选边（胜者选执红/执蓝），创建不传色
        return $this->ok($this->rooms->create($this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function join(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->join($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function rps(string $code, RequestInterface $request): array
    {
        $pick = (string) $request->input('pick', '');
        return $this->ok($this->rooms->rps($code, $this->requireUserId($request), $pick));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function chooseColor(string $code, RequestInterface $request): array
    {
        $color = (string) $request->input('color', '');
        return $this->ok($this->rooms->chooseColor($code, $this->requireUserId($request), $color));
    }

    #[RateLimit(create: 8, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function chat(string $code, RequestInterface $request): array
    {
        $kind = (string) $request->input('kind', '');
        return $this->ok($this->rooms->chat(
            $code,
            $this->requireUserId($request),
            $kind,
            $request->input('id'),
            $request->input('text')
        ));
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
        $fr = (int) $request->input('fr', -1);
        $fc = (int) $request->input('fc', -1);
        $tr = (int) $request->input('tr', -1);
        $tc = (int) $request->input('tc', -1);
        return $this->ok($this->rooms->move($code, $this->requireUserId($request), $fr, $fc, $tr, $tc));
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
