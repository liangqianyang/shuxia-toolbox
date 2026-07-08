<?php

declare(strict_types=1);

// 应用级配置。鉴权 key 由 env 注入（.env 填 APP_API_KEY，前端随 X-API-Key 请求头带上）。
return [
    'api_key' => getenv('APP_API_KEY') ?: '',
];
