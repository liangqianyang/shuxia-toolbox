<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 纪念日共享邀请：一次性、24 小时有效；owner 可并存多个 pending 邀请。
 *
 * @property int $id
 * @property string $code
 * @property int $anniversary_event_id
 * @property int $inviter_user_id
 * @property string $role              editor / viewer
 * @property string $status            pending / accepted / expired
 * @property string $expires_at
 * @property null|int $accepted_by
 * @property null|string $accepted_at
 * @property string $created_at
 * @property null|string $updated_at
 */
final class AnniversaryInvite extends Model
{
    protected ?string $table = 'anniversary_invites';

    protected array $fillable = [
        'code',
        'anniversary_event_id',
        'inviter_user_id',
        'role',
        'status',
        'expires_at',
        'accepted_by',
        'accepted_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'anniversary_event_id' => 'integer',
        'inviter_user_id' => 'integer',
        'accepted_by' => 'integer',
    ];
}
