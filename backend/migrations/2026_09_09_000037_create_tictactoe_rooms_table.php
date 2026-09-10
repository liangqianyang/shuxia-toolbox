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
        Schema::create('tictactoe_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->unsignedBigInteger('x_user_id')->default(0)->comment('执 X 用户 id（猜拳前临时标签），0=空位');
            $table->unsignedBigInteger('o_user_id')->default(0)->comment('执 O 用户 id，0=空位');
            $table->string('status', 16)->default('waiting')->comment('waiting/rps/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('board')->default(new Expression('(JSON_ARRAY(null,null,null,null,null,null,null,null,null))'))->comment('9 格棋盘 "x"|"o"|null');
            $table->string('turn', 4)->nullable()->comment('当前落子方 x/o，X 永远先行');
            $table->json('scores')->nullable()->comment('连绩计数 {x, o, draw}，跨局累计');
            $table->unsignedTinyInteger('win_line')->nullable()->comment('胜利线在 LINES 中的下标');
            $table->string('winner', 8)->nullable()->comment('x/o/draw');
            $table->string('win_reason', 16)->nullable()->comment('line/draw/forfeit');
            $table->json('rps')->nullable()->comment('首局猜拳定 X {round, picks:{red?,black?}, lastPicks?, winner}');
            $table->datetime('turn_deadline_at')->nullable()->comment('窗口截止（出拳 10s / 落子 20s）');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->json('last_event')->nullable()->comment('最近事件 {seq,type,text}');
            $table->json('chat')->nullable()->comment('聊天环形数组（最近 50 条）');
            $table->json('chat_last_at')->nullable()->comment('聊天冷却 {userId: 时间戳}');
            $table->datetime('x_seen_at')->nullable()->comment('X 方心跳');
            $table->datetime('o_seen_at')->nullable()->comment('O 方心跳');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_tictactoe_deadline');
            $table->comment('联机井字棋房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'tictactoe'],
            [
                'name' => '井字棋',
                'description' => '三连成线的联机快局：猜拳定先手，20 秒一落子',
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/tictactoe-1.png',
                'route' => '/pages/tictactoe/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 150,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('tictactoe_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'tictactoe')->delete();
        Db::table('tool_catalog')->where('tool_key', 'tictactoe')->delete();
    }
};
