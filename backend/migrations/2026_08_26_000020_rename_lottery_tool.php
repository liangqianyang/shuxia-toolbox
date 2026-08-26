<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        Db::table('tool_catalog')->where('tool_key', 'lottery')->update([
            'name' => '枫叶抽奖',
            'icon' => '🎉',
            'updated_at' => new Expression('CURRENT_TIMESTAMP'),
        ]);
    }

    public function down(): void
    {
        Db::table('tool_catalog')->where('tool_key', 'lottery')->update([
            'name' => '枫叶签筒',
            'icon' => '🍁',
            'updated_at' => new Expression('CURRENT_TIMESTAMP'),
        ]);
    }
};
