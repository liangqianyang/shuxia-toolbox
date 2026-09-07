<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 纪念日共享成员：一行 = 某用户在某事件里的角色与个人偏好。
 * owner 也是成员（创建事件时写入 role=owner 行）；个人偏好每人一份。
 *
 * @property int $id
 * @property int $anniversary_event_id
 * @property int $user_id
 * @property string $role              owner / editor / viewer
 * @property int $remind_days_before
 * @property string $remind_time
 * @property string $card_template
 * @property string $card_tone
 * @property string $cover_image
 * @property null|string $calendar_added_at
 * @property string $calendar_repeat_type
 * @property string $created_at
 * @property null|string $updated_at
 */
final class AnniversaryMember extends Model
{
    protected ?string $table = 'anniversary_members';

    protected array $fillable = [
        'anniversary_event_id',
        'user_id',
        'role',
        'remind_days_before',
        'remind_time',
        'card_template',
        'card_tone',
        'cover_image',
        'calendar_added_at',
        'calendar_repeat_type',
    ];

    protected array $casts = [
        'id' => 'integer',
        'anniversary_event_id' => 'integer',
        'user_id' => 'integer',
        'remind_days_before' => 'integer',
    ];
}
