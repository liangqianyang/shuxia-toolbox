<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tool_catalog', function (Blueprint $table) {
            $table->string('category', 16)->default('tool')->comment('分类：tool 工具 / game 游戏')->after('tool_key');
            $table->index(['category', 'is_published', 'sort_order'], 'idx_tool_catalog_category_sort');
        });

        Db::table('tool_catalog')->where('tool_key', 'gomoku')->update(['category' => 'game']);
    }

    public function down(): void
    {
        Schema::table('tool_catalog', function (Blueprint $table) {
            $table->dropIndex('idx_tool_catalog_category_sort');
            $table->dropColumn('category');
        });
    }
};
