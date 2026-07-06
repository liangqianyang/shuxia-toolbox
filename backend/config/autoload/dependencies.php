<?php

declare(strict_types=1);

return [
    // 地图服务商接口绑定：首版腾讯，后续换高德只需改这一行 + 新增 Provider 实现
    \App\Service\Map\MapProvider::class => \App\Service\Map\TencentMapProvider::class,

    // AI 服务商接口绑定：首版智谱 GLM，后续换 OpenAI/通义只需改这一行 + 新增 Provider 实现
    \App\Service\Ai\AiProvider::class => \App\Service\Ai\ZhipuProvider::class,
];
