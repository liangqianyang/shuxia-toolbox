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
        Schema::create('fortune_draws', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->comment('微信用户 id');
            $table->string('deck', 16)->comment('签种：guanyin/guandi/yuelao/book');
            $table->string('category', 16)->default('other')->comment('所问分类：career/wealth/love/health/study/other');
            $table->string('question', 200)->nullable()->comment('用户输入的具体问题（已过内容安全检测）');
            $table->unsignedSmallInteger('stick_no')->comment('签号（服务端 random_int 权威抽取）');
            $table->string('level', 8)->default('')->comment('签级：上上/上吉/中吉/中平/下下；答案之书为空');
            $table->text('ai_reading')->nullable()->comment('AI 解签结果 JSON 缓存（meaning/forYou/action/luckyHint）');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('抽签时间');
            $table->index(['user_id', 'created_at'], 'idx_user_created');
            $table->comment('每日灵签抽签记录（兼作每日三签配额计数）');
        });

        Schema::create('fortune_share_bonus', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->comment('微信用户 id');
            $table->date('bonus_date')->comment('加次生效日期');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('发放时间');
            $table->index(['user_id', 'bonus_date'], 'idx_user_date');
            $table->comment('分享加次记录：每行 +1 次抽签额度，每日最多 2 行');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'fortune'],
            [
                'name' => '每日灵签',
                'description' => '观音关帝月老灵签 + 答案之书，摇一摇抽签，AI 大师解签',
                'icon' => '🎋',
                'route' => '/pages/fortune/index',
                'category' => 'tool',
                'is_published' => true,
                'sort_order' => 30,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('fortune_draws');
        Schema::dropIfExists('fortune_share_bonus');
        Db::table('user_tool_preferences')->where('tool_key', 'fortune')->delete();
        Db::table('tool_catalog')->where('tool_key', 'fortune')->delete();
    }
};
