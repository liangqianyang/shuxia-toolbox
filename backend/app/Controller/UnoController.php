<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\Uno\UnoRoomService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** UNO 联机：房间创建/加入/开局、轮询同步、出牌/摸牌/不出、质疑、喊/举报 UNO、再来一局与离开。 */
final class UnoController extends AbstractController
{
    public function __construct(
        private readonly UnoRoomService $rooms,
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

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function dealerDraw(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->dealerDraw($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function play(string $code, RequestInterface $request): array
    {
        $card = (string) $request->input('card', '');
        $chosenColor = $request->input('chosenColor');
        $chosenColor = is_string($chosenColor) && $chosenColor !== '' ? $chosenColor : null;
        $declaredUno = (bool) $request->input('declaredUno', false);
        return $this->ok($this->rooms->play($code, $this->requireUserId($request), $card, $chosenColor, $declaredUno));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function draw(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->draw($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function pass(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->pass($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function chooseColor(string $code, RequestInterface $request): array
    {
        $color = (string) $request->input('color', '');
        return $this->ok($this->rooms->chooseColor($code, $this->requireUserId($request), $color));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function challenge(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->challenge($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 4, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function declineChallenge(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->declineChallenge($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function declareUno(string $code, RequestInterface $request): array
    {
        return $this->ok($this->rooms->declareUno($code, $this->requireUserId($request)));
    }

    #[RateLimit(create: 6, capacity: 16, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function catchUno(string $code, RequestInterface $request): array
    {
        $seat = (int) $request->input('seat', -1);
        if ($seat < 0 || $seat > 9) {
            throw new BizException(422, '举报目标不正确');
        }
        return $this->ok($this->rooms->catchUno($code, $this->requireUserId($request), $seat));
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
