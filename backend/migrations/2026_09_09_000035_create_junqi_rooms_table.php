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
        Schema::create('junqi_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->unsignedBigInteger('red_user_id')->default(0)->comment('红方用户 id（猜拳前临时标签，胜者定红），0=空位');
            $table->unsignedBigInteger('blue_user_id')->default(0)->comment('蓝方用户 id，0=空位');
            $table->string('status', 16)->default('waiting')->comment('waiting/layout/rps/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('pieces')->default(new Expression('(JSON_ARRAY())'))->comment('双方 50 子快照 [{side,rank,r,c,alive,revealed}…]');
            $table->json('ready')->nullable()->comment('布阵就绪标 {red: bool, blue: bool}');
            $table->string('turn', 8)->nullable()->comment('当前轮走方 red/blue，playing 起猜拳胜者（红）先');
            $table->json('last_move')->nullable()->comment('最近一步 {fr,fc,tr,tc,result,captured?}，前端提示用');
            $table->json('last_event')->nullable()->comment('最近事件 {seq,type,text}，前端播报条+音效');
            $table->json('flag_revealed')->nullable()->comment('司令阵亡亮旗标 {red: bool, blue: bool}');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->unsignedBigInteger('ply')->default(0)->comment('总手数（含双方）');
            $table->string('winner', 8)->nullable()->comment('red/blue');
            $table->string('win_reason', 16)->nullable()->comment('flag/eliminated/stuck/forfeit');
            $table->json('rps')->nullable()->comment('猜拳定先手 {round, picks:{red?,blue?}, lastPicks?, winner}');
            $table->datetime('turn_deadline_at')->nullable()->comment('窗口截止（布阵 300s / 出拳 10s / 走子 45s）');
            $table->json('chat')->nullable()->comment('聊天环形数组（最近 50 条，含 seq/uid/role/kind/text/ts）');
            $table->json('chat_last_at')->nullable()->comment('聊天冷却 {userId: 时间戳}');
            $table->datetime('red_seen_at')->nullable()->comment('红方心跳（轮询降级时判在线）');
            $table->datetime('blue_seen_at')->nullable()->comment('蓝方心跳');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_junqi_deadline');
            $table->comment('联机军棋（两人暗棋）房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'junqi'],
            [
                'name' => '军棋',
                'description' => '两人暗棋联机对弈：布阵猜拳、炸弹地雷工兵，扛旗获胜',
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/junqi-1.png',
                'route' => '/pages/junqi/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 130,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('junqi_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'junqi')->delete();
        Db::table('tool_catalog')->where('tool_key', 'junqi')->delete();
    }
};
