<?php

declare(strict_types=1);

namespace App\Controller;

/**
 * 统一响应封装：所有 Controller 继承它，用 ok()/fail() 输出 {code,message,data} envelope。
 * 失败优先 throw App\Exception\BizException（由全局 AppExceptionHandler 转 envelope），
 * fail() 仅留作兜底，正常代码不应直接调用。
 */
abstract class AbstractController
{
    protected function ok(mixed $data = null, string $message = 'ok'): array
    {
        return ['code' => 0, 'message' => $message, 'data' => $data];
    }

    protected function fail(int $code, string $message, mixed $data = null): array
    {
        return ['code' => $code, 'message' => $message, 'data' => $data];
    }
}
