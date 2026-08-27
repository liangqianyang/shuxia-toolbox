<?php

declare(strict_types=1);

namespace App\Model;

/**
 * UNO 联机房间：code（4 位房间码）唯一，state 存完整对局快照 JSON（含隐藏的牌堆与各人手牌），
 * version 用于轮询增量同步；序列化输出时按用户视角裁剪（手牌私有）。
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
 * @property array<string, string> $seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class UnoRoom extends Model
{
    protected ?string $table = 'uno_rooms';

    protected array $fillable = [
        'code',
        'status',
        'seats',
        'state',
        'version',
        'winner_user_id',
        'win_reason',
        'turn_deadline_at',
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
