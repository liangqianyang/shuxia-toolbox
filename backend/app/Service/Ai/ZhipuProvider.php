<?php

declare(strict_types=1);

namespace App\Service\Ai;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * 智谱 GLM 实现。POST https://open.bigmodel.cn/api/paas/v4/chat/completions
 * 走原生 PHP curl（bin/hyperf.php 已禁用 SWOOLE_HOOK_CURL），HTTPS 出站可用（已实测 0.12s）。
 * key/模型/思考/联网 走 getenv，与 TencentMapProvider 一致。
 * prompt 构建与响应解析在 AbstractAiProvider。
 */
final class ZhipuProvider extends AbstractAiProvider
{
    private const string URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    private readonly Client $client;

    public function __construct()
    {
        // Guzzle 默认 CurlHandler 走原生 curl 扩展（= 系统 libcurl，含 TLS）
        $this->client = new Client();
    }

    protected function webSearchEnabled(): bool
    {
        return strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false';
    }

    protected function requestAiContent(array $messages, bool $webSearch): string
    {
        $key = getenv('ZHIPU_API_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('服务未配置 ZHIPU_API_KEY');
        }

        $model = getenv('ZHIPU_MODEL') ?: 'glm-5.2';
        $timeout = (int) (getenv('AI_TIMEOUT') ?: 120);
        $thinking = getenv('ZHIPU_THINKING') ?: 'disabled';
        $payload = [
            'model' => $model,
            'messages' => $messages,
        ];
        if ($thinking === 'disabled') {
            $payload['thinking'] = ['type' => 'disabled'];
        }
        if ($webSearch) {
            $payload['tools'] = [['type' => 'web_search', 'web_search' => ['enable' => true]]];
        }

        try {
            $response = $this->client->post(self::URL, [
                'headers' => [
                    'Authorization' => 'Bearer ' . $key,
                    'Content-Type' => 'application/json',
                ],
                'json' => $payload,
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('服务请求失败: ' . $e->getMessage(), 0, $e);
        }

        return (string) ($body['choices'][0]['message']['content'] ?? '');
    }
}
