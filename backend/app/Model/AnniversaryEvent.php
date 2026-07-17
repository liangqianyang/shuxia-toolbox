<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 用户纪念日、倒数日与卡片偏好。
 *
 * @property int $id
 * @property int $user_id
 * @property string $title
 * @property string $scene_type
 * @property string $event_date
 * @property string $calendar_type
 * @property null|int $lunar_year
 * @property null|int $lunar_month
 * @property null|int $lunar_day
 * @property bool $is_lunar_leap_month
 * @property string $repeat_type
 * @property string $count_mode
 * @property int $remind_days_before
 * @property null|string $calendar_added_at
 * @property string $calendar_repeat_type
 * @property string $cover_image
 * @property string $card_template
 * @property string $card_tone
 * @property int $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
final class AnniversaryEvent extends Model
{
    protected ?string $table = 'anniversary_events';

    protected array $fillable = [
        'user_id',
        'title',
        'scene_type',
        'event_date',
        'calendar_type',
        'lunar_year',
        'lunar_month',
        'lunar_day',
        'is_lunar_leap_month',
        'repeat_type',
        'count_mode',
        'remind_days_before',
        'calendar_added_at',
        'calendar_repeat_type',
        'cover_image',
        'card_template',
        'card_tone',
        'sort_order',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'lunar_year' => 'integer',
        'lunar_month' => 'integer',
        'lunar_day' => 'integer',
        'is_lunar_leap_month' => 'boolean',
        'remind_days_before' => 'integer',
        'sort_order' => 'integer',
    ];
}
