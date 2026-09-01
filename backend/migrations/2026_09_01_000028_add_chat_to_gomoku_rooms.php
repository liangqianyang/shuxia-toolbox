<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 五子棋房间聊天：环形消息数组 + 冷却表（列式存储与 gomoku_rooms 既有设计一致）
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->json('chat')->nullable()->comment('聊天环形数组（最近 50 条，含 seq/uid/kind/text/ts）');
            $table->json('chat_last_at')->nullable()->comment('聊天冷却 {userId: 时间戳}');
        });
    }

    public function down(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->dropColumn(['chat', 'chat_last_at']);
        });
    }
};
