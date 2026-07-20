<?php

declare(strict_types=1);

use Monolog\Handler\RotatingFileHandler;
use Monolog\Level;

return [
    'default' => [
        'handler' => [
            'class' => RotatingFileHandler::class,
            'constructor' => [
                BASE_PATH . '/runtime/logs/hyperf.log',
                30,
                Level::Info,
                true,
                null,
                false,
                RotatingFileHandler::FILE_PER_DAY,
                '{filename}-{date}',
            ],
        ],
        'formatter' => [
            'class' => Monolog\Formatter\LineFormatter::class,
            'constructor' => [
                'format' => null,
                'dateFormat' => null,
                'allowInlineLineBreaks' => true,
            ],
        ],
    ],
];
