<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\Adventure\AdventureRoomService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 枫趣冒险联机：房间创建/加入/开局、轮询同步、掷骰/道具/走子、选择窗、决斗与押注、
 *  托管、存档/续局、聊天、我的对局、再来一局与离开。 */
final class AdventureController extends AbstractController
{
    public function __construct(
        private readonly AdventureRoomService $rooms,
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
    public function myRooms(RequestInterface $request): array
    {
        return $this->ok($this->rooms->myRooms($this->requireUserId($request)));
    }

    #[RateLimit(create: 2, capacity: 8, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function start(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->start($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 4, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function config(string $code, RequestInterface $request): array
    {
        $goal = (int) $request->input('goal', 0);
        return $this->ok($this->rooms->config($code, $this->requireUserId($request), $goal));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function roll(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->roll($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 8, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function item(string $code, RequestInterface $request): array
    {
        $itemId = (string) $request->input('id', '');
        if ($itemId === '') {
            throw new BizException(422, '道具编号不正确');
        }
        $target = $request->input('target');
        $targetSeat = $target === null ? null : (int) $target;
        return $this->ok($this->rooms->playItem($code, $this->requireUserId($request), $itemId, $targetSeat));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function move(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->move($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function choose(string $code, RequestInterface $request): array
    {
        $value = $request->input('value');
        return $this->ok($this->rooms->choose($code, $this->requireUserId($request), (string) ($value ?? '')));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function duel(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->duel($code, $this->requireUserId($request), $request->input('value')));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function bet(string $code, RequestInterface $request): array
    {
        $onSeat = (int) $request->input('on', -1);
        return $this->ok($this->rooms->bet($code, $this->requireUserId($request), $onSeat));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function auto(string $code, RequestInterface $request): array
    {
        $on = (bool) $request->input('on', false);
        return $this->ok($this->rooms->toggleAuto($code, $this->requireUserId($request), $on));
    }

    #[RateLimit(create: 2, capacity: 6, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function save(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->save($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 2, capacity: 6, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function resume(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->resume($code, $this->requireUserId($request)));
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
