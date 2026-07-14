<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use App\Model\WechatUser;
use Hyperf\Contract\ConfigInterface;

/** 管理权限只由后端确认，前端页面仅按接口返回决定是否展示入口。 */
final class AdminAccessService
{
    /** @param array<int, string> $bootstrapOpenids */
    private array $bootstrapOpenids;

    public function __construct(private readonly ConfigInterface $config)
    {
        $openids = $this->config->get('app.admin_openids', []);
        $this->bootstrapOpenids = is_array($openids) ? array_values(array_filter(array_map('strval', $openids))) : [];
    }

    public function isAdmin(int $userId): bool
    {
        /** @var null|WechatUser $user */
        $user = WechatUser::query()->find($userId);
        if ($user === null) {
            return false;
        }
        if ((string) ($user->role ?? 'user') === 'admin') {
            return true;
        }
        if (! in_array((string) $user->openid, $this->bootstrapOpenids, true)) {
            return false;
        }

        $user->role = 'admin';
        $user->save();
        return true;
    }

    public function requireAdmin(int $userId): void
    {
        if (! $this->isAdmin($userId)) {
            throw new BizException(403, '没有工具运营权限');
        }
    }
}
