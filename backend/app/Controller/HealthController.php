<?php

declare(strict_types=1);

namespace App\Controller;

class HealthController extends AbstractController
{
    public function index(): array
    {
        return $this->ok([
            'service' => 'shuxia-toolbox-api',
            'time' => date(DATE_ATOM),
        ]);
    }
}
