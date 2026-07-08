<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Exception\BizException;
use Hyperf\Contract\ConfigInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * API Key 鉴权：校验请求头 X-API-Key（hash_equals 常量时间比较）。
 * /health（无 /api 前缀）放行，供负载均衡/监控探活；其余路径必带 key。
 * 安全限制：key 写在小程序前端包里，属弱鉴权——挡得住普通盗刷，挡不住有动力的反编译者，
 * 真正防刷靠限流（ApiKeyMiddleware 之后执行）兜底。长期应升级到 wx.login→code2session。
 */
final class ApiKeyMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly ConfigInterface $config) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($request->getUri()->getPath() === '/health') {
            return $handler->handle($request);
        }

        $expected = (string) $this->config->get('app.api_key', '');
        $got = $request->getHeaderLine('X-API-Key');
        // env 缺失或 header 空 → 一律拒绝（避免空 key 误放行）
        if ($expected === '' || $got === '' || ! hash_equals($expected, $got)) {
            throw new BizException(401, 'API Key 缺失或无效');
        }

        return $handler->handle($request);
    }

    /**
     * 客户端真实 IP（限流 key 用）：取可信反代 X-Forwarded-For 首段，回退 remote_addr。
     * 依赖 nginx 是自有可信反代；多级代理时需收紧 trusted proxies。
     */
    public static function clientIp(ServerRequestInterface $request): string
    {
        $xff = $request->getHeaderLine('X-Forwarded-For');
        if ($xff !== '') {
            $first = trim(explode(',', $xff)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP) !== false) {
                return $first;
            }
        }
        $server = $request->getServerParams();

        return is_string($server['remote_addr'] ?? null) ? $server['remote_addr'] : '0.0.0.0';
    }

    /**
     * 限流桶 key：按客户端 IP。供 #[RateLimit(key: [ApiKeyMiddleware::class, 'bucketKey'])] 使用。
     * 从协程 Context 取当前请求（callable 会被 Aspect 传入 ProceedingJoinPoint，这里不用它）。
     */
    public static function bucketKey(mixed $_joinPoint = null): string
    {
        $request = \Hyperf\Context\Context::get(\Psr\Http\Message\ServerRequestInterface::class);

        return $request !== null ? self::clientIp($request) : 'unknown';
    }
}
