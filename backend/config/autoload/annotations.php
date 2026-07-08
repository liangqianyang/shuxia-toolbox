<?php

declare(strict_types=1);

// 注解扫描配置（Hyperf 3.x 从本文件读，config/config.php 里的 scan 是 2.x 遗留、不生效）。
// 补 paths=app/，使 #[RateLimit]/#[Inject] 等注解被 AnnotationCollector 收集、AOP 才会生成代理类。
// collectors 沿用 hyperf/di ConfigProvider 默认（AnnotationCollector + AspectCollector），故此处不重复声明。
return [
    'scan' => [
        'paths' => [
            BASE_PATH . '/app',
        ],
        'ignore_annotations' => [
            'mixin',
        ],
    ],
];
