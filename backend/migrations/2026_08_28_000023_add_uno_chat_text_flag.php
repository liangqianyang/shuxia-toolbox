<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        // UNO 房间自由文字聊天开关：默认开（全部自由文字经 msg_sec_check 过审后才广播）。
        // 快捷句/表情是服务端白名单预设，不受此开关影响；审核有异议时运营台秒关。
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => 'feature.uno_chat_text'],
            ['config_value' => '1', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );
    }

    public function down(): void
    {
        Db::table('app_configs')->where('config_key', 'feature.uno_chat_text')->delete();
    }
};
