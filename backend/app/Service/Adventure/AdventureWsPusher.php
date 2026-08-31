<?php

declare(strict_types=1);

namespace App\Service\Adventure;

use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\WebSocketServer\Sender;
use Throwable;

/**
 * 枫趣冒险房间 WebSocket 连接表 + 状态推送。
 *
 * worker_num=1，进程内数组即可保证全房间连接可见；
 * 只推送，不做权威判定——对局变更走 AdventureRoomService（HTTP），这里广播结果。
 * 冒险棋有隐藏信息（道具手牌/埋伏归属/决斗暗出），各连接按请求者视角收到不同序列化内容。
 * 断线重连：同 token 重新握手，join() 先 leave 旧 fd 再登记新 fd，随后 WsController 推全量首帧。
 */
final class AdventureWsPusher
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
     * 向房间内所有连接推送完整状态（按用户视角）。
     *
     * @param callable(int $userId): ?array<string, mixed> $stateFactory 按用户生成状态；null 跳过
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
                // 连接刚好断开：清掉这条 fd，不影响其他人
                $this->leave($fd);
                $this->logger()?->warning('[adventure] ws push failed for fd ' . $fd . ': ' . $e->getMessage());
            }
        }
    }

    /** @return array<int, int> 房间内 WS 在线的用户 id 列表 */
    public function onlineUserIds(string $code): array
    {
        return array_values(array_unique(self::$roomFds[$code] ?? []));
    }

    /** WS server 未启用（纯 HTTP 环境/单测）时静默降级为空操作。 */
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
