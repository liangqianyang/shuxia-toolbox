<?php

declare(strict_types=1);

namespace App\Model;

/** 用户选择在首页展示的工具及其顺序。 */
final class UserToolPreference extends Model
{
    protected ?string $table = 'user_tool_preferences';

    protected array $fillable = [
        'user_id',
        'tool_key',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'sort_order' => 'integer',
    ];
}
