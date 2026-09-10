<?php

declare(strict_types=1);

namespace App\Service\Tictactoe;

use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\WebSocketServer\Sender;
use Throwable;

/**
 * 井字棋房间 WebSocket 连接表 + 状态推送（照象棋/军棋同构）。
 */
final class TictactoeWsPusher
{
    /** @var array<string, array<int, int>> code → [fd → userId]；静态保证跨注入实例共享同一连接表 */
    private static array $roomFds = [];

    /** @var array<int, array{code: string, userId: int}> fd → 归属 */
    private static array $fdMeta = [];

    public function join(string $code, int $fd, int $userId): void
    {
        $this->leave($fd);
        self::$roomFds[$code][$fd] = $userId;
        self::$fdMeta[$fd] = ['code' => $code, 'userId' => $userId];
    }

    public function leave(int $fd): void
    {
        $meta = self::$fdMeta[$fd] ?? null;
        if ($meta === null) {
            return;
        }
        unset(self::$roomFds[$meta['code']][$fd], self::$fdMeta[$fd]);
        if (isset(self::$roomFds[$meta['code']]) && self::$roomFds[$meta['code']] === []) {
            unset(self::$roomFds[$meta['code']]);
        }
    }

    /**
     * @param callable(int $userId): ?array<string, mixed> $stateFactory 按用户生成其视角的状态；null 跳过
     */
    public function pushRoom(string $code, callable $stateFactory): void
    {
        $fds = self::$roomFds[$code] ?? [];
        if ($fds === []) {
            return;
        }
        $sender = $this->sender();
        if ($sender === null) {
            return;
        }
        foreach ($fds as $fd => $userId) {
            $state = $stateFactory($userId);
            if ($state === null) {
                continue;
            }
            try {
                $sender->push($fd, json_encode(['type' => 'state', 'state' => $state], JSON_UNESCAPED_UNICODE));
            } catch (Throwable $e) {
                $this->leave($fd);
                $this->logger()?->warning('[tictactoe] ws push failed for fd ' . $fd . ': ' . $e->getMessage());
            }
        }
    }

    /** @return array<int, int> 房间内 WS 在线的用户 id 列表 */
    public function onlineUserIds(string $code): array
    {
        return array_values(array_unique(self::$roomFds[$code] ?? []));
    }

    private function sender(): ?Sender
    {
        try {
            return ApplicationContext::getContainer()->get(Sender::class);
        } catch (Throwable) {
            return null;
        }
    }

    private function logger(): ?StdoutLoggerInterface
    {
        try {
            return ApplicationContext::getContainer()->get(StdoutLoggerInterface::class);
        } catch (Throwable) {
            return null;
        }
    }
}
