<?php

declare(strict_types=1);

namespace App\Exception\Handler;

use App\Exception\BizException;
use Hyperf\ExceptionHandler\ExceptionHandler;
use Hyperf\HttpMessage\Stream\SwooleStream;
use Hyperf\Logger\LoggerFactory;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * 全局异常处理：
 *  - BizException：透传 {code,message,data} envelope（业务可控，记 info）；
 *  - 其余 Throwable：兜底 500 + 记 error（含 class/位置/trace）。
 * 这一步顺带修复此前下游异常被 Controller 内 catch(Throwable) 静默吞、零日志可查的问题。
 */
final class AppExceptionHandler extends ExceptionHandler
{
    private readonly LoggerInterface $logger;

    public function __construct(LoggerFactory $loggerFactory)
    {
        $this->logger = $loggerFactory->get('exception', 'default');
    }

    public function handle(Throwable $throwable, ResponseInterface $response): ResponseInterface
    {
        if ($throwable instanceof BizException) {
            $this->stopPropagation();
            return $this->json($response, $throwable->bizCode, $throwable->getMessage(), $throwable->data);
        }

        $this->logger->error('unhandled exception', [
            'class' => get_class($throwable),
            'msg' => $throwable->getMessage(),
            'where' => $throwable->getFile() . ':' . $throwable->getLine(),
            'trace' => $throwable->getTraceAsString(),
        ]);
        $this->stopPropagation();
        return $this->json($response, 500, '服务内部错误，请稍后重试', null);
    }

    public function isValid(Throwable $throwable): bool
    {
        return true;
    }

    private function json(ResponseInterface $response, int $code, string $message, mixed $data): ResponseInterface
    {
        $body = json_encode(['code' => $code, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);

        return $response
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withBody(new SwooleStream((string) $body));
    }
}
