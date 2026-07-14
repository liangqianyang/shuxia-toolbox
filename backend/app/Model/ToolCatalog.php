<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 平台工具目录，由运营端控制上架状态与默认排序。
 *
 * @property int $id
 * @property string $tool_key
 * @property string $name
 * @property string $description
 * @property string $icon
 * @property string $route
 * @property bool $is_published
 * @property int $sort_order
 */
final class ToolCatalog extends Model
{
    protected ?string $table = 'tool_catalog';

    protected array $fillable = [
        'tool_key',
        'name',
        'description',
        'icon',
        'route',
        'is_published',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'is_published' => 'boolean',
        'sort_order' => 'integer',
    ];
}
