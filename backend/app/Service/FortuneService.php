<?php

declare(strict_types=1);

namespace App\Service;

use App\Data\Fortune\StickLibrary;
use App\Exception\BizException;
use App\Model\FortuneDraw;
use App\Model\FortuneShareBonus;
use App\Service\Fortune\FortuneInterpreter;
use Hyperf\DbConnection\Db;
use Hyperf\Logger\LoggerFactory;
use RuntimeException;
use Throwable;

/**
 * 每日灵签：抽签、每日配额（3 次 + 分享加次 ≤2）、历史、AI 解签缓存。
 *
 * 配额计数直接落在 fortune_draws 当日行数上（项目内无 Redis 日配额先例，DB 计数更符合现有风格）。
 * 抽签在事务内先锁 wechat_users 行（行锁序列化同一用户的并发抽签），再校验配额，防双击超抽。
 */
final class FortuneService
{
    public const int DAILY_LIMIT = 3;

    public const int SHARE_BONUS_MAX = 2;

    /** 所问分类白名单（key => 展示名）。 */
    public const array CATEGORIES = [
        'luck' => '运势',
        'career' => '事业',
        'wealth' => '财运',
        'love' => '姻缘',
        'health' => '健康',
        'study' => '学业',
        'decision' => '抉择',
        'other' => '其他',
    ];

    public function __construct(
        private readonly FortuneInterpreter $interpreter,
        private readonly WechatContentSecurityService $security,
        private readonly LoggerFactory $loggerFactory,
    ) {}

    /** 今日配额：剩余次数/已用分享加次/重置时间。 */
    public function quota(int $userId): array
    {
        $draws = $this->drawsToday($userId);
        $bonus = $this->bonusToday($userId);

        return [
            'limit' => self::DAILY_LIMIT + $bonus,
            'used' => $draws,
            'remaining' => max(0, self::DAILY_LIMIT + $bonus - $draws),
            'bonusLeft' => max(0, self::SHARE_BONUS_MAX - $bonus),
            'resetAt' => date('Y-m-d 00:00:00', strtotime('+1 day')),
        ];
    }

