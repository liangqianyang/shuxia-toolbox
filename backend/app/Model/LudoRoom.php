<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 飞行棋联机房间：code（4 位房间码）唯一，state 存完整对局快照 JSON（飞机坐标/回合阶段/托管标记等），
 * version 用于轮询增量同步；飞行棋无隐藏信息，序列化输出不做视角裁剪。
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
final class LudoRoom extends Model
{
    protected ?string $table = 'ludo_rooms';

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
