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
        Schema::create('xiangqi_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->unsignedBigInteger('red_user_id')->default(0)->comment('红方用户 id（猜拳前临时标签，胜者执红），0=空位');
            $table->unsignedBigInteger('blue_user_id')->default(0)->comment('黑方用户 id，0=空位');
            $table->string('status', 16)->default('waiting')->comment('waiting/rps/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('pieces')->default(new Expression('(JSON_ARRAY())'))->comment('双方 32 子快照 [{side,piece,r,c,alive}…]');
            $table->string('turn', 8)->nullable()->comment('当前轮走方 red/black，playing 起红先');
            $table->json('last_move')->nullable()->comment('最近一步 {fr,fc,tr,tc,captured?}');
            $table->json('last_event')->nullable()->comment('最近事件 {seq,type,text}');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->unsignedBigInteger('ply')->default(0)->comment('总手数');
            $table->string('winner', 8)->nullable()->comment('red/black');
            $table->string('win_reason', 16)->nullable()->comment('checkmate/stalemate/forfeit');
            $table->json('rps')->nullable()->comment('猜拳定红黑 {round, picks:{red?,black?}, lastPicks?, winner}');
            $table->datetime('turn_deadline_at')->nullable()->comment('窗口截止（出拳 10s / 走子 45s）');
            $table->json('chat')->nullable()->comment('聊天环形数组（最近 50 条）');
            $table->json('chat_last_at')->nullable()->comment('聊天冷却 {userId: 时间戳}');
            $table->datetime('red_seen_at')->nullable()->comment('红方心跳');
            $table->datetime('black_seen_at')->nullable()->comment('黑方心跳');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_xiangqi_deadline');
            $table->comment('联机象棋房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'xiangqi'],
            [
                'name' => '象棋',
                'description' => '经典中国象棋联机对弈：蹩马腿塞象眼，将军将死',
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/xiangqi-1.png',
                'route' => '/pages/xiangqi/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 140,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('xiangqi_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'xiangqi')->delete();
        Db::table('tool_catalog')->where('tool_key', 'xiangqi')->delete();
    }
};
