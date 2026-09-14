<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    /**
     * game_scores 加 progress_detail（JSON 文本）：推箱子等关卡制游戏的每关进度明细
     * （{关卡id: {stars, bestSteps}}），客户端本机存储被微信清理后可从服务端恢复进度。
     * 聚合列（score/lines_cleared）继续服务排行榜，明细只服务本人进度恢复。
     */
    public function up(): void
    {
        Schema::table('game_scores', function (Blueprint $table) {
            $table->text('progress_detail')->nullable()->comment('关卡制游戏每关进度明细 JSON（本人恢复用）');
        });
    }

    public function down(): void
    {
        Schema::table('game_scores', function (Blueprint $table) {
            $table->dropColumn('progress_detail');
        });
    }
};
