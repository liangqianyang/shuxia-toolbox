<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Exception\BizException;
use Hyperf\HttpMessage\Exception\HttpException;
use Hyperf\Logger\LoggerFactory;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

/**
 * HTTP 访问日志：每个请求记一条 INFO（方法/路径/状态码/耗时/来源 IP），异常也记（含错误信息）后原样抛出。
 * 写入 default logger → runtime/logs/hyperf-{date}.log（按天轮转，保留 30 天）。
 * /health 探活跳过，避免把日志刷满。
 */
final class AccessLogMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly LoggerFactory $loggerFactory,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $request->getUri()->getPath();
        // 探活与头像等静态读取跳过，避免日志噪声
        if ($path === '/health' || str_starts_with($path, '/uploads/')) {
            return $handler->handle($request);
        }

        $start = microtime(true);
        try {
            $response = $handler->handle($request);
        } catch (Throwable $e) {
            // 业务异常按真实码记 warning；404/405 等路由级异常记 info（多为扫描噪声）；其余异常记 error，原样抛出
            $status = $e instanceof BizException && $e->getCode() >= 400 && $e->getCode() < 500 ? $e->getCode() : 500;
            if ($e instanceof HttpException) {
                $status = $e->getStatusCode();
            }
            $this->log($request, $start, $status, $e->getMessage());
            throw $e;
        }
        $this->log($request, $start, $response->getStatusCode());

        return $response;
    }

    private function log(ServerRequestInterface $request, float $start, int $status, ?string $error = null): void
    {
        $ms = (int) round((microtime(true) - $start) * 1000);
        $line = sprintf(
            '%s %s -> %d (%dms) ip=%s%s',
            $request->getMethod(),
            $request->getUri()->getPath(),
            $status,
            $ms,
            $request->getHeaderLine('X-Real-IP') ?: ($request->getServerParams()['remote_addr'] ?? ''),
            $error !== null ? ' error=' . $error : '',
        );
        $level = $status >= 500 ? 'error' : ($status >= 400 ? 'warning' : 'info');
        $logger = $this->loggerFactory->get('access', 'default');
        match ($level) {
            'error' => $logger->error($line),
            'warning' => $logger->warning($line),
            default => $logger->info($line),
        };
    }
}
