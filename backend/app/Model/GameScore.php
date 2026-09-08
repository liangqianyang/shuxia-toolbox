<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 单机游戏最好成绩（排行榜）：UNIQUE(game_key, user_id) 保每用户最好，
 * idx_game_score 支撑排行榜扫描。首个使用者为俄罗斯方块（tetris）。
 *
 * @property int $id
 * @property string $game_key
 * @property int $user_id
 * @property int $score
 * @property int $lines_cleared
 * @property int $level
 * @property string $created_at
 * @property string $updated_at
 */
final class GameScore extends Model
{
    protected ?string $table = 'game_scores';

    protected array $fillable = [
        'game_key',
        'user_id',
        'score',
        'lines_cleared',
        'level',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'score' => 'integer',
        'lines_cleared' => 'integer',
        'level' => 'integer',
    ];
}
