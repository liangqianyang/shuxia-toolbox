<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Xiangqi\XiangqiRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 象棋窗口清扫器：主 worker 上每秒扫一次「窗口已到期」的房间并推进——
 * 出拳到期 → 代未出者随机出拳并结算（平局重出）；
 * 走子到期 → 代走随机合法步（无合法步判负：将死/困毙）。
 *
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class XiangqiSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly XiangqiRoomService $rooms,
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
                $this->logger->info(sprintf('[xiangqi] swept %d due room(s)', $swept));
            }
        });
        $this->logger->info('[xiangqi] sweep timer registered (1s interval)');
    }
}
