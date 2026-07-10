<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 用户饭池分组（公司午餐、家附近晚餐等场景）。
 *
 * @property int $id
 * @property int $user_id
 * @property string $client_id
 * @property string $name
 * @property int $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
final class FoodPoolGroup extends Model
{
    protected ?string $table = 'food_pool_groups';

    protected array $fillable = [
        'user_id',
        'client_id',
        'name',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'sort_order' => 'integer',
    ];
}
