<?php

declare(strict_types=1);

// AI 服务商配置（Provider 接口绑定见 config/autoload/dependencies.php）。
// 注：Provider 实现直接读 getenv（与 TencentMapProvider 一致），本文件作为配置清单/文档。
return [
    'provider' => getenv('AI_PROVIDER') ?: 'zhipu',
    'zhipu' => [
        'key' => getenv('ZHIPU_API_KEY') ?: '',
        'base_url' => getenv('ZHIPU_BASE_URL') ?: 'https://open.bigmodel.cn/api/paas/v4',
        'model' => getenv('ZHIPU_MODEL') ?: 'glm-5.2',
        // disabled=关思考（更快更省，glm-5.2 支持）；enabled=开思考
        'thinking' => getenv('ZHIPU_THINKING') ?: 'disabled',
        // true=AI 自行联网搜索目的地最新信息再综合（质量高但慢/贵，约 10-30s）
        'web_search' => strtolower((string) (getenv('ZHIPU_WEB_SEARCH') ?: 'true')) !== 'false',
        'timeout' => (int) (getenv('AI_TIMEOUT') ?: 60),
    ],
];