    /**
     * 抽一支签：服务端 random_int 权威随机（防前端刷签级），扣当日配额，落库后返回签文全文。
     *
     * @return array{drawId: int, deck: string, stick: array<string, mixed>, quota: array<string, int|string>}
     */
    public function draw(int $userId, string $openid, string $deck, string $category, ?string $question): array
    {
        if (! StickLibrary::isDeck($deck)) {
            throw new BizException(422, '未知签种');
        }
        if (! isset(self::CATEGORIES[$category])) {
            throw new BizException(422, '未知问事分类');
        }
        // 月老灵签专问姻缘（前端会隐藏其他分类，这里防直接调接口绕过）。
        if ($deck === 'yuelao' && $category !== 'love') {
            throw new BizException(422, '月老灵签专问姻缘');
        }

        $question = $question !== null ? trim($question) : null;
        if ($question === '') {
            $question = null;
        }
        if ($question !== null) {
            // 用户输入内容必须过微信内容安全检测（小程序审核要求）。
            try {
                if (! $this->security->checkText($question, $openid)) {
                    throw new BizException(422, '所问内容包含不适宜信息，请换一个问题');
                }
            } catch (BizException $e) {
                throw $e;
            } catch (Throwable $e) {
                throw new BizException(500, '内容安全检测失败：' . $e->getMessage(), null, $e);
            }
        }

        try {
            return Db::transaction(function () use ($userId, $deck, $category, $question) {
                // 锁用户行，序列化同一用户的并发抽签（双击/重试不会突破配额）。
                Db::table('wechat_users')->where('id', $userId)->lockForUpdate()->first();

                $quota = $this->quota($userId);
                if ($quota['remaining'] <= 0) {
                    throw new BizException(429, '今日三签已用完，分享给好友可加签，或明日再来');
                }

                $count = StickLibrary::count($deck);
                $stickNo = random_int(1, $count);
                $stick = StickLibrary::stick($deck, $stickNo);
                if ($stick === null) {
                    throw new RuntimeException("签文缺失：{$deck}#{$stickNo}");
                }

                $draw = new FortuneDraw();
                $draw->fill([
                    'user_id' => $userId,
                    'deck' => $deck,
                    'category' => $category,
                    'question' => $question,
                    'stick_no' => $stickNo,
                    'level' => (string) ($stick['level'] ?? ''),
                ]);
                $draw->save();

                return [
                    'drawId' => $draw->id,
                    'deck' => $deck,
                    'stick' => $stick,
                    'quota' => $this->quota($userId),
                ];
            });
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '抽签失败：' . $e->getMessage(), null, $e);
        }
    }

    /**
     * AI 解签：同一支签只解一次，结果缓存在 fortune_draws.ai_reading。
     *
     * @return array<string, string> {meaning, forYou, action, luckyHint}
     */
    public function interpret(int $userId, int $drawId): array
    {
        $draw = FortuneDraw::query()->where('id', $drawId)->where('user_id', $userId)->first();
        if (! $draw instanceof FortuneDraw) {
            throw new BizException(404, '抽签记录不存在');
        }

        if (is_string($draw->ai_reading) && $draw->ai_reading !== '') {
            $cached = json_decode($draw->ai_reading, true);
            if (is_array($cached) && isset($cached['meaning'])) {
                return $cached;
            }
        }

        $stick = StickLibrary::stick($draw->deck, $draw->stick_no);
        if ($stick === null) {
            throw new BizException(500, '签文数据缺失');
        }

        try {
            $reading = $this->interpreter->interpret(
                $draw->deck,
                $stick,
                self::CATEGORIES[$draw->category] ?? '其他',
                $draw->question,
            );
        } catch (Throwable $e) {
            // 厂商错误（401/超时等）含 URL 等技术细节，只记日志，对用户返回友好文案。
            $this->loggerFactory->get('fortune', 'default')->warning('AI 解签失败: ' . $e->getMessage());
            throw new BizException(500, '解签大师暂时忙碌，请稍后再试', null, $e);
        }

        $draw->ai_reading = json_encode($reading, JSON_UNESCAPED_UNICODE);
        $draw->save();

        return $reading;
    }

    /** 分享加次：每日最多 +2，返回最新配额。 */
    public function shareBonus(int $userId): array
    {
        try {
            return Db::transaction(function () use ($userId) {
                Db::table('wechat_users')->where('id', $userId)->lockForUpdate()->first();

                if ($this->bonusToday($userId) >= self::SHARE_BONUS_MAX) {
                    throw new BizException(429, '今日分享加次已用完');
                }

                $bonus = new FortuneShareBonus();
                $bonus->fill(['user_id' => $userId, 'bonus_date' => date('Y-m-d')]);
                $bonus->save();

                return $this->quota($userId);
            });
        } catch (BizException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new BizException(500, '分享加次失败：' . $e->getMessage(), null, $e);
        }
    }

    /** 我的抽签历史（倒序分页），含签文与 AI 解读供回看。 */
    public function history(int $userId, int $page): array
    {
        $pageSize = 20;
        $page = max(1, $page);

        // 项目未装 hyperf/paginator，多取一条判断是否还有下一页。
        $rows = FortuneDraw::query()
            ->where('user_id', $userId)
            ->orderByDesc('id')
            ->offset(($page - 1) * $pageSize)
            ->limit($pageSize + 1)
            ->get();

        $hasMore = $rows->count() > $pageSize;
        $items = [];
        foreach ($rows->take($pageSize) as $draw) {
            /** @var FortuneDraw $draw */
            $stick = StickLibrary::stick($draw->deck, $draw->stick_no) ?? [];
            $reading = null;
            if (is_string($draw->ai_reading) && $draw->ai_reading !== '') {
                $decoded = json_decode($draw->ai_reading, true);
                $reading = is_array($decoded) ? $decoded : null;
            }
            $items[] = [
                'drawId' => $draw->id,
                'deck' => $draw->deck,
                'deckName' => StickLibrary::DECKS[$draw->deck]['name'] ?? $draw->deck,
                'category' => $draw->category,
                'categoryName' => self::CATEGORIES[$draw->category] ?? '其他',
                'question' => $draw->question,
                'stick' => $stick,
                'reading' => $reading,
                'createdAt' => (string) $draw->created_at,
            ];
        }

        return [
            'items' => $items,
            'page' => $page,
            'hasMore' => $hasMore,
        ];
    }

    private function drawsToday(int $userId): int
    {
        return FortuneDraw::query()
            ->where('user_id', $userId)
            ->where('created_at', '>=', date('Y-m-d 00:00:00'))
            ->count();
    }

    private function bonusToday(int $userId): int
    {
        return FortuneShareBonus::query()
            ->where('user_id', $userId)
            ->where('bonus_date', date('Y-m-d'))
            ->count();
    }
}
