<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    /**
     * 游戏页面迁移至 pages-games 分包：tool_catalog 路由与各游戏房间 sharePath 同步更新。
     * 旧路径 /pages/<game>/index 保留兼容跳转页（透传 room 参数 redirectTo 新路径）。
     */
    public function up(): void
    {
        foreach (['gomoku', 'uno', 'jungle', 'tetris', 'sokoban', 'junqi', 'xiangqi', 'tictactoe'] as $game) {
            Db::table('tool_catalog')
                ->where('tool_key', $game)
                ->where('route', '/pages/' . $game . '/index')
                ->update(['route' => '/pages-games/' . $game . '/index']);
        }
    }

    public function down(): void
    {
        foreach (['gomoku', 'uno', 'jungle', 'tetris', 'sokoban', 'junqi', 'xiangqi', 'tictactoe'] as $game) {
            Db::table('tool_catalog')
                ->where('tool_key', $game)
                ->where('route', '/pages-games/' . $game . '/index')
                ->update(['route' => '/pages/' . $game . '/index']);
        }
    }
};
