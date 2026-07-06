<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\BeadPaletteService;
use Hyperf\HttpServer\Contract\RequestInterface;

final class BeadController
{
    public function __construct(private readonly BeadPaletteService $paletteService) {}

    public function palettes(): array
    {
        return [
            'code' => 0,
            'message' => 'ok',
            'data' => [
                'palettes' => $this->paletteService->palettes(),
            ],
        ];
    }

    public function estimate(RequestInterface $request): array
    {
        $codes = $request->input('codes', []);
        $palette = $request->input('palette', 'mard-221');

        if (! is_array($codes)) {
            return [
                'code' => 422,
                'message' => 'codes must be an array',
                'data' => null,
            ];
        }

        return [
            'code' => 0,
            'message' => 'ok',
            'data' => [
                'total' => count($codes),
                'palette' => $this->paletteService->paletteMeta(is_string($palette) ? $palette : 'mard-221'),
                'items' => $this->paletteService->countCodes($codes, is_string($palette) ? $palette : 'mard-221'),
            ],
        ];
    }
}
