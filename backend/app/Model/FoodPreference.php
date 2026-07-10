<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 用户“今天想要”偏好标签。
 *
 * @property int $id
 * @property int $user_id
 * @property string $client_id
 * @property string $label
 * @property int $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
final class FoodPreference extends Model
{
    protected ?string $table = 'food_preferences';

    protected array $fillable = [
        'user_id',
        'client_id',
        'label',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'sort_order' => 'integer',
    ];
}
