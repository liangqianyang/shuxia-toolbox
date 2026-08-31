<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        // 静态资源迁七牛云 CDN：图标不再打包进小程序（主包瘦身），
        // key 与包内原路径一致，见 frontend/scripts/upload_qiniu.py 与 frontend/src/utils/cdn.ts
        // icon 原为 varchar(32)，放不下完整 CDN URL，先扩列
        if (Db::selectOne("SHOW COLUMNS FROM tool_catalog LIKE 'icon'")->Type === 'varchar(32)') {
            Db::statement('ALTER TABLE tool_catalog MODIFY icon varchar(255) NOT NULL');
        }
        $cdn = 'https://oss.lqy-comic.com/fengye';
        Db::table('tool_catalog')
            ->whereIn('icon', ['/static/icons/uno-1.png', '/static/icons/ludo-1.png'])
            ->update([
                'icon' => new Expression("CONCAT('{$cdn}', icon)"),
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ]);
    }

    public function down(): void
    {
        Db::table('tool_catalog')
            ->where('icon', 'like', 'https://oss.lqy-comic.com/fengye/static/icons/%')
            ->update([
                'icon' => new Expression("REPLACE(icon, 'https://oss.lqy-comic.com/fengye', '')"),
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ]);
    }
};
