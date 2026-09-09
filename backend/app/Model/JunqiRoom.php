<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 联机军棋（两人暗棋）房间：code（4 位房间码）唯一，pieces 存双方 50 子快照 JSON，version 用于轮询增量同步。
 * 暗棋信息裁剪不在此层——序列化按请求者视角裁剪在 MountainChessRoomService::serialize。
 *
 * @property int $id
 * @property string $code
 * @property int $red_user_id
 * @property int $blue_user_id
 * @property string $status
 * @property array<int, array{side: string, rank: string, r: int, c: int, alive: bool, revealed: bool}> $pieces
 * @property null|array{red: bool, blue: bool} $ready
 * @property null|string $turn
 * @property null|array{fr: int, fc: int, tr: int, tc: int, result: string, captured: null|string} $last_move
 * @property null|array{seq: int, type: string, text: string} $last_event
 * @property null|array{red: bool, blue: bool} $flag_revealed
 * @property int $version
 * @property int $ply
 * @property null|string $winner
 * @property null|string $win_reason
 * @property null|array{round: int, picks: array<string, int>, lastPicks?: array<string, int>, winner: null|string} $rps
 * @property null|string $turn_deadline_at
 * @property null|array<int, array<string, mixed>> $chat
 * @property null|array<string, int> $chat_last_at
 * @property null|string $red_seen_at
 * @property null|string $blue_seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class JunqiRoom extends Model
{
    protected ?string $table = 'junqi_rooms';

    protected array $fillable = [
        'code',
        'red_user_id',
        'blue_user_id',
        'status',
        'pieces',
        'ready',
        'turn',
        'last_move',
        'last_event',
        'flag_revealed',
        'version',
        'ply',
        'winner',
        'win_reason',
        'rps',
        'turn_deadline_at',
        'chat',
        'chat_last_at',
        'red_seen_at',
        'blue_seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'red_user_id' => 'integer',
        'blue_user_id' => 'integer',
        'version' => 'integer',
        'ply' => 'integer',
        'pieces' => 'array',
        'ready' => 'array',
        'last_move' => 'array',
        'last_event' => 'array',
        'flag_revealed' => 'array',
        'rps' => 'array',
        'chat' => 'array',
        'chat_last_at' => 'array',
    ];
}
