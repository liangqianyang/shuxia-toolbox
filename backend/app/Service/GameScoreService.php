<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use App\Model\GameScore;
use App\Model\WechatUser;

/** 单机游戏成绩：提交（保最好）与排行榜。防刷是宽松合理性校验而非安全边界——成绩由客户端上报，只挡明显编造值。 */
final class GameScoreService
{
    public const GAME_TETRIS = 'tetris';

    private const MAX_SCORE = 10000000;
    private const MAX_LINES = 10000;
    private const MAX_LEVEL = 30;
    private const MAX_START_LEVEL = 15;

    /**
     * 提交俄罗斯方块成绩：校验合理性 → 保最好（新分更高才更新）→ 返回最好成绩与名次。
     *
     * @return array{best: int, isNewBest: bool, rank: int}
     */
    public function submitTetris(int $userId, int $score, int $lines, int $level): array
    {
        $this->assertTetrisPlausible($score, $lines, $level);

        /** @var null|GameScore $row */
        $row = GameScore::query()
            ->where('game_key', self::GAME_TETRIS)
            ->where('user_id', $userId)
            ->first();
        $isNewBest = $row === null || $score > (int) $row->score;
        if ($isNewBest) {
            // UNIQUE(game_key, user_id) 兜底并发：冲突时以更小店内数据为准重读一次
            GameScore::query()->updateOrCreate(
                ['game_key' => self::GAME_TETRIS, 'user_id' => $userId],
                ['score' => $score, 'lines_cleared' => $lines, 'level' => $level],
            );
        }

        $best = $isNewBest ? $score : (int) $row->score;
        return [
            'best' => $best,
            'isNewBest' => $isNewBest,
            'rank' => $this->rankOf(self::GAME_TETRIS, $best),
        ];
    }

    /**
     * 俄罗斯方块排行榜：按分数降序（同分先到先得），附我的名次（未登录/未上榜为 null）。
     *
     * @return array{entries: array<int, array{rank: int, nickname: string, avatarUrl: string, score: int, lines: int, level: int}>, mine: null|array{rank: int, score: int, lines: int, level: int}}
     */
    public function tetrisLeaderboard(int $limit, ?int $userId): array
    {
        $limit = max(1, min(100, $limit));
        /** @var array<int, GameScore> $rows */
        $rows = GameScore::query()
            ->where('game_key', self::GAME_TETRIS)
            ->orderByDesc('score')
            ->orderBy('id')
            ->limit($limit)
            ->get()
            ->all();

        // 昵称头像单独查用户表再映射（避免 join 在 hyperf/database 下的 API 差异）
        $userIds = array_values(array_unique(array_map(static fn(GameScore $r): int => (int) $r->user_id, $rows)));
        $usersById = [];
        if ($userIds !== []) {
            /** @var array<int, WechatUser> $users */
            $users = WechatUser::query()->whereIn('id', $userIds)->get()->all();
            foreach ($users as $user) {
                $usersById[(int) $user->id] = $user;
            }
        }

        $entries = [];
        foreach ($rows as $index => $row) {
            $user = $usersById[(int) $row->user_id] ?? null;
            $entries[] = [
                'rank' => $index + 1,
                'nickname' => $user !== null && (string) $user->nickname !== '' ? (string) $user->nickname : '枫友',
                'avatarUrl' => $user !== null ? (string) $user->avatar_url : '',
                'score' => (int) $row->score,
                'lines' => (int) $row->lines_cleared,
                'level' => (int) $row->level,
            ];
        }

        $mine = null;
        if ($userId !== null) {
            /** @var null|GameScore $mineRow */
            $mineRow = GameScore::query()
                ->where('game_key', self::GAME_TETRIS)
                ->where('user_id', $userId)
                ->first();
            if ($mineRow !== null) {
                $mine = [
                    'rank' => $this->rankOf(self::GAME_TETRIS, (int) $mineRow->score),
                    'score' => (int) $mineRow->score,
                    'lines' => (int) $mineRow->lines_cleared,
                    'level' => (int) $mineRow->level,
                ];
            }
        }

        return ['entries' => $entries, 'mine' => $mine];
    }

    /** 名次 = 同游戏更高分数量 + 1（同分并列时由 id 序决定展示先后，名次一致）。 */
    private function rankOf(string $gameKey, int $score): int
    {
        return 1 + GameScore::query()
            ->where('game_key', $gameKey)
            ->where('score', '>', $score)
            ->count();
    }

    /** 宽松合理性：挡住明显编造的成绩（7 位数分数/超速升级/零行高分），不追求严密。 */
    private function assertTetrisPlausible(int $score, int $lines, int $level): void
    {
        if ($score < 0 || $score > self::MAX_SCORE) {
            throw new BizException(422, '成绩无效');
        }
        if ($lines < 0 || $lines > self::MAX_LINES) {
            throw new BizException(422, '成绩无效');
        }
        if ($level < 1 || $level > self::MAX_LEVEL) {
            throw new BizException(422, '成绩无效');
        }
        // 零消行不该有高分（只剩软/硬降分,封顶 5000）
        if ($lines === 0 && $score > 5000) {
            throw new BizException(422, '成绩无效');
        }
        // 每行理论最高 200×等级（四连消）+ 落点分余量：×300 再加 1 万头寸足够宽松
        if ($score > $lines * 300 * $level + 10000) {
            throw new BizException(422, '成绩无效');
        }
        // 起始 ≤15 级、每 10 行 +1 级,容差 2 级
        if ($level > self::MAX_START_LEVEL + intdiv($lines, 10) + 2) {
            throw new BizException(422, '成绩无效');
        }
    }
}
