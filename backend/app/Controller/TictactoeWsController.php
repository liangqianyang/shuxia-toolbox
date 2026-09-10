<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\Tictactoe\TictactoeRoomService;
use App\Service\Tictactoe\TictactoeWsPusher;
use App\Service\WechatUserService;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\OnCloseInterface;
use Hyperf\Contract\OnMessageInterface;
use Hyperf\Contract\OnOpenInterface;
use Hyperf\Contract\StdoutLoggerInterface;
use Swoole\Http\Request;
use Swoole\WebSocket\Frame;
use Swoole\WebSocket\Server;
use Throwable;

/**
 * 井字棋 WebSocket 通道：连接管理 + 状态推送。
 * 鉴权放在 query：/tictactoe/ws?apiKey=…&token=…&code=1234
 */
final class TictactoeWsController implements OnMessageInterface, OnOpenInterface, OnCloseInterface
{
    public function __construct(
        private readonly ConfigInterface $config,
        private readonly WechatUserService $users,
        private readonly TictactoeRoomService $rooms,
        private readonly TictactoeWsPusher $pusher,
        private readonly StdoutLoggerInterface $logger,
    ) {}

    /**
     * @param Server $server
     * @param Request $request
     */
    public function onOpen($server, $request): void
    {
        $fd = $request->fd;
        $query = $request->get ?? [];

        $reject = function (string $message) use ($server, $fd): void {
            $server->push($fd, json_encode(['type' => 'error', 'message' => $message], JSON_UNESCAPED_UNICODE));
            $server->disconnect($fd, 4001, $message);
        };

        $expected = (string) $this->config->get('app.api_key', '');
        $apiKey = (string) ($query['apiKey'] ?? '');
        if ($expected === '' || $apiKey === '' || ! hash_equals($expected, $apiKey)) {
            $reject('API Key 缺失或无效');
            return;
        }

        $userId = $this->users->userIdByToken((string) ($query['token'] ?? ''));
        if ($userId === null) {
            $reject('请先微信登录');
            return;
        }

        $code = (string) ($query['code'] ?? '');
        if (preg_match('/^[0-9]{4}$/', $code) !== 1) {
            $reject('房间码不正确');
            return;
        }

        try {
            $state = $this->rooms->state($code, $userId, 0);
        } catch (Throwable $e) {
            $reject($e->getMessage());
            return;
        }

        $this->pusher->join($code, $fd, $userId);
        $server->push($fd, json_encode(['type' => 'state', 'state' => $state, 'userId' => $userId], JSON_UNESCAPED_UNICODE));
        $this->logger->info(sprintf('[tictactoe] ws open: room=%s user=%d fd=%d', $code, $userId, $fd));
    }

    /**
     * @param Server $server
     * @param Frame $frame
     */
    public function onMessage($server, $frame): void
    {
        if (str_contains((string) $frame->data, '"ping"')) {
            $server->push($frame->fd, '{"type":"pong"}');
        }
    }

    /**
     * @param Server $server
     */
    public function onClose($server, int $fd, int $reactorId): void
    {
        $this->pusher->leave($fd);
        $this->logger->info(sprintf('[tictactoe] ws close: fd=%d', $fd));
    }
}
