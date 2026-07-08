<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Service\BeadPaletteService;
use Hyperf\HttpServer\Contract\RequestInterface;

class BeadController extends AbstractController
{
    public function __construct(private readonly BeadPaletteService $paletteService) {}

    public function palettes(): array
    {
        return $this->ok([
            'palettes' => $this->paletteService->palettes(),
        ]);
    }

    public function estimate(RequestInterface $request): array
    {
        $codes = $request->input('codes', []);
        $palette = $request->input('palette', 'mard-221');

        if (! is_array($codes)) {
            throw new BizException(422, 'codes must be an array');
        }

        return $this->ok([
            'total' => count($codes),
            'palette' => $this->paletteService->paletteMeta(is_string($palette) ? $palette : 'mard-221'),
            'items' => $this->paletteService->countCodes($codes, is_string($palette) ? $palette : 'mard-221'),
        ]);
    }
}
