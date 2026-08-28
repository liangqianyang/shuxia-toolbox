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
        Schema::create('ludo_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位房间码');
            $table->string('status', 16)->default('waiting')->comment('waiting/playing/finished/closed');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('seats')->default(new Expression('(JSON_ARRAY())'))->comment('座位顺序 [userId…]');
            $table->json('state')->default(new Expression('(JSON_OBJECT())'))->comment('完整对局快照（planes/phase/currentSeat/legalMoves 等，服务端权威）');
            $table->unsignedBigInteger('version')->default(0)->comment('状态版本号，每次变更 +1');
            $table->unsignedBigInteger('winner_user_id')->nullable()->comment('冠军用户 id');
            $table->string('win_reason', 16)->nullable()->comment('finish/forfeit/last_man');
            $table->datetime('turn_deadline_at')->nullable()->comment('当前阶段截止时间（掷骰/走子各 20s）');
            $table->json('seen_at')->default(new Expression('(JSON_OBJECT())'))->comment('心跳 {userId: 时间串}，轮询降级判在线');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('updated_at', 'idx_updated_at');
            $table->index(['status', 'turn_deadline_at'], 'idx_deadline');
            $table->comment('飞行棋联机房间');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'ludo'],
            [
                'name' => '飞行棋',
                'description' => '2-4 人联机 · 经典规则 · 掷骰起飞飞跃终点',
                'icon' => '/static/icons/ludo-1.png',
                'route' => '/pages-ludo/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 80,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('ludo_rooms');
        Db::table('user_tool_preferences')->where('tool_key', 'ludo')->delete();
        Db::table('tool_catalog')->where('tool_key', 'ludo')->delete();
    }
};
