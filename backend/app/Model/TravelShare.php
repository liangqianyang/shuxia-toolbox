<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 旅游行程分享记录。
 *
 * @property int $id
 * @property string $code
 * @property string $title
 * @property array<string, mixed> $payload
 * @property string $created_at
 * @property string $updated_at
 */
final class TravelShare extends Model
{
    protected ?string $table = 'travel_shares';

    protected array $fillable = [
        'code',
        'title',
        'payload',
    ];

    protected array $casts = [
        'id' => 'integer',
        'payload' => 'array',
    ];
}
