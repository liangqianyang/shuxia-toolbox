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
        Schema::create('jungle_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->unsignedBigInteger('red_user_id')->default(0)->comment('红方用户 id（创建者临时标签），0=空位');
            $table->unsignedBigInteger('blue_user_id')->default(0)->comment('蓝方用户 id，0=空位');
            $table->string('status', 16)->default('waiting')->comment('waiting/rps/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('pieces')->default(new Expression('(JSON_ARRAY())'))->comment('当前盘面快照 [{side,animal,r,c}…]');
            $table->string('turn', 8)->nullable()->comment('当前轮走方 red/blue，playing 起红先');
            $table->json('last_move')->nullable()->comment('最近一步 {fr,fc,tr,tc,captured?}，前端提示用');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->string('winner', 8)->nullable()->comment('red/blue');
            $table->string('win_reason', 16)->nullable()->comment('den/eliminated/stuck/forfeit');
            $table->json('rps')->nullable()->comment('猜拳定选边 {round, picks:{red?,blue?}, winner, chosen}');
            $table->datetime('turn_deadline_at')->nullable()->comment('rps 窗口截止（出拳 10s / 选边 8s），对局不限时');
            $table->json('chat')->nullable()->comment('聊天环形数组（最近 50 条，含 seq/uid/role/kind/text/ts）');
            $table->json('chat_last_at')->nullable()->comment('聊天冷却 {userId: 时间戳}');
            $table->datetime('red_seen_at')->nullable()->comment('红方心跳（轮询降级时判在线）');
            $table->datetime('blue_seen_at')->nullable()->comment('蓝方心跳');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_rps_deadline');
            $table->comment('联机斗兽棋房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'jungle'],
            [
                'name' => '斗兽棋',
                'description' => '猜拳选边联机对弈，鼠可吃象、狮虎跳河',
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/jungle-1.png',
                'route' => '/pages/jungle/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 120,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('jungle_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'jungle')->delete();
        Db::table('tool_catalog')->where('tool_key', 'jungle')->delete();
    }
};
