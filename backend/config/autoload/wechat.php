<?php

declare(strict_types=1);

return [
    'mini_program' => [
        'appid' => getenv('WECHAT_MINI_APPID') ?: '',
        'secret' => getenv('WECHAT_MINI_SECRET') ?: '',
    ],
    'subscribe_templates' => [
        'anniversary_reminder' => getenv('WECHAT_SUBSCRIBE_TMPL_ANNIVERSARY') ?: 'Jy26nV_9a4EbDPNzccPmnZ_ojRZ4EYSu5rjzmD1CYfc',
    ],
];
