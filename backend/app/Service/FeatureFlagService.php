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

    private const UNO_CHAT_TEXT_KEY = 'feature.uno_chat_text';

    private const ADVENTURE_CHAT_TEXT_KEY = 'feature.adventure_chat_text';

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

    /**
     * UNO 房间自由文字聊天开关：与 AI 开关不同，默认开——
     * 自由文字全量经 msg_sec_check 过审才广播，合规路径完整；
     * 行值未配置（迁移未跑）也视为开，审核有异议时运营台秒关，快捷句/表情不受影响。
     */
    public function unoChatTextEnabled(): bool
    {
        $value = Db::table('app_configs')->where('config_key', self::UNO_CHAT_TEXT_KEY)->value('config_value');
        return $value !== '0';
    }

    public function setUnoChatTextEnabled(bool $enabled): bool
    {
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => self::UNO_CHAT_TEXT_KEY],
            ['config_value' => $enabled ? '1' : '0', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );
        return $enabled;
    }

    /** 自由文字发送入口统一调用：关闭时抛 403（前端隐藏文字输入、保留快捷句/表情）。 */
    public function requireUnoChatTextEnabled(): void
    {
        if (! $this->unoChatTextEnabled()) {
            throw new BizException(403, '文字聊天维护中，快捷句和表情仍可用');
        }
    }

    /** 冒险棋房间自由文字聊天开关：语义与 UNO 同（默认开、审核有异议秒关、快捷句/表情/贴纸不受影响）。 */
    public function adventureChatTextEnabled(): bool
    {
        $value = Db::table('app_configs')->where('config_key', self::ADVENTURE_CHAT_TEXT_KEY)->value('config_value');
        return $value !== '0';
    }

    public function setAdventureChatTextEnabled(bool $enabled): bool
    {
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => self::ADVENTURE_CHAT_TEXT_KEY],
            ['config_value' => $enabled ? '1' : '0', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );
        return $enabled;
    }

    public function requireAdventureChatTextEnabled(): void
    {
        if (! $this->adventureChatTextEnabled()) {
            throw new BizException(403, '文字聊天维护中，快捷句、表情和贴纸仍可用');
        }
    }
}
