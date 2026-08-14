<?php

declare(strict_types=1);

return [
    // 地图服务商接口绑定：MAP_PROVIDER=amap 可切换高德，否则默认腾讯
    \App\Service\Map\MapProvider::class => (getenv('MAP_PROVIDER') ?: 'tencent') === 'amap'
        ? \App\Service\Map\AmapMapProvider::class
        : \App\Service\Map\TencentMapProvider::class,

    // AI 服务商接口绑定：AI_PROVIDER=deepseek 切换 DeepSeek（OpenAI 兼容协议），否则默认智谱 GLM。
    // 新增厂商只需在 App\Service\Ai 下加一个继承 AbstractAiProvider 的实现 + 这里加一个分支。
    \App\Service\Ai\AiProvider::class => match (getenv('AI_PROVIDER') ?: 'zhipu') {
        'deepseek' => \App\Service\Ai\DeepSeekProvider::class,
        default => \App\Service\Ai\ZhipuProvider::class,
    },
];
