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

    /** 对齐前端 DayMood；AI 返回非法值时回退城市漫游 */
    private const ALLOWED_DAY_MOODS = ['citywalk', 'nature', 'culture', 'food', 'family', 'couple', 'classic'];

    /** 出行方式中文标签（写进 prompt，让 AI 按此规划路线与站间衔接） */
    private const MODE_LABELS = [
        'walking' => '步行',
        'cycling' => '骑行',
        'driving' => '驾车/打车',
        'transit' => '公共交通（地铁/公交）',
        'train' => '火车/高铁（跨城）',
    ];

    /** 旅行强度中文标签（影响每天排点密度与休息缓冲） */
    private const INTENSITY_LABELS = [
        'relaxed' => '轻松慢游',
        'standard' => '标准舒适',
        'packed' => '充实打卡',
    ];

    /** 旅行强度规则：避免所有行程都被固定成同一种节奏 */
    private const INTENSITY_RULES = [
        'relaxed' => '旅行强度=轻松慢游：每天优先 3-4 个 stop，少跨区，必须留足午餐/休息/拍照缓冲，不安排过早或过晚的高强度节点；',
        'standard' => '旅行强度=标准舒适：每天优先 4-5 个 stop，兼顾顺路与体验，保留用餐和交通缓冲，避免明显赶场；',
        'packed' => '旅行强度=充实打卡：每天可排 5-6 个 stop，但仍必须按真实交通、开放时间和用餐需求留缓冲，不能为了多打卡牺牲可执行性；',
    ];

    private readonly Client $client;

    public function __construct()
    {
        // Guzzle 默认 CurlHandler 走原生 curl 扩展（= 系统 libcurl，含 TLS）
        $this->client = new Client();
    }

    public function generateItinerary(array $input): array
    {
        $webSearch = strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false';
        $content = $this->requestAiContent($this->buildMessages($input, $webSearch), $webSearch);
        return $this->parseItinerary($content);
    }

    public function regenerateDay(array $input): array
    {
        $webSearch = strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false';
        $content = $this->requestAiContent($this->buildDayMessages($input, $webSearch), $webSearch);
        return $this->parseDay($content, (int) ($input['day_index'] ?? 1));
    }

    public function replaceStop(array $input): array
    {
        $webSearch = strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false';
        $content = $this->requestAiContent($this->buildReplaceStopMessages($input, $webSearch), $webSearch);
        return $this->parseSingleStop($content);
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages
     */
    private function requestAiContent(array $messages, bool $webSearch): string
    {
        $key = getenv('ZHIPU_API_KEY') ?: '';
        if ($key === '') {
            throw new RuntimeException('AI 服务未配置 ZHIPU_API_KEY');
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
            throw new RuntimeException('AI 服务请求失败: ' . $e->getMessage(), 0, $e);
        }

        return (string) ($body['choices'][0]['message']['content'] ?? '');
    }

    /**
     * @param array{destination: string, days: int, daily_hours: float|array<int, float>, preferences?: string, origin?: ?string, travel_mode?: string, intensity?: string, round_trip?: bool, departure_date?: string, sights?: string, foods?: string} $input
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
        $intensity = (string) ($input['intensity'] ?? 'standard');
        $intensityLabel = self::INTENSITY_LABELS[$intensity] ?? self::INTENSITY_LABELS['standard'];
        $intensityRule = self::INTENSITY_RULES[$intensity] ?? self::INTENSITY_RULES['standard'];
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

        $departureDate = trim((string) ($input['departure_date'] ?? ''));
        $sights = trim((string) ($input['sights'] ?? ''));
        $foods = trim((string) ($input['foods'] ?? ''));
        // 跨城真实耗时：需联网 + 有出发地 + 与目的地不同 + 方式支持（火车/驾车/公交）。
        // 步行/骑行不查（直线距离都上百公里，AI 会编出「步行 80 小时」之类无意义值）→ 交 TravelService 的 haversine 兜底。
        $hasIntercity = $webSearch && $origin !== '' && $origin !== $destination
            && in_array($mode, ['train', 'driving', 'transit'], true);
        // 天气驱动清单：需联网 + 有出发日期。无日期则 packingTips 仅按目的地特色给（原行为）。
        $hasWeather = $webSearch && $departureDate !== '';

        $intercitySchema = $hasIntercity
            ? ',"intercity":{"durationMin":单程整数分钟,"distanceM":整数米,"note":"跨城交通简短说明（如车次类型、建议出发车站）"}'
            : '';
        $intercityRule = $hasIntercity
            ? '若给了出发地且与目的地不同、出行方式为火车/驾车/公交：**联网查询**出发地→目的地该方式的**单程**真实耗时与里程（高铁按实际班次、自驾按实际路程），填入顶层 intercity（durationMin 为整数分钟、distanceM 为整数米）；查不到或方式为步行/骑行则**省略整个 intercity 字段**；intercity 只放顶层，不要塞进 stops 的 note；'
            : '';
        $weatherRule = $hasWeather
            ? '出发日期为 ' . $departureDate . '：**联网查询**目的地该日期前后天气（温度区间、降水概率、紫外线、风力），若超出可靠预报范围（约15天）则按**目的地该月份的典型气候**给建议、**不要**编造精确温度；据此结合目的地特色调整 packingMust/packingNotes（是否需雨具、防晒、保暖、速干衣物等），每条**只写物品或注意事项本身、不要写天气数据**，仍保持 packingMust 6-8条、packingNotes 4-6条；'
            : '';

        $system = '你是专业旅游规划师。根据用户需求规划行程' . $searchClause . '。'
            . '只输出一个 JSON 对象，禁止 markdown 代码块、禁止任何解释文字。'
            . '结构：{"title":字符串,'
            . '"days":[{"index":整数,"title":当日主题字符串,"routeTag":"当日路线主题如西湖线或灵隐茶山线（若为单日行程或无明显主题则省略该字段）",'
            . '"dayMood":"citywalk|nature|culture|food|family|couple|classic","handbookSummary":"写进手帐图底部的今日一句话，20-36个中文字符",'
            . '"stops":[{"name":地点名,"type":"sight|food|stay|shop|transit"之一,'
            . '"time":"如 09:00-10:30","note":"简短实用 tips",'
            . '"poiInfo":{"openHours":"开放/营业时间，未知写出发前确认","reservation":"预约要求","ticket":"门票/消费","duration":"建议停留时长"},'
            . '"handbookText":"写进旅行手帐图的地点短句，1-2句，有画面感，不写票价/预约/开放时间",'
            . '"illustrationPrompt":"用于生成水彩旅行手帐插画的中文提示词，包含城市、地点、季节氛围、主体景物，禁止出现文字水印"}]}],'
            . '"food":[{"name":美食名,"shop":推荐店名,"dishes":[必点菜名数组],"note":"简短点评","poiInfo":{"openHours":"营业时间，未知写出发前确认","reservation":"预约要求","ticket":"人均/消费","duration":"建议用餐时长"}}],'
            . '"tips":[实用建议字符串数组（最佳游玩方式、避坑、交通、预约提醒等）],'
            . '"xhs":{"title":"小红书爆款风格标题（可含 emoji）","body":"小红书正文（**至少 280 字**，分段、口语化、可含 emoji 与换行：开篇钩子→每日精华（逐天）→**必带物品/穿搭/避坑呼应 packingMust、packingNotes**→结尾互动号召）","tags":["#话题1","#话题2"]},'
            . '"packingMust":["必带物品1","必带物品2"（6-8条，证件/电子设备/衣物/药品/雨具防晒等实物类）],'
            . '"packingNotes":["注意事项1","注意事项2"（4-6条，预约提醒/避坑/礼仪/安全/返程缓冲等非实物提醒）]' . $intercitySchema . '}。'
            . '规则：' . $intensityRule . '每日 stop 数量还要服从用户给定游玩时长：4小时以内最多3个，8小时以内最多5个，超过10小时才允许6个；按真实游玩顺序，围绕出行方式安排路线尽量不走回头路；'
            . '景点=sight 美食=food 住宿=stay 购物=shop 交通=transit；'
            . '跨城交通枢纽（出发地/目的地的火车站、高铁站、机场、长途汽车站等）**不要**作为 stops 列出——它们已在 intercity 体现，列进 stops 会污染市内地图；每天 stops 只写实际要游览/用餐/住宿/购物的地点，市内换乘方式写进相邻 stop 的 note；'
            . 'time 用时间段；note 写当季/实用要点；'
            . '每天必须给 dayMood（只能从枚举中选一个）和 handbookSummary（像旅行日记的今日一句话，不要堆砌信息）；'
            . '每个 stop 必须给 poiInfo：openHours、reservation、ticket、duration；不确定的字段写“出发前确认”，不要编造精确价格或时间；'
            . '每个 stop 必须给 handbookText：它是手帐图文案，要有观察感和画面感，避免攻略腔，不要重复 note，也不要写门票/预约/营业时间；'
            . '每个 stop 必须给 illustrationPrompt，用于后续生成水彩手帐插画，写清楚地点主体、城市氛围、白底水彩、手绘质感；'
            . 'food 给 4-8 个当地必吃（含推荐店与必点菜），每条 food 也必须给 poiInfo；tips 给 3-6 条；'
            . 'xhs 文案要真实可直接发布、有代入感，body 至少 280 字分多段（开篇钩子、逐天精华、**必带物品/避坑提醒呼应 packingMust 与 packingNotes、点名「记得带 XX」「注意 YY」**、结尾互动），让读者看完想收藏；'
            . 'packingMust 只写实物类必带物品、packingNotes 只写非实物注意事项，均结合目的地特点；' . $weatherRule
            . '多天行程的 routeTag 用于区分各天的游玩区域主题（如第1天西湖景区可标"西湖线"，第2天灵隐可标"灵隐茶山线"）；' . $intercityRule
            . '严格遵循用户指定的每天游玩时长、天数、出行方式与偏好。';

        $user = sprintf(
            '目的地：%s；天数：%d；每日游玩时长：%s；出行方式：%s；旅行强度：%s；偏好：%s。',
            $destination,
            $days,
            $hoursStr,
            $modeLabel,
            $intensityLabel,
            $preferences !== '' ? $preferences : '不限',
        );
        if ($origin !== '') {
            $user .= ' 出发地：' . $origin . '（从出发地出发前往目的地'
                . ($roundTrip ? '，往返（行程结束后返回出发地）' : '')
                . '）。';
        }
        if ($departureDate !== '') {
            $user .= ' 出发日期：' . $departureDate . '。';
        }
        if ($sights !== '') {
            $user .= ' 用户指定想去的景点：' . $sights . '（务必纳入相应日期的 stops 并按真实游玩顺序安排，可再补充少量相邻顺路景点）。';
        }
        if ($foods !== '') {
            $user .= ' 用户指定想吃的美食：' . $foods . '（务必纳入 food 推荐的对应条目，给出当地能吃到它的推荐店与必点菜）。';
        }

        return [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ];
    }

    /**
     * @param array{destination: string, day_index: int, day: array, locked_stops: array<int, array>, travel_mode?: string, intensity?: string, daily_hours?: float} $input
     * @return array<int, array{role: string, content: string}>
     */
    private function buildDayMessages(array $input, bool $webSearch): array
    {
        $destination = trim((string) ($input['destination'] ?? ''));
        $dayIndex = max(1, (int) ($input['day_index'] ?? 1));
        $mode = (string) ($input['travel_mode'] ?? 'walking');
        $modeLabel = self::MODE_LABELS[$mode] ?? self::MODE_LABELS['walking'];
        $intensity = (string) ($input['intensity'] ?? 'standard');
        $intensityLabel = self::INTENSITY_LABELS[$intensity] ?? self::INTENSITY_LABELS['standard'];
        $intensityRule = self::INTENSITY_RULES[$intensity] ?? self::INTENSITY_RULES['standard'];
        $dailyHours = max(2.0, (float) ($input['daily_hours'] ?? 8));
        $currentDay = $this->jsonForPrompt($input['day'] ?? []);
        $lockedStops = $this->jsonForPrompt($input['locked_stops'] ?? []);

        $searchClause = $webSearch
            ? '可联网核对目的地当季信息（开放时间、顺路景点、临时闭园、热门美食），但不要输出来源说明。'
            : '不要声称你联网核对过信息。';

        $system = '你是专业旅游规划师，现在只重写某一天的行程，不重写整份攻略。'
            . $searchClause
            . '只输出一个 JSON 对象，禁止 markdown 代码块、禁止解释文字。'
            . '结构：{"index":整数,"title":"当日主题","routeTag":"路线主题，可省略",'
            . '"dayMood":"citywalk|nature|culture|food|family|couple|classic","handbookSummary":"写进手帐图底部的今日一句话，20-36个中文字符",'
            . '"stops":[{"name":"地点名","type":"sight|food|stay|shop|transit","time":"时间段","note":"简短实用 tips",'
            . '"poiInfo":{"openHours":"开放/营业时间，未知写出发前确认","reservation":"预约要求","ticket":"门票/消费","duration":"建议停留时长"},'
            . '"handbookText":"写进旅行手帐图的地点短句，1-2句，有画面感，不写票价/预约/开放时间",'
            . '"illustrationPrompt":"用于生成水彩旅行手帐插画的中文提示词，包含城市、地点、季节氛围、主体景物，禁止出现文字水印"}]}。'
            . '规则：' . $intensityRule
            . '本日游玩时长约 ' . rtrim(rtrim(sprintf('%.1f', $dailyHours), '0'), '.') . ' 小时；'
            . '4小时以内最多3个 stop，8小时以内最多5个，超过10小时才允许6个；'
            . '按真实游玩顺序排列，尽量不走回头路；必须保留锁定地点，且锁定地点必须放回原本 slot 位置（第几个 stop），name/type/time/note/handbookText 不要改；'
            . '未锁定地点可以替换、删减或新增，优先补顺路且可执行的景点/美食/休息点；'
            . '必须给 dayMood 和 handbookSummary；dayMood 只能从枚举中选一个；'
            . '每个 stop 必须给 poiInfo：openHours、reservation、ticket、duration；不确定的字段写“出发前确认”，不要编造精确价格或时间；'
            . '每个 stop 必须给 handbookText：像旅行日记短句，有画面感，不要重复 note，也不要写门票/预约/营业时间；'
            . '每个 stop 必须给 illustrationPrompt，用于后续生成水彩手帐插画，写清楚地点主体、城市氛围、白底水彩、手绘质感；'
            . '不要把火车站/机场等跨城枢纽列为 stops，除非当前锁定地点本来就是它。';

        $user = '目的地：' . ($destination !== '' ? $destination : '未知目的地')
            . '；重写 Day ' . $dayIndex
            . '；出行方式：' . $modeLabel
            . '；旅行强度：' . $intensityLabel
            . "。\n当前 day JSON：\n" . $currentDay
            . "\n锁定地点 JSON（slot 为 0-based 原位置，必须原位保留）：\n" . $lockedStops;

        return [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ];
    }

    /**
     * @param array{destination: string, day_index: int, stop_index: int, day: array, target_stop: array, locked_stops?: array<int, array>, travel_mode?: string, intensity?: string, daily_hours?: float} $input
     * @return array<int, array{role: string, content: string}>
     */
    private function buildReplaceStopMessages(array $input, bool $webSearch): array
    {
        $destination = trim((string) ($input['destination'] ?? ''));
        $dayIndex = max(1, (int) ($input['day_index'] ?? 1));
        $stopIndex = max(0, (int) ($input['stop_index'] ?? 0));
        $slotLabel = $stopIndex + 1;
        $mode = (string) ($input['travel_mode'] ?? 'walking');
        $modeLabel = self::MODE_LABELS[$mode] ?? self::MODE_LABELS['walking'];
        $intensity = (string) ($input['intensity'] ?? 'standard');
        $intensityLabel = self::INTENSITY_LABELS[$intensity] ?? self::INTENSITY_LABELS['standard'];
        $intensityRule = self::INTENSITY_RULES[$intensity] ?? self::INTENSITY_RULES['standard'];
        $dailyHours = max(2.0, (float) ($input['daily_hours'] ?? 8));
        $currentDay = $this->jsonForPrompt($input['day'] ?? []);
        $targetStop = $this->jsonForPrompt($input['target_stop'] ?? []);
        $lockedStops = $this->jsonForPrompt($input['locked_stops'] ?? []);

        $searchClause = $webSearch
            ? '可联网核对目的地当季开放、预约、票价和顺路关系，但不要输出来源说明。'
            : '不要声称你联网核对过信息。';

        $system = '你是专业旅游规划师，现在只替换某一天中的一个地点，不重写整天。'
            . $searchClause
            . '只输出一个 JSON 对象，禁止 markdown 代码块、禁止解释文字。'
            . '结构：{"name":"地点名","type":"sight|food|stay|shop|transit","time":"时间段","note":"简短实用 tips",'
            . '"poiInfo":{"openHours":"开放/营业时间，未知写出发前确认","reservation":"预约要求","ticket":"门票/消费","duration":"建议停留时长"},'
            . '"handbookText":"写进旅行手帐图的地点短句，1-2句，有画面感，不写票价/预约/开放时间",'
            . '"illustrationPrompt":"用于生成水彩旅行手帐插画的中文提示词，包含城市、地点、季节氛围、主体景物，禁止出现文字水印"}。'
            . '规则：' . $intensityRule
            . '本日游玩时长约 ' . rtrim(rtrim(sprintf('%.1f', $dailyHours), '0'), '.') . ' 小时；'
            . '只替换第 ' . $slotLabel . ' 个 stop，其它 stop 均由系统保留，你不要输出整天数组；'
            . '新地点必须和当天前后地点顺路，避免重复当天已有地点或与锁定地点同质过近；'
            . '优先保持原 stop 类型与时间段语义：原来是美食则换成顺路用餐点，原来是景点则换成顺路景点，除非用户当天结构明显需要休息/购物；'
            . '不要把火车站/机场等跨城枢纽作为替换地点，除非原 stop 本来就是交通枢纽；'
            . '每个 stop 必须给 poiInfo：openHours、reservation、ticket、duration；不确定的字段写“出发前确认”，不要编造精确价格或时间；'
            . '必须给 handbookText：像旅行日记短句，有画面感，不要重复 note，也不要写门票/预约/营业时间；'
            . '每个 stop 必须给 illustrationPrompt，用于后续生成水彩手帐插画，写清楚地点主体、城市氛围、白底水彩、手绘质感；'
            . 'note 写选择理由或实用提醒，不要超过 36 个中文字符。';

        $user = '目的地：' . ($destination !== '' ? $destination : '未知目的地')
            . '；Day ' . $dayIndex . '；替换第 ' . $slotLabel . ' 个 stop'
            . '；出行方式：' . $modeLabel
            . '；旅行强度：' . $intensityLabel
            . "。\n当前 day JSON：\n" . $currentDay
            . "\n待替换 stop JSON：\n" . $targetStop
            . "\n锁定地点 JSON（不能选择这些地点或同名地点）：\n" . $lockedStops;

        return [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ];
    }

    private function jsonForPrompt(mixed $value): string
    {
        try {
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return 'null';
        }
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
                    'poiInfo' => $this->parsePoiInfo($stop['poiInfo'] ?? null),
                    'handbookText' => is_string($stop['handbookText'] ?? null) ? trim((string) $stop['handbookText']) : '',
                    'illustrationPrompt' => is_string($stop['illustrationPrompt'] ?? null) ? trim((string) $stop['illustrationPrompt']) : '',
                ];
            }
            if ($stops === []) {
                continue; // 空天丢弃
            }
            $i++;
            $dayData = [
                'index' => $i,
                'title' => is_string($day['title'] ?? null) ? trim((string) $day['title']) : '',
                'dayMood' => $this->parseDayMood($day['dayMood'] ?? null),
                'handbookSummary' => is_string($day['handbookSummary'] ?? null) ? trim((string) $day['handbookSummary']) : '',
                'stops' => $stops,
            ];
            // routeTag：AI 标注的当日游览主题（如「西湖线」），可选
            $routeTag = is_string($day['routeTag'] ?? null) ? trim((string) $day['routeTag']) : '';
            if ($routeTag !== '') {
                $dayData['routeTag'] = $routeTag;
            }
            $days[] = $dayData;
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
            'packingMust' => $this->parseTips($data['packingMust'] ?? null),
            'packingNotes' => $this->parseTips($data['packingNotes'] ?? null),
            'intercity' => $this->parseIntercity($data['intercity'] ?? null),
        ];
    }

    /**
     * @return array{index: int, title: string, routeTag?: string, dayMood: string, handbookSummary: string, stops: array<int, array{name: string, type: string, time: string, note: string, handbookText: string}>}
     */
    private function parseDay(string $content, int $fallbackIndex): array
    {
        $text = trim($content);
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/is', $text, $m)) {
            $text = trim($m[1]);
        }

        try {
            $data = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('AI 返回的单日行程不是合法 JSON', 0, $e);
        }
        if (! is_array($data)) {
            throw new RuntimeException('AI 返回的单日行程格式错误');
        }

        $rawStops = is_array($data['stops'] ?? null) ? $data['stops'] : [];
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
                : '';
            if ($name === '') {
                continue;
            }
            $stops[] = [
                'name' => $name,
                'type' => $type,
                'time' => is_string($stop['time'] ?? null) ? trim((string) $stop['time']) : '',
                'note' => is_string($stop['note'] ?? null) ? trim((string) $stop['note']) : '',
                'poiInfo' => $this->parsePoiInfo($stop['poiInfo'] ?? null),
                'handbookText' => is_string($stop['handbookText'] ?? null) ? trim((string) $stop['handbookText']) : '',
                'illustrationPrompt' => is_string($stop['illustrationPrompt'] ?? null) ? trim((string) $stop['illustrationPrompt']) : '',
            ];
        }
        if ($stops === []) {
            throw new RuntimeException('AI 未返回有效单日地点');
        }

        $day = [
            'index' => (int) ($data['index'] ?? $fallbackIndex),
            'title' => is_string($data['title'] ?? null) ? trim((string) $data['title']) : '',
            'dayMood' => $this->parseDayMood($data['dayMood'] ?? null),
            'handbookSummary' => is_string($data['handbookSummary'] ?? null) ? trim((string) $data['handbookSummary']) : '',
            'stops' => $stops,
        ];
        $routeTag = is_string($data['routeTag'] ?? null) ? trim((string) $data['routeTag']) : '';
        if ($routeTag !== '') {
            $day['routeTag'] = $routeTag;
        }

        return $day;
    }

    /**
     * @return array{name: string, type: string, time: string, note: string, handbookText: string, poiInfo: array{openHours: string, reservation: string, ticket: string, duration: string}}
     */
    private function parseSingleStop(string $content): array
    {
        $text = trim($content);
        if (preg_match('/```(?:json)?\s*(.+?)\s*```/is', $text, $m)) {
            $text = trim($m[1]);
        }

        try {
            $data = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            throw new RuntimeException('AI 返回的替换地点不是合法 JSON', 0, $e);
        }
        if (! is_array($data)) {
            throw new RuntimeException('AI 返回的替换地点格式错误');
        }
        if (is_array($data['stop'] ?? null)) {
            $data = $data['stop'];
        }

        $type = (string) ($data['type'] ?? 'sight');
        if (! in_array($type, self::ALLOWED_TYPES, true)) {
            $type = 'sight';
        }
        $name = is_string($data['name'] ?? null) ? trim((string) $data['name']) : '';
        if ($name === '') {
            throw new RuntimeException('AI 未返回有效替换地点');
        }

        return [
            'name' => $name,
            'type' => $type,
            'time' => is_string($data['time'] ?? null) ? trim((string) $data['time']) : '',
            'note' => is_string($data['note'] ?? null) ? trim((string) $data['note']) : '',
            'poiInfo' => $this->parsePoiInfo($data['poiInfo'] ?? null),
            'handbookText' => is_string($data['handbookText'] ?? null) ? trim((string) $data['handbookText']) : '',
            'illustrationPrompt' => is_string($data['illustrationPrompt'] ?? null) ? trim((string) $data['illustrationPrompt']) : '',
        ];
    }

    /**
     * 解析 AI 返回的跨城段（真实耗时/里程/备注）。
     * 非数组返回 null；字段缺失/非法用 null（区别于 0，便于上层区分「没给」与「给了非法值」，两者都应回退兜底）。
     *
     * @return array{durationMin: int|null, distanceM: int|null, note: string}|null
     */
    private function parseIntercity(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        return [
            'durationMin' => $this->extractPositiveInt($raw['durationMin'] ?? null),
            'distanceM' => $this->extractPositiveInt($raw['distanceM'] ?? null),
            'note' => is_string($raw['note'] ?? null) ? trim((string) $raw['note']) : '',
        ];
    }

    /**
     * @return array{openHours: string, reservation: string, ticket: string, duration: string}
     */
    private function parsePoiInfo(mixed $raw): array
    {
        $empty = ['openHours' => '', 'reservation' => '', 'ticket' => '', 'duration' => ''];
        if (! is_array($raw)) {
            return $empty;
        }
        return [
            'openHours' => is_string($raw['openHours'] ?? null) ? trim((string) $raw['openHours']) : '',
            'reservation' => is_string($raw['reservation'] ?? null) ? trim((string) $raw['reservation']) : '',
            'ticket' => is_string($raw['ticket'] ?? null) ? trim((string) $raw['ticket']) : '',
            'duration' => is_string($raw['duration'] ?? null) ? trim((string) $raw['duration']) : '',
        ];
    }

    private function parseDayMood(mixed $raw): string
    {
        $mood = is_string($raw) ? trim($raw) : '';
        return in_array($mood, self::ALLOWED_DAY_MOODS, true) ? $mood : 'citywalk';
    }

    /**
     * 提取正整数：null/非正/无法解析 → null。
     * 兼容 GLM 把数字写成带单位的字符串（如 "120分钟"、"约 280 公里"）：取首段连续数字。
     */
    private function extractPositiveInt(mixed $v): ?int
    {
        if ($v === null) {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            return $v > 0 ? (int) round($v) : null;
        }
        if (is_string($v) && preg_match('/\d+/', $v, $m)) {
            $n = (int) $m[0];
            return $n > 0 ? $n : null;
        }
        return null;
    }

    /**
     * @return array<int, array{name: string, shop: string, dishes: array<int, string>, note: string, poiInfo: array{openHours: string, reservation: string, ticket: string, duration: string}}>
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
                'poiInfo' => $this->parsePoiInfo($item['poiInfo'] ?? null),
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
