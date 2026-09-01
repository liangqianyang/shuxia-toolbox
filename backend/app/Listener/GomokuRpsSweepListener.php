<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Gomoku\GomokuRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 五子棋猜拳窗口清扫器：主 worker 上每秒扫一次「rps 阶段且窗口已到期」的房间并推进
 * （出拳期到 → 代未出者随机出并结算，可能平局重开或进入选边；选边期到 → 默认执黑开局）。
 *
 * 为什么五子棋此前没有清扫器：落子不限时、悔棋窗口靠惰性过期（超时视为拒绝，无状态推进）。
 * 猜拳不同：一方出拳后另一方挂机会把双方卡死（先出者没有任何写操作可触发懒检查），
 * 必须有 Timer 兜底。懒检查仍保留在 rps/chooseColor 写路径上（带请求者放行防软锁）。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class GomokuRpsSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly GomokuRoomService $rooms,
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
                $this->logger->info(sprintf('[gomoku] swept %d due rps room(s)', $swept));
            }
        });
        $this->logger->info('[gomoku] rps sweep timer registered (1s interval)');
    }
}
