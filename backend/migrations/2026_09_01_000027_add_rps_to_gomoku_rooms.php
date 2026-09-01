<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 猜拳定选边：加入即进入 rps 阶段（双人各暗出一拳，胜者选执黑/执白）
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->json('rps')->nullable()->comment('猜拳定选边 {round, picks:{black?,white?}, winner, chosen}，胜负见服务层');
            $table->datetime('turn_deadline_at')->nullable()->comment('rps 窗口截止时间（出拳 10s / 选边 8s）');
        });
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->index(['status', 'turn_deadline_at'], 'idx_rps_deadline');
        });
    }

    public function down(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->dropIndex('idx_rps_deadline');
        });
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->dropColumn(['rps', 'turn_deadline_at']);
        });
    }
};
