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
 */
final class ZhipuProvider implements AiProvider
{
    private const URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    /** 对齐前端 PoiType；AI 返回的非法 type 一律回退 sight */
    private const ALLOWED_TYPES = ['sight', 'food', 'stay', 'shop', 'transit'];

    /** 出行方式中文标签（写进 prompt，让 AI 按此规划路线与站间衔接） */
    private const MODE_LABELS = [
        'walking' => '步行',
        'cycling' => '骑行',
        'driving' => '驾车/打车',
        'transit' => '公共交通（地铁/公交）',
        'train' => '火车/高铁（跨城）',
    ];

    private readonly Client $client;

    public function __construct()
    {
        // Guzzle 默认 CurlHandler 走原生 curl 扩展（= 系统 libcurl，含 TLS）
        $this->client = new Client();
    }

    public function generateItinerary(array $input): array
    {
        $key = getenv('ZHIPU_API_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('AI 服务未配置 ZHIPU_API_KEY');
        }

        $model = getenv('ZHIPU_MODEL') ?: 'glm-5.2';
        $timeout = (int) (getenv('AI_TIMEOUT') ?: 120);
        $thinking = getenv('ZHIPU_THINKING') ?: 'disabled';
        $webSearch = strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false';

        $payload = [
            'model' => $model,
            'messages' => $this->buildMessages($input, $webSearch),
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
            throw new RuntimeException('AI 服务请求失败: ' . $e->getMessage(), 0, $e);
        }

        $content = (string) ($body['choices'][0]['message']['content'] ?? '');
        return $this->parseItinerary($content);
    }

    /**
     * @param array{destination: string, days: int, daily_hours: float|array<int, float>, preferences?: string, origin?: ?string, travel_mode?: string, round_trip?: bool} $input
     *
     * @return array<int, array{role: string, content: string}>
     */
    private function buildMessages(array $input, bool $webSearch): array
    {
        $destination = (string) ($input['destination'] ?? '');
        $days = max(1, (int) ($input['days'] ?? 1));
        $preferences = trim((string) ($input['preferences'] ?? ''));
        $origin = trim((string) ($input['origin'] ?? ''));
        $mode = (string) ($input['travel_mode'] ?? 'walking');
        $modeLabel = self::MODE_LABELS[$mode] ?? self::MODE_LABELS['walking'];
        $roundTrip = (bool) ($input['round_trip'] ?? false);

        // 每日游玩时长：支持按天数组（如 [8,6,7]）；不足补 8，多余截断，与 days 对齐
        $dhRaw = $input['daily_hours'] ?? 8;
        $dhArr = is_array($dhRaw) ? array_values($dhRaw) : [(float) $dhRaw];
        $dhArr = array_slice(array_pad($dhArr, $days, 8.0), 0, $days);
        $hoursList = [];
        foreach ($dhArr as $i => $h) {
            $hoursList[] = '第' . ($i + 1) . '天约 ' . rtrim(rtrim(sprintf('%.1f', (float) $h), '0'), '.') . ' 小时';
        }
        $hoursStr = implode('，', $hoursList);

        $searchClause = $webSearch
            ? '，并**联网搜索**目的地的当季最新信息（开放时间、必吃美食、临时闭园/活动、新开店铺、票价）综合后输出'
            : '';

        $system = '你是专业旅游规划师。根据用户需求规划行程' . $searchClause . '。'
            . '只输出一个 JSON 对象，禁止 markdown 代码块、禁止任何解释文字。'
            . '结构：{"title":字符串,'
            . '"days":[{"index":整数,"title":当日主题字符串,'
            . '"stops":[{"name":地点名,"type":"sight|food|stay|shop|transit"之一,'
            . '"time":"如 09:00-10:30","note":"简短实用 tips"}]}],'
            . '"food":[{"name":美食名,"shop":推荐店名,"dishes":[必点菜名数组],"note":"简短点评"}],'
            . '"tips":[实用建议字符串数组（最佳游玩方式、避坑、交通、预约提醒等）],'
            . '"xhs":{"title":"小红书爆款风格标题（可含 emoji）","body":"小红书正文（分段、口语化、可含 emoji 与换行）","tags":["#话题1","#话题2"]}}。'
            . '规则：每天 4-6 个 stop（时长短的天少排），按真实游玩顺序，围绕出行方式安排路线尽量不走回头路；'
            . '景点=sight 美食=food 住宿=stay 购物=shop 交通=transit；'
            . 'time 用时间段；note 写当季/实用要点；'
            . 'food 给 4-8 个当地必吃（含推荐店与必点菜）；tips 给 3-6 条；'
            . 'xhs 文案要真实可直接发布、有代入感；严格遵循用户指定的每天游玩时长、天数、出行方式与偏好。';

        $user = sprintf(
            '目的地：%s；天数：%d；每日游玩时长：%s；出行方式：%s；偏好：%s。',
            $destination,
            $days,
            $hoursStr,
            $modeLabel,
            $preferences !== '' ? $preferences : '不限',
        );
        if ($origin !== '') {
            $user .= ' 出发地：' . $origin . '（从出发地出发前往目的地'
                . ($roundTrip ? '，往返（行程结束后返回出发地）' : '')
                . '）。';
        }

        return [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ];
    }

