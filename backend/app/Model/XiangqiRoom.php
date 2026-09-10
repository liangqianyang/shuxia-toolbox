<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 联机象棋房间：code（4 位房间码）唯一，pieces 存双方 32 子快照 JSON（明棋全量），version 用于轮询增量同步。
 *
 * @property int $id
 * @property string $code
 * @property int $red_user_id
 * @property int $blue_user_id
 * @property string $status
 * @property array<int, array{side: string, piece: string, r: int, c: int, alive: bool}> $pieces
 * @property null|string $turn
 * @property null|array{fr: int, fc: int, tr: int, tc: int, captured: null|string} $last_move
 * @property null|array{seq: int, type: string, text: string} $last_event
 * @property int $version
 * @property int $ply
 * @property null|string $winner
 * @property null|string $win_reason
 * @property null|array{round: int, picks: array<string, int>, lastPicks?: array<string, int>, winner: null|string} $rps
 * @property null|string $turn_deadline_at
 * @property null|array<int, array<string, mixed>> $chat
 * @property null|array<string, int> $chat_last_at
 * @property null|string $red_seen_at
 * @property null|string $black_seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class XiangqiRoom extends Model
{
    protected ?string $table = 'xiangqi_rooms';

    protected array $fillable = [
        'code',
        'red_user_id',
        'blue_user_id',
        'status',
        'pieces',
        'turn',
        'last_move',
        'last_event',
        'version',
        'ply',
        'winner',
        'win_reason',
        'rps',
        'turn_deadline_at',
        'chat',
        'chat_last_at',
        'red_seen_at',
        'black_seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'red_user_id' => 'integer',
        'blue_user_id' => 'integer',
        'version' => 'integer',
        'ply' => 'integer',
        'pieces' => 'array',
        'last_move' => 'array',
        'last_event' => 'array',
        'rps' => 'array',
        'chat' => 'array',
        'chat_last_at' => 'array',
    ];
}
