<?php

declare(strict_types=1);

namespace App\Controller;

use App\Exception\BizException;
use App\Middleware\ApiKeyMiddleware;
use App\Service\BeadPaletteService;
use App\Service\WechatContentSecurityService;
use App\Service\WechatUserService;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\RateLimit\Annotation\RateLimit;
use Throwable;

class BeadController extends AbstractController
{
    public function __construct(
        private readonly BeadPaletteService $paletteService,
        private readonly WechatContentSecurityService $security,
        private readonly WechatUserService $users,
    ) {}

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

    /**
     * 拼豆图纸生成前内容安全确认。
     *
     * 拼豆图片当前在小程序本机处理，不上传后端；这里检测用户可控的生成参数摘要，
     * 保证拼豆功能在生成/保存可展示内容前已经接入微信内容安全 API。
     */
    #[RateLimit(create: 5, capacity: 10, key: [ApiKeyMiddleware::class, 'bucketKey'])]
    public function secCheck(RequestInterface $request): array
    {
        $openid = $this->users->openidByToken((string) $request->header('X-User-Token', ''));
        if ($openid === null || $openid === '') {
            throw new BizException(401, '请先微信登录');
        }

        $content = trim((string) $request->input('content', ''));
        if ($content === '') {
            $content = '拼豆图纸生成';
        }

        try {
            $safe = $this->security->checkText($content, $openid, 2);
        } catch (Throwable $e) {
            throw new BizException(500, '内容安全检测失败', null, $e);
        }

        if (! $safe) {
            throw new BizException(422, '内容含违规信息');
        }

        return $this->ok(['safe' => true]);
    }
}
