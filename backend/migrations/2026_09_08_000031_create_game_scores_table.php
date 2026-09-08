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
        // 通用单机游戏成绩表（game_key 维度，每用户保最好）——俄罗斯方块是首个使用者，后续单机游戏复用。
        Schema::create('game_scores', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->string('game_key', 32)->comment('游戏标识（tetris…）');
            $table->unsignedBigInteger('user_id')->comment('用户 id');
            $table->unsignedInteger('score')->default(0)->comment('最好成绩');
            // MySQL 里 LINES 是保留字（LOAD DATA … LINES），列名用 lines_cleared
            $table->unsignedSmallInteger('lines_cleared')->default(0)->comment('总消行');
            $table->unsignedTinyInteger('level')->default(1)->comment('达到等级');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique(['game_key', 'user_id'], 'uniq_game_user');
            $table->index(['game_key', 'score'], 'idx_game_score');
            $table->comment('单机游戏最好成绩（排行榜）');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'tetris'],
            [
                'name' => '俄罗斯方块',
                'description' => '经典方块 · 手势操作 · 等级挑战与排行榜',
                // 图标走 CDN 全 URL（000025 之后的约定），素材在 frontend/cdn-assets/static/icons/
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/tetris-1.png',
                'route' => '/pages/tetris/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 100,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('game_scores');
        Db::table('user_tool_preferences')->where('tool_key', 'tetris')->delete();
        Db::table('tool_catalog')->where('tool_key', 'tetris')->delete();
    }
};
