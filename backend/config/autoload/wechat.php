<?php

declare(strict_types=1);

return [
    'mini_program' => [
        'appid' => getenv('WECHAT_MINI_APPID') ?: '',
        'secret' => getenv('WECHAT_MINI_SECRET') ?: '',
    ],
];
