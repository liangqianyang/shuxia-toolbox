<?php

declare(strict_types=1);

namespace App\Service\Ai;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * DeepSeek 实现。OpenAI 兼容协议，POST {DEEPSEEK_BASE_URL}/chat/completions。
 * key/模型/base_url 走 getenv，与 ZhipuProvider 一致；prompt 构建与响应解析在 AbstractAiProvider。
 *
 * 与智谱的差异：
 * - 开启 response_format=json_object，比纯 prompt 约束更稳地拿到合法 JSON；
 * - DeepSeek API 无官方联网搜索工具，webSearchEnabled() 恒 false，
 *   prompt 自动去掉「联网搜索」表述，跨城耗时/天气回退到 TravelService 的兜底逻辑。
 */
final class DeepSeekProvider extends AbstractAiProvider
{
    private readonly Client $client;

    public function __construct()
    {
        // Guzzle 默认 CurlHandler 走原生 curl 扩展（= 系统 libcurl，含 TLS）
        $this->client = new Client();
    }

    protected function webSearchEnabled(): bool
    {
        return false;
    }

    protected function requestAiContent(array $messages, bool $webSearch): string
    {
        $key = getenv('DEEPSEEK_API_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('AI 服务未配置 DEEPSEEK_API_KEY');
        }

        $baseUrl = rtrim(getenv('DEEPSEEK_BASE_URL') ?: 'https://api.deepseek.com', '/');
        $model = getenv('DEEPSEEK_MODEL') ?: 'deepseek-v4-flash';
        $timeout = (int) (getenv('AI_TIMEOUT') ?: 120);
        $payload = [
            'model' => $model,
            'messages' => $messages,
            'response_format' => ['type' => 'json_object'],
        ];

        try {
            $response = $this->client->post($baseUrl . '/chat/completions', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $key,
                    'Content-Type' => 'application/json',
                ],
                'json' => $payload,
                'timeout' => $timeout,
            ]);
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('AI 服务请求失败: ' . $e->getMessage(), 0, $e);
        }

        return (string) ($body['choices'][0]['message']['content'] ?? '');
    }
}
