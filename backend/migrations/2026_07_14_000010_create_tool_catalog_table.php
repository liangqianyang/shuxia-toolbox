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
        Schema::create('tool_catalog', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->string('tool_key', 64)->comment('前端固定工具标识');
            $table->string('name', 80)->comment('工具名称');
            $table->string('description', 255)->default('')->comment('工具说明');
            $table->string('icon', 32)->default('')->comment('工具图标');
            $table->string('route', 160)->comment('小程序页面路由');
            $table->boolean('is_published')->default(true)->comment('是否上架');
            $table->unsignedInteger('sort_order')->default(0)->comment('新用户默认排序');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->unique('tool_key', 'uniq_tool_catalog_key');
            $table->index(['is_published', 'sort_order'], 'idx_tool_catalog_published_sort');
            $table->comment('工具目录与上架状态');
        });

        Db::table('tool_catalog')->insert([
            ['tool_key' => 'beads', 'name' => '拼豆图纸生成器', 'description' => '上传图片，生成拼豆图纸和用豆量统计', 'icon' => '🧩', 'route' => '/pages/beads/index', 'is_published' => true, 'sort_order' => 10],
            ['tool_key' => 'travel', 'name' => '旅游攻略图生成器', 'description' => '编辑行程，生成可分享的旅游攻略图', 'icon' => '🗺️', 'route' => '/pages/travel/index', 'is_published' => true, 'sort_order' => 20],
            ['tool_key' => 'food', 'name' => '今天吃什么', 'description' => '选地点和偏好，随机抽一家附近美食或常吃店', 'icon' => '🍜', 'route' => '/pages/food/index', 'is_published' => true, 'sort_order' => 30],
            ['tool_key' => 'lottery', 'name' => '枫叶签筒', 'description' => '抽奖品、随机抽取、随机分组，规则由你设置', 'icon' => '🍁', 'route' => '/pages/lottery/index', 'is_published' => true, 'sort_order' => 40],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('tool_catalog');
    }
};
