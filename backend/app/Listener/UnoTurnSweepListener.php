<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Uno\UnoRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * UNO 回合超时清扫器：主 worker（workerId=0）上每秒扫一次「进行中且回合已到期」的房间并推进
 * （自动摸牌跳过 / +4 质疑窗口结算 / 挂机累计），推进后按视角广播。
 *
 * 为什么需要它：WS 模式下客户端不轮询，纯懒推进（写操作前检查）会导致超时永不触发；
 * 懒检查仍保留在 UnoRoomService 写路径上作为后备。worker_num=1，单 Timer 无并发问题。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class UnoTurnSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly UnoRoomService $rooms,
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
            $swept = $this->rooms->sweepDueRooms();
            if ($swept > 0) {
                $this->logger->info(sprintf('[uno] swept %d due room(s)', $swept));
            }
        });
        $this->logger->info('[uno] turn sweep timer registered (1s interval)');
    }
}
