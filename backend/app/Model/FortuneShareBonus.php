<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 分享加次记录：每行代表当日 +1 次抽签额度，同一 (user_id, bonus_date) 最多 2 行（Service 层控制）。
 *
 * @property int $id
 * @property int $user_id
 * @property string $bonus_date
 * @property string $created_at
 */
final class FortuneShareBonus extends Model
{
    public const UPDATED_AT = null;

    protected ?string $table = 'fortune_share_bonus';

    protected array $fillable = [
        'user_id',
        'bonus_date',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
    ];
}
