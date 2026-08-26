<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 联机五子棋房间：code（4 位房间码）唯一，moves 存有序落子 JSON，version 用于轮询增量同步。
 *
 * @property int $id
 * @property string $code
 * @property int $black_user_id
 * @property int $white_user_id
 * @property string $status
 * @property array<int, array{x: int, y: int}> $moves
 * @property int $version
 * @property null|string $winner
 * @property null|array<int, array<int, int>> $win_line
 * @property null|string $win_reason
 * @property int $undo_black
 * @property int $undo_white
 * @property null|string $undo_pending
 * @property null|string $undo_pending_at
 * @property null|string $black_seen_at
 * @property null|string $white_seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class GomokuRoom extends Model
{
    protected ?string $table = 'gomoku_rooms';

    protected array $fillable = [
        'code',
        'black_user_id',
        'white_user_id',
        'status',
        'moves',
        'version',
        'winner',
        'win_line',
        'win_reason',
        'undo_black',
        'undo_white',
        'undo_pending',
        'undo_pending_at',
        'black_seen_at',
        'white_seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'black_user_id' => 'integer',
        'white_user_id' => 'integer',
        'version' => 'integer',
        'undo_black' => 'integer',
        'undo_white' => 'integer',
        'moves' => 'array',
        'win_line' => 'array',
    ];
}
