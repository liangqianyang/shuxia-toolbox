<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Ludo\LudoRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 飞行棋回合超时清扫器：主 worker（workerId=0）上每秒扫一次「进行中且阶段已到期」的房间并推进
 * （roll 期到 → 自动掷+自动走；move 期到 → 按合法走法启发式选机；挂机累计），推进后广播。
 *
 * 为什么需要它：WS 模式下客户端不轮询，纯懒推进（写操作前检查）会导致超时永不触发；
 * 懒检查仍保留在 LudoRoomService 写路径上作为后备。worker_num=1，单 Timer 无并发问题。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class LudoTurnSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly LudoRoomService $rooms,
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
            $swept = $this->rooms->sweepDueRooms() + $this->rooms->sweepLonelyRooms();
            if ($swept > 0) {
                $this->logger->info(sprintf('[ludo] swept %d due/lonely room(s)', $swept));
            }
        });
        $this->logger->info('[ludo] turn sweep timer registered (1s interval)');
    }
}
