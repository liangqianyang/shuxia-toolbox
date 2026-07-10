<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 后端登录会话：surrogate id 主键，token_hash 唯一。
 *
 * 只有 created_at / last_seen_at，无 updated_at，故关闭自动时间戳、手动维护。
 *
 * @property int $id
 * @property string $token_hash
 * @property int $user_id
 * @property string $expires_at
 * @property string $created_at
 * @property string $last_seen_at
 */
final class UserSession extends Model
{
    protected ?string $table = 'user_sessions';

    public bool $timestamps = false;

    protected array $fillable = [
        'token_hash',
        'user_id',
        'expires_at',
        'created_at',
        'last_seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
    ];
}
