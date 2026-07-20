<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 纪念日订阅消息记录：一次授权 = 一条待发送的提醒。
 *
 * @property int $id
 * @property int $user_id
 * @property int $anniversary_event_id
 * @property string $template_id
 * @property null|string $next_occurrence_date
 * @property string $status          pending / sent / expired
 * @property string $subscribed_at
 * @property null|string $sent_at
 * @property string $created_at
 * @property null|string $updated_at
 */
final class AnniversarySubscription extends Model
{
    protected ?string $table = 'anniversary_subscriptions';

    protected array $fillable = [
        'user_id',
        'anniversary_event_id',
        'template_id',
        'next_occurrence_date',
        'status',
        'subscribed_at',
        'sent_at',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'user_id' => 'integer',
        'anniversary_event_id' => 'integer',
    ];

    public bool $timestamps = false;
}
