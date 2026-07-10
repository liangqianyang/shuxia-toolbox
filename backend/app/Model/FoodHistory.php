<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 用户吃过历史。只有 created_at，无 updated_at，关闭自动时间戳。
 *
 * @property int $id
 * @property int $user_id
 * @property string $client_id
 * @property string $name
 * @property string $eaten_at
 * @property int $sort_order
 * @property string $created_at
 */
final class FoodHistory extends Model
{
    protected ?string $table = 'food_history';

    public bool $timestamps = false;

    protected array $fillable = [
        'user_id',
        'client_id',
        'name',
        'eaten_at',
        'sort_order',
        'created_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'sort_order' => 'integer',
    ];
}
