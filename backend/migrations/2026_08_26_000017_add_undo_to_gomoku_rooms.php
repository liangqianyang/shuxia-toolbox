<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->unsignedTinyInteger('undo_black')->default(3)->comment('黑方剩余悔棋次数')->after('win_reason');
            $table->unsignedTinyInteger('undo_white')->default(3)->comment('白方剩余悔棋次数')->after('undo_black');
            $table->string('undo_pending', 8)->nullable()->comment('待同意的悔棋请求方：black/white')->after('undo_white');
        });
    }

    public function down(): void
    {
        Schema::table('gomoku_rooms', function (Blueprint $table) {
            $table->dropColumn(['undo_black', 'undo_white', 'undo_pending']);
        });
    }
};
