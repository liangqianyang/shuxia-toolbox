<?php

declare(strict_types=1);

namespace App\Service;

use App\Exception\BizException;
use Hyperf\Database\Query\Expression;
use Hyperf\DbConnection\Db;

/**
 * 全局功能开关（存 app_configs 表，运营台维护）。
 *
 * AI 开关是「个人主体不能提供深度合成服务」的合规手段：关闭时服务端硬拦截所有 AI 接口
 * （不能只靠前端隐藏入口），开启后由管理员在运营台手动放行。
 * 每次请求直接读库，不用缓存——开关变更要立即生效，且这是单行主键查询，开销可忽略。
 */
final class FeatureFlagService
{
    private const AI_ENABLED_KEY = 'feature.ai_enabled';

    public function aiEnabled(): bool
    {
        $value = Db::table('app_configs')->where('config_key', self::AI_ENABLED_KEY)->value('config_value');
        return $value === '1';
    }

    public function setAiEnabled(bool $enabled): bool
    {
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => self::AI_ENABLED_KEY],
            ['config_value' => $enabled ? '1' : '0', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );
        return $enabled;
    }

    /** AI 接口入口统一调用：关闭时抛 403，前端按 message 原样提示。 */
    public function requireAiEnabled(): void
    {
        if (! $this->aiEnabled()) {
            throw new BizException(403, 'AI 功能维护中，暂不可用');
        }
    }
}
