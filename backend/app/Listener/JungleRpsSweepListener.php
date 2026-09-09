<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Jungle\JungleRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 斗兽棋猜拳窗口清扫器：主 worker 上每秒扫一次「rps 阶段且窗口已到期」的房间并推进
 * （出拳期到 → 代未出者随机出并结算，可能平局重开或进入选边；选边期到 → 默认执红开局）。
 *
 * 斗兽棋对局走子不限时（照五子棋），没有回合 deadline；但猜拳一方挂机会把双方卡死
 * （先出者没有任何写操作可触发懒检查），必须有 Timer 兜底。
 * 懒检查仍保留在 rps/chooseColor 写路径上（带请求者放行防软锁）。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class JungleRpsSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly JungleRoomService $rooms,
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
            $swept = $this->rooms->sweepDueRpsRooms();
            if ($swept > 0) {
                $this->logger->info(sprintf('[jungle] swept %d due rps room(s)', $swept));
            }
        });
        $this->logger->info('[jungle] rps sweep timer registered (1s interval)');
    }
}
