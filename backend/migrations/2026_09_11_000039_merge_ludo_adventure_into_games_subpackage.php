<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    /**
     * 飞行棋/枫趣冒险并入 pages-games 分包（游戏代码全部归拢进单一分包,
     * 主包不再存在仅分包使用的 JS）：tool_catalog 路由与房间 sharePath 同步更新。
     * 旧路径 /pages-ludo/index、/pages-adventure/index 保留 11 行 redirectTo 兼容壳页（老分享卡仍可进房）。
     */
    public function up(): void
    {
        Db::table('tool_catalog')
            ->where('tool_key', 'ludo')
            ->where('route', '/pages-ludo/index')
            ->update(['route' => '/pages-games/ludo/index']);

        Db::table('tool_catalog')
            ->where('tool_key', 'adventure')
            ->where('route', '/pages-adventure/index')
            ->update(['route' => '/pages-games/adventure/index']);
    }

    public function down(): void
    {
        Db::table('tool_catalog')
            ->where('tool_key', 'ludo')
            ->where('route', '/pages-games/ludo/index')
            ->update(['route' => '/pages-ludo/index']);

        Db::table('tool_catalog')
            ->where('tool_key', 'adventure')
            ->where('route', '/pages-games/adventure/index')
            ->update(['route' => '/pages-adventure/index']);
    }
};
