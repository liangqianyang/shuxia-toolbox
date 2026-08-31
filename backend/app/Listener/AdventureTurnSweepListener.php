<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Adventure\AdventureRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 枫趣冒险回合超时清扫器：主 worker（workerId=0）上每秒扫一次：
 * 1) sweepDueRooms——「进行中且窗口已到期」的房间推进（掷骰/道具确认超时自动走、选择窗取默认、
 *    决斗随机代出；推进前若房内零人在线自动转 saved，绝不让托管通宵自走）；
 * 2) sweepLonelyRooms——只剩一人在线且其余离线超 120s 的局判 last_man；
 * 3) sweepSavedRooms——saved 房 7 天过期关闭。
 *
 * 懒检查仍保留在 AdventureRoomService 写路径上作为后备（带请求者放行）。
 * worker_num=1，单 Timer 无并发问题。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class AdventureTurnSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly AdventureRoomService $rooms,
        private readonly StdoutLoggerInterface $logger,
    ) {}

    public function listen(): array
    {
        return [MainWorkerStart::class];
    }

    public function process(object $event): void
    {
        if (! $event instanceof MainWorkerStart || self::$registered) {
            return;
        }
        self::$registered = true;

        $timer = new Timer($this->logger);
        $timer->tick(1.0, function (): void {
            $swept = $this->rooms->sweepDueRooms() + $this->rooms->sweepLonelyRooms() + $this->rooms->sweepSavedRooms();
            if ($swept > 0) {
                $this->logger->info(sprintf('[adventure] swept %d due/lonely/saved room(s)', $swept));
            }
        });
        $this->logger->info('[adventure] turn sweep timer registered (1s interval)');
    }
}
