<?php

declare(strict_types=1);

namespace App\Listener;

use App\Service\Tictactoe\TictactoeRoomService;
use Hyperf\Contract\StdoutLoggerInterface;
use Hyperf\Coordinator\Timer;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Framework\Event\MainWorkerStart;

/**
 * 井字棋窗口清扫器：出拳到期代未出者随机出；落子到期代落随机空格。
 * 注意 Hyperf 3.x 的 worker 启动事件是 MainWorkerStart/OtherWorkerStart，没有 OnWorkerStart。
 */
final class TictactoeSweepListener implements ListenerInterface
{
    private static bool $registered = false;

    public function __construct(
        private readonly TictactoeRoomService $rooms,
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
                $this->logger->info(sprintf('[tictactoe] swept %d due room(s)', $swept));
            }
        });
        $this->logger->info('[tictactoe] sweep timer registered (1s interval)');
    }
}
