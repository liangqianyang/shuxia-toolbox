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
        Schema::create('app_configs', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->string('config_key', 64)->unique()->comment('配置键，如 feature.ai_enabled');
            $table->string('config_value', 255)->default('')->comment('配置值（布尔存 "1"/"0"）');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('最后修改时间');
            $table->comment('应用级配置（功能开关等），运营台可改');
        });

        // 全局 AI 功能开关：默认关闭（个人主体小程序过审后由管理员手动开启）。
        Db::table('app_configs')->updateOrInsert(
            ['config_key' => 'feature.ai_enabled'],
            ['config_value' => '0', 'updated_at' => new Expression('CURRENT_TIMESTAMP')],
        );

        // 灵签工具描述不再提 AI：开关关闭期间工具箱列表里的文案也不能出现 AI 字样（审核可见）。
        Db::table('tool_catalog')->where('tool_key', 'fortune')->update([
            'description' => '观音关帝月老灵签 + 答案之书，摇一摇抽签，每日三签',
            'updated_at' => new Expression('CURRENT_TIMESTAMP'),
        ]);
    }

    public function down(): void
    {
        Db::table('tool_catalog')->where('tool_key', 'fortune')->update([
            'description' => '观音关帝月老灵签 + 答案之书，摇一摇抽签，AI 大师解签',
            'updated_at' => new Expression('CURRENT_TIMESTAMP'),
        ]);
        Schema::dropIfExists('app_configs');
    }
};
