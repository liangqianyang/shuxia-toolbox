<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        // 推箱子上架：纯单机关卡制（成绩复用 game_scores，game_key='sokoban'，本迁移无 schema 变更）。
        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'sokoban'],
            [
                'name' => '推箱子',
                'description' => '帮小屋归置物资过冬 · 五章一百关 · 步数评星与收星总榜',
                // 图标走 CDN 全 URL（000025 之后的约定），素材在 frontend/cdn-assets/static/icons/
                'icon' => 'https://oss.lqy-comic.com/fengye/static/icons/sokoban-1.png',
                'route' => '/pages/sokoban/index',
                'category' => 'game',
                'is_published' => true,
                'sort_order' => 110,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Db::table('user_tool_preferences')->where('tool_key', 'sokoban')->delete();
        Db::table('tool_catalog')->where('tool_key', 'sokoban')->delete();
        Db::table('game_scores')->where('game_key', 'sokoban')->delete();
    }
};
