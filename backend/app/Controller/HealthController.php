<?php

declare(strict_types=1);

namespace App\Controller;

final class HealthController
{
    public function index(): array
    {
        return [
            'code' => 0,
            'message' => 'ok',
            'data' => [
                'service' => 'shuxia-toolbox-api',
                'time' => date(DATE_ATOM),
            ],
        ];
    }
}
