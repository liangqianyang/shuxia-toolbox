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
        Schema::create('gomoku_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->unsignedBigInteger('black_user_id')->default(0)->comment('黑方用户 id（创建者），0=空位');
            $table->unsignedBigInteger('white_user_id')->default(0)->comment('白方用户 id，0=空位');
            $table->string('status', 16)->default('waiting')->comment('waiting/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('moves')->default(new Expression('(JSON_ARRAY())'))->comment('有序落子 [{x,y}…]，奇偶定色（0=黑）');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->string('winner', 8)->nullable()->comment('black/white，和局为 null');
            $table->json('win_line')->nullable()->comment('五连坐标 [[x,y]…]，前端高亮用');
            $table->string('win_reason', 16)->nullable()->comment('five/forfeit/draw');
            $table->datetime('black_seen_at')->nullable()->comment('黑方心跳（轮询降级时判在线）');
            $table->datetime('white_seen_at')->nullable()->comment('白方心跳');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->comment('联机五子棋房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'gomoku'],
            [
                'name' => '五子棋',
                'description' => '创建房间，邀请好友联机对弈',
                'icon' => '⚫',
                'route' => '/pages/gomoku/index',
                'is_published' => true,
                'sort_order' => 60,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('gomoku_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'gomoku')->delete();
        Db::table('tool_catalog')->where('tool_key', 'gomoku')->delete();
    }
};
