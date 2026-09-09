<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\MountainChess\MountainChessRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 军棋窗口清扫器：主 worker 上每秒扫一次「窗口已到期」的房间并推进——
 * 布阵到期 → 代未就绪方随机合法布阵（双方就绪进入猜拳）；
 * 出拳到期 → 代未出者随机出拳并结算（平局重出）；
 * 走子到期 → 代走随机合法步（判负风险交给规则引擎的 stuck 检查）。
 *
 * 军棋三个阶段都有 deadline（与斗兽棋「对局不限时」不同，军棋走子 45s 代走防挂机），
 * 懒检查仍保留在各写路径上（带请求者放行防软锁），Timer 是先出拳/先布阵一方卡死的兜底。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class JunqiSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly MountainChessRoomService $rooms,
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
                $this->logger->info(sprintf('[junqi] swept %d due room(s)', $swept));
            }
        });
        $this->logger->info('[junqi] sweep timer registered (1s interval)');
    }
}
