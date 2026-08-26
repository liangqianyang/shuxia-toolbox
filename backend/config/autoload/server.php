<?php

declare(strict_types=1);

use Hyperf\HttpServer\Server as HttpServer;
use Hyperf\Server\Event;
use Hyperf\Server\Server;
use Hyperf\WebSocketServer\Server as WebSocketServer;

return [
    'mode' => SWOOLE_PROCESS,
    'servers' => [
        [
            'name' => 'http',
            'type' => Server::SERVER_HTTP,
            'host' => '0.0.0.0',
            'port' => (int) (getenv('SERVER_PORT') ?: 9501),
            'sock_type' => SWOOLE_SOCK_TCP,
            'callbacks' => [
                Event::ON_REQUEST => [HttpServer::class, 'onRequest'],
            ],
        ],
        [
            // 五子棋实时对战通道：只推送状态，对局变更仍走 http server 的 REST 接口
            'name' => 'ws',
            'type' => Server::SERVER_WEBSOCKET,
            'host' => '0.0.0.0',
            'port' => (int) (getenv('WS_SERVER_PORT') ?: 9502),
            'sock_type' => SWOOLE_SOCK_TCP,
            'callbacks' => [
                Event::ON_HAND_SHAKE => [WebSocketServer::class, 'onHandShake'],
                Event::ON_MESSAGE => [WebSocketServer::class, 'onMessage'],
                Event::ON_CLOSE => [WebSocketServer::class, 'onClose'],
            ],
        ],
    ],
    'settings' => [
        'enable_coroutine' => true,
        'worker_num' => 1,
        'pid_file' => BASE_PATH . '/runtime/hyperf.pid',
        'open_tcp_nodelay' => true,
        'max_coroutine' => 100000,
        'open_http2_protocol' => false,
        'max_request' => 100000,
        'socket_buffer_size' => 2 * 1024 * 1024,
    ],
];
