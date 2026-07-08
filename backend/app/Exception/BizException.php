<?php

declare(strict_types=1);

namespace App\Exception;

use RuntimeException;

/**
 * 业务异常：携带 envelope 的 code/message/data，由 AppExceptionHandler 统一转成响应。
 * code 约定：0 成功 / 401 未授权 / 422 参数错误 / 429 限流 / 500 服务端或下游异常。
 */
final class BizException extends RuntimeException
{
    public function __construct(
        public readonly int $bizCode,
        string $message = '',
        public readonly mixed $data = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $bizCode, $previous);
    }
}
