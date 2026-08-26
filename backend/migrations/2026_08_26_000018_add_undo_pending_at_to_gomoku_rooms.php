<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->datetime('undo_pending_at')->nullable()->comment('悔棋请求发起时间，超过 5 秒未处理视为拒绝')->after('undo_pending');
        });
    }

    public function down(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->dropColumn('undo_pending_at');
        });
    }
};
