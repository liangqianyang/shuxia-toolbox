<?php

declare(strict_types=1);

namespace App\Model;

/**
 * 联机井字棋房间：code（4 位房间码）唯一，board 存 9 格快照 JSON，scores 连绩跨局累计。
 *
 * @property int $id
 * @property string $code
 * @property int $x_user_id
 * @property int $o_user_id
 * @property string $status
 * @property array<int, null|string> $board
 * @property null|string $turn
 * @property null|array{x: int, o: int, draw: int} $scores
 * @property null|int $win_line
 * @property null|string $winner
 * @property null|string $win_reason
 * @property null|array{round: int, picks: array<string, int>, lastPicks?: array<string, int>, winner: null|string} $rps
 * @property null|string $turn_deadline_at
 * @property int $version
 * @property null|array{seq: int, type: string, text: string} $last_event
 * @property null|array<int, array<string, mixed>> $chat
 * @property null|array<string, int> $chat_last_at
 * @property null|string $x_seen_at
 * @property null|string $o_seen_at
 * @property string $created_at
 * @property string $updated_at
 */
final class TictactoeRoom extends Model
{
    protected ?string $table = 'tictactoe_rooms';

    protected array $fillable = [
        'code',
        'x_user_id',
        'o_user_id',
        'status',
        'board',
        'turn',
        'scores',
        'win_line',
        'winner',
        'win_reason',
        'rps',
        'turn_deadline_at',
        'version',
        'last_event',
        'chat',
        'chat_last_at',
        'x_seen_at',
        'o_seen_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'x_user_id' => 'integer',
        'o_user_id' => 'integer',
        'version' => 'integer',
        'win_line' => 'integer',
        'board' => 'array',
        'scores' => 'array',
        'rps' => 'array',
        'last_event' => 'array',
        'chat' => 'array',
        'chat_last_at' => 'array',
    ];
}
