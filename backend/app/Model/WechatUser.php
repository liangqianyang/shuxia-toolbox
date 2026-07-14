<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 微信小程序用户。
 *
 * @property int $id
 * @property string $openid
 * @property null|string $unionid
 * @property string $nickname
 * @property string $avatar_url
 * @property string $role
 * @property string $created_at
 * @property string $updated_at
 */
final class WechatUser extends Model
{
    protected ?string $table = 'wechat_users';

    protected array $fillable = [
        'openid',
        'unionid',
        'nickname',
        'avatar_url',
        'role',
    ];

    protected array $casts = [
        'id' => 'integer',
    ];
}
