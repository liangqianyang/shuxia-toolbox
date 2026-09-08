<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\GameScoreService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/** 俄罗斯方块成绩：单机成绩上报（保最好）与排行榜。成绩为客户端上报,服务端只做宽松合理性校验。 */
final class TetrisScoreController extends AbstractController
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
        $lines = (int) $request->input('lines', -1);
        $level = (int) $request->input('level', 0);
        if ($score < 0 || $lines < 0 || $level < 1) {
            throw new BizException(422, '成绩参数不完整');
        }
        return $this->ok($this->scores->submitTetris($userId, $score, $lines, $level));
    }

    #[RateLimit(create: 20, capacity: 40, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function leaderboard(RequestInterface $request): array
    {
        $limit = (int) $request->input('limit', 50);
        // 未带有效 token 时仅看榜单;带 token 附我的名次
        $userId = $this->users->userIdByToken((string) $request->header('X-User-Token', ''));
        return $this->ok($this->scores->tetrisLeaderboard($limit, $userId));
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
