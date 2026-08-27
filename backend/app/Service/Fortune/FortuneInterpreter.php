<?php

declare(strict_types=1);

namespace App\Service\Fortune;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * AI 解签器：结合签文与用户所问之事生成个性化解读。
 *
 * 刻意不复用 App\Service\Ai\AiProvider —— 那是旅行领域专用接口（generateItinerary 等），
 * 往上面加「解签」会污染两个厂商实现。这里仿照 ZhipuProvider/DeepSeekProvider 的写法
 * 用 Guzzle 直调 chat/completions，按 AI_PROVIDER env 选厂商（与 dependencies.php 一致）。
 *
 * 输出固定四段 JSON：{meaning, forYou, action, luckyHint}，解析失败抛 RuntimeException 由上层兜底。
 */
final class FortuneInterpreter
{
    private const string ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    private readonly Client $client;

    public function __construct()
    {
        // Guzzle 默认 CurlHandler 走原生 curl 扩展（bin/hyperf.php 已禁用 SWOOLE_HOOK_CURL）
        $this->client = new Client();
    }

    /**
     * @param array<string, mixed> $stick 签文数据（灵签：no/level/title/verse/gist/interpretation；答案之书：no/answer）
     * @return array{meaning: string, forYou: string, action: string, luckyHint: string}
     */
    public function interpret(string $deck, array $stick, string $categoryName, ?string $question): array
    {
        $content = $this->requestAiContent($this->buildMessages($deck, $stick, $categoryName, $question));

        return $this->parseReading($content);
    }

    /** @return array<int, array{role: string, content: string}> */
    private function buildMessages(string $deck, array $stick, string $categoryName, ?string $question): array
    {
        $system = '你是一位精通传统签文的解签大师，语气温和睿智，能把签文智慧结合现代人的具体处境讲明白。'
            . '只输出一个 JSON 对象，禁止 markdown 代码块，禁止任何额外文字。'
            . 'JSON 结构：{"meaning":"签意（60字内，讲签文本身的寓意）","forYou":"对你所问（80字内，结合用户所问之事的具体指引）",'
            . '"action":"行动建议（50字内，1-2 条可执行的建议）","luckyHint":"开运小贴士（20字内，一句轻松的话）"}。'
            . '语气积极但不说教，不恐吓，不替用户做重大决定，不预测具体日期。';

        $deckName = \App\Data\Fortune\StickLibrary::DECKS[$deck]['name'] ?? $deck;
        $ask = $question !== null && $question !== ''
            ? "所问分类：{$categoryName}；具体问题：「{$question}」。"
            : "所问分类：{$categoryName}。";

        if ($deck === 'book') {
            $answer = (string) ($stick['answer'] ?? '');
            $user = "用户向《答案之书》默念了一个问题，翻到的答案是：「{$answer}」。{$ask}"
                . '请解读这句回答对用户问题的指引（meaning 讲这句话本身的含义，forYou 结合问题展开）。';
        } else {
            $verse = implode('，', array_map('strval', (array) ($stick['verse'] ?? [])));
            $user = "签种：{$deckName}，第{$stick['no']}签（{$stick['level']}），签题「{$stick['title']}」。"
                . "签诗：{$verse}。总断：{$stick['gist']}。{$ask}"
                . '请为用户解签。';
        }

        return [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ];
    }

    private function requestAiContent(array $messages): string
    {
        $provider = getenv('AI_PROVIDER') ?: 'zhipu';
        $timeout = (int) (getenv('AI_TIMEOUT') ?: 120);

        if ($provider === 'deepseek') {
            $key = getenv('DEEPSEEK_API_KEY') ?: '';
            if ($key === '') {
                throw new RuntimeException('AI 服务未配置 DEEPSEEK_API_KEY');
            }
            $url = rtrim(getenv('DEEPSEEK_BASE_URL') ?: 'https://api.deepseek.com', '/') . '/chat/completions';
            $payload = [
                'model' => getenv('DEEPSEEK_MODEL') ?: 'deepseek-v4-flash',
                'messages' => $messages,
                'response_format' => ['type' => 'json_object'],
            ];
        } else {
            $key = getenv('ZHIPU_API_KEY') ?: '';
            if ($key === '') {
                throw new RuntimeException('AI 服务未配置 ZHIPU_API_KEY');
            }
            $url = self::ZHIPU_URL;
            $payload = [
                'model' => getenv('ZHIPU_MODEL') ?: 'glm-5.2',
                'messages' => $messages,
            ];
            // 解签不需要联网搜索，关思考提速（与旅行 provider 的 env 约定一致）。
            if ((getenv('ZHIPU_THINKING') ?: 'disabled') === 'disabled') {
                $payload['thinking'] = ['type' => 'disabled'];
            }
        }

        try {
            $response = $this->client->post($url, [
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

    /**
     * @return array{meaning: string, forYou: string, action: string, luckyHint: string}
     */
    private function parseReading(string $content): array
    {
        // 剥 markdown 围栏（prompt 已禁止，双保险）。
        $content = trim($content);
        if (str_starts_with($content, '```')) {
            $content = (string) preg_replace('/^```(?:json)?\s*|\s*```$/', '', $content);
        }

        try {
            $data = json_decode($content, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('AI 返回的解读不是合法 JSON', 0, $e);
        }
        if (! is_array($data)) {
            throw new RuntimeException('AI 返回的解读结构异常');
        }

        $reading = [];
        foreach (['meaning', 'forYou', 'action', 'luckyHint'] as $field) {
            $value = trim((string) ($data[$field] ?? ''));
            if ($value === '') {
                throw new RuntimeException("AI 解读缺少字段：{$field}");
            }
            $reading[$field] = $value;
        }

        return $reading;
    }
}
