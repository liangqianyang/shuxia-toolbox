<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 抽签记录：deck+stick_no 指向签文数据，ai_reading 缓存 AI 解签 JSON。
 * 同时充当每日三签的配额计数数据源（按 user_id + created_at 当日计数）。
 *
 * @property int $id
 * @property int $user_id
 * @property string $deck
 * @property string $category
 * @property ?string $question
 * @property int $stick_no
 * @property string $level
 * @property ?string $ai_reading
 * @property string $created_at
 */
final class FortuneDraw extends Model
{
    public const UPDATED_AT = null;

    protected ?string $table = 'fortune_draws';

    protected array $fillable = [
        'user_id',
        'deck',
        'category',
        'question',
        'stick_no',
        'level',
        'ai_reading',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'stick_no' => 'integer',
    ];
}
