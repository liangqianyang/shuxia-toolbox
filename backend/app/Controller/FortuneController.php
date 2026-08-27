<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\FortuneService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;

/**
 * 每日灵签：观音/关帝/月老/答案之书四套签种，每日三签 + 分享加次，AI 大师解签。
 *
 * 签文数据在服务端（App\Data\Fortune\StickLibrary），抽签由服务端 random_int 权威抽取，
 * 前端只做动画与展示；掷杯为纯前端彩蛋，不占配额也不落库。
 */
final class FortuneController extends AbstractController
{
    public function __construct(
        private readonly FortuneService $fortune,
        private readonly WechatUserService $users,
    ) {}

    /** 今日配额：{limit, used, remaining, bonusLeft, resetAt}。 */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function quota(RequestInterface $request): array
    {
        return $this->ok($this->fortune->quota($this->requireUserId($request)));
    }

    /**
     * 抽签：{deck, category, question?} → {drawId, deck, stick, quota}。
     * 配额耗尽抛 429「今日三签已用完」。
     */
    #[RateLimit(create: 3, capacity: 6, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function draw(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $openid = $this->requireOpenid($request);

        $deck = trim((string) $request->input('deck', ''));
        $category = trim((string) $request->input('category', 'other'));
        $question = $request->input('question');
        $question = is_string($question) ? mb_substr(trim($question), 0, 200) : null;

        return $this->ok($this->fortune->draw($userId, $openid, $deck, $category, $question));
    }

    /** AI 解签：{drawId} → {reading:{meaning,forYou,action,luckyHint}}（同签缓存，重复请求不调 AI）。 */
    #[RateLimit(create: 1, capacity: 2, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function interpret(RequestInterface $request): array
    {
        $userId = $this->requireUserId($request);
        $drawId = (int) $request->input('drawId', 0);
        if ($drawId <= 0) {
            throw new BizException(422, '缺少抽签记录 id');
        }

        return $this->ok(['reading' => $this->fortune->interpret($userId, $drawId)]);
    }

    /** 分享加次：每日最多 +2，返回最新配额。 */
    #[RateLimit(create: 5, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function shareBonus(RequestInterface $request): array
    {
        return $this->ok($this->fortune->shareBonus($this->requireUserId($request)));
    }

    /** 我的抽签历史（倒序分页）：?page=1 → {items, page, hasMore}。 */
    #[RateLimit(create: 10, capacity: 20, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function history(RequestInterface $request): array
    {
        $page = (int) $request->input('page', 1);

        return $this->ok($this->fortune->history($this->requireUserId($request), $page));
    }

    /** 从 X-User-Token 读取当前用户。 */
    private function requireUserId(RequestInterface $request): int
    {
        $token = (string) $request->header('X-User-Token', '');
        $userId = $this->users->userIdByToken($token);
        if ($userId === null) {
            throw new BizException(401, '请先微信登录');
        }
        return $userId;
    }

    /** 内容安全检测需要真实 openid（微信 msg_sec_check 接口要求）。 */
    private function requireOpenid(RequestInterface $request): string
    {
        $token = (string) $request->header('X-User-Token', '');
        $openid = $this->users->openidByToken($token);
        if ($openid === null || $openid === '') {
            throw new BizException(401, '请先微信登录');
        }
        return $openid;
    }
}
