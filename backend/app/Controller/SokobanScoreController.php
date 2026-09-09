<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\GameScoreService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 推箱子成绩：总星数上报（保最好）与收星总榜。进度明细在客户端本地,服务端只存聚合值。 */
final class SokobanScoreController extends AbstractController
{
    public function __construct(
        private readonly GameScoreService $scores,
        private readonly WechatUserService $users,
    ) {}

    #[RateLimit(create: 6, capacity: 12, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function submit(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $score = (int) $request->input('score', -1);
        $levels = (int) $request->input('levels', -1);
        if ($score < 0 || $levels < 0) {
            throw new BizException(422, '成绩参数不完整');
        }
        return $this->ok($this->scores->submitSokoban($userId, $score, $levels));
    }

    #[RateLimit(create: 20, capacity: 40, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function leaderboard(RequestInterface $request): array
    {
        $limit = (int) $request->input('limit', 50);
        // 未带有效 token 时仅看榜单;带 token 附我的名次
        $userId = $this->users->userIdByToken((string) $request->header('X-User-Token', ''));
        return $this->ok($this->scores->sokobanLeaderboard($limit, $userId));
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
