<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 饭局房间：surrogate id 主键，code（4 位饭局码）唯一，payload 存前端饭局状态 JSON。
 *
 * @property int $id
 * @property string $code
 * @property int $owner_user_id
 * @property array<string, mixed> $payload
 * @property string $created_at
 * @property string $updated_at
 */
final class FoodRoom extends Model
{
    protected ?string $table = 'food_rooms';

    protected array $fillable = [
        'code',
        'owner_user_id',
        'payload',
    ];

    protected array $casts = [
        'id' => 'integer',
        'owner_user_id' => 'integer',
        'payload' => 'array',
    ];
}
