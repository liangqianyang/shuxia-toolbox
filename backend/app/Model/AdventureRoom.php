<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 枫趣冒险联机房间：code（4 位房间码）唯一，state 存完整对局快照 JSON（位置/枫叶/道具/天气/窗口等），
 * version 用于轮询增量同步。有隐藏信息（道具手牌/埋伏归属/决斗暗出），serialize 按请求者视角裁剪。
 * status 含 saved（房主保存的暂停局，paused_at 记录时间，7 天过期）。
 *
 * @property int $id
 * @property string $code
 * @property string $status
 * @property array<int, int> $seats
 * @property array<string, mixed> $state
 * @property int $version
 * @property null|int $winner_user_id
 * @property null|string $win_reason
 * @property null|string $turn_deadline_at
 * @property null|string $paused_at
 * @property array<string, string> $seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class AdventureRoom extends Model
{
    protected ?string $table = 'adventure_rooms';

    protected array $fillable = [
        'code',
        'status',
        'seats',
        'state',
        'version',
        'winner_user_id',
        'win_reason',
        'turn_deadline_at',
        'paused_at',
        'seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'version' => 'integer',
        'winner_user_id' => 'integer',
        'seats' => 'array',
        'state' => 'array',
        'seen_at' => 'array',
    ];
}