    private function parseItinerary(string $content): array
    {
        $text = trim($content);
        // 兼容模型偶尔包裹 markdown 代码围栏
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/is', $text, $m)) {
            $text = trim($m[1]);
        }

        try {
            $data = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('AI 返回内容不是合法 JSON', 0, $e);
        }

        $title = is_string($data['title'] ?? null) && trim((string) $data['title']) !== ''
            ? trim((string) $data['title'])
            : '旅游攻略';

        $rawDays = is_array($data['days'] ?? null) ? $data['days'] : [];
        $days = [];
        $i = 0;
        foreach ($rawDays as $day) {
            if (! is_array($day)) {
                continue;
            }
            $rawStops = is_array($day['stops'] ?? null) ? $day['stops'] : [];
            $stops = [];
            foreach ($rawStops as $stop) {
                if (! is_array($stop)) {
                    continue;
                }
                $type = (string) ($stop['type'] ?? 'sight');
                if (! in_array($type, self::ALLOWED_TYPES, true)) {
                    $type = 'sight';
                }
                $name = is_string($stop['name'] ?? null) && trim((string) $stop['name']) !== ''
                    ? trim((string) $stop['name'])
                    : '未命名地点';
                $stops[] = [
                    'name' => $name,
                    'type' => $type,
                    'time' => is_string($stop['time'] ?? null) ? trim((string) $stop['time']) : '',
                    'note' => is_string($stop['note'] ?? null) ? trim((string) $stop['note']) : '',
                ];
            }
            if ($stops === []) {
                continue; // 空天丢弃
            }
            $i++;
            $days[] = [
                'index' => $i,
                'title' => is_string($day['title'] ?? null) ? trim((string) $day['title']) : '',
                'stops' => $stops,
            ];
        }

        if ($days === []) {
            throw new RuntimeException('AI 未返回有效行程');
        }

        return [
            'title' => $title,
            'days' => $days,
            'food' => $this->parseFood($data['food'] ?? null),
            'tips' => $this->parseTips($data['tips'] ?? null),
            'xhs' => $this->parseXhs($data['xhs'] ?? null),
        ];
    }

    /**
     * @return array<int, array{name: string, shop: string, dishes: array<int, string>, note: string}>
     */
    private function parseFood(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $item) {
            if (! is_array($item)) {
                continue;
            }
            $name = is_string($item['name'] ?? null) ? trim((string) $item['name']) : '';
            if ($name === '') {
                continue;
            }
            $dishes = [];
            if (is_array($item['dishes'] ?? null)) {
                foreach ($item['dishes'] as $d) {
                    if (is_string($d) && trim($d) !== '') {
                        $dishes[] = trim($d);
                    }
                }
            }
            $out[] = [
                'name' => $name,
                'shop' => is_string($item['shop'] ?? null) ? trim((string) $item['shop']) : '',
                'dishes' => $dishes,
                'note' => is_string($item['note'] ?? null) ? trim((string) $item['note']) : '',
            ];
        }

        return $out;
    }

    /**
     * @return array<int, string>
     */
    private function parseTips(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $t) {
            if (is_string($t) && trim($t) !== '') {
                $out[] = trim($t);
            }
        }

        return $out;
    }

    /**
     * @return array{title: string, body: string, tags: array<int, string>}
     */
    private function parseXhs(mixed $raw): array
    {
        $empty = ['title' => '', 'body' => '', 'tags' => []];
        if (! is_array($raw)) {
            return $empty;
        }
        $tags = [];
        if (is_array($raw['tags'] ?? null)) {
            foreach ($raw['tags'] as $tag) {
                if (! is_string($tag)) {
                    continue;
                }
                $tag = trim($tag);
                if ($tag === '') {
                    continue;
                }
                // 统一带 # 前缀，去掉空白
                $tags[] = str_starts_with($tag, '#') ? $tag : '#' . $tag;
            }
        }

        return [
            'title' => is_string($raw['title'] ?? null) ? trim((string) $raw['title']) : '',
            'body' => is_string($raw['body'] ?? null) ? trim((string) $raw['body']) : '',
            'tags' => $tags,
        ];
    }
}
