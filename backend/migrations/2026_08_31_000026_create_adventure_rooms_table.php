<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('adventure_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->string('status', 16)->default('waiting')->comment('waiting/playing/saved/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('seats')->default(new Expression('(JSON_ARRAY())'))->comment('座位顺序 [userId…]');
            $table->json('state')->default(new Expression('(JSON_OBJECT())'))->comment('完整对局快照（positions/leaves/items/weather/pending 等，服务端权威）');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->unsignedBigInteger('winner_user_id')->nullable()->comment('冠军用户 id');
            $table->string('win_reason', 16)->nullable()->comment('finish/forfeit/last_man');
            $table->datetime('turn_deadline_at')->nullable()->comment('当前窗口截止时间（掷骰 20s/决策 10s/选择 8s/决斗 10s）');
            $table->datetime('paused_at')->nullable()->comment('房主保存对局的时间（saved 状态）');
            $table->json('seen_at')->default(new Expression('(JSON_OBJECT())'))->comment('心跳 {userId: 时间串}，轮询降级判在线');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_deadline');
            $table->comment('枫趣冒险联机房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'adventure'],
            [
                'name' => '枫趣冒险',
                'description' => '2-6 人联机 · 蛇形山道 · 决斗押注与天气预报的冒险棋',
                // 图标走 CDN 全 URL（000025 之后的约定），素材在 frontend/cdn-assets/static/icons/
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/adventure-1.png',
                'route' => '/pages-adventure/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 90,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );

        // 聊天自由文字开关（与 feature.uno_chat_text 同机制，默认开）
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => 'feature.adventure_chat_text'],
            ['config_value' => '1', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('adventure_rooms');
        Db::table('app_configs')->where('config_key', 'feature.adventure_chat_text')->delete();
        Db::table('user_tool_preferences')->where('tool_key', 'adventure')->delete();
        Db::table('tool_catalog')->where('tool_key', 'adventure')->delete();
    }
};
