<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 用户饭池条目。
 *
 * @property int $id
 * @property int $user_id
 * @property string $client_id
 * @property string $group_id
 * @property string $name
 * @property string $note
 * @property string $address
 * @property null|float $lat
 * @property null|float $lng
 * @property string $source
 * @property int $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
final class FoodPoolItem extends Model
{
    protected ?string $table = 'food_pool_items';

    protected array $fillable = [
        'user_id',
        'client_id',
        'group_id',
        'name',
        'note',
        'address',
        'lat',
        'lng',
        'source',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'lat' => 'float',
        'lng' => 'float',
        'sort_order' => 'integer',
    ];
}
