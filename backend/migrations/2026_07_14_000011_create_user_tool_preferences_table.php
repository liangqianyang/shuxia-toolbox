<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_tool_preferences', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->comment('用户 id');
            $table->string('tool_key', 64)->comment('工具标识');
            $table->unsignedInteger('sort_order')->default(0)->comment('用户首页顺序');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->unique(['user_id', 'tool_key'], 'uniq_user_tool_preference');
            $table->index(['user_id', 'sort_order'], 'idx_user_tool_preference_sort');
            $table->comment('用户首页工具选择与排序');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_tool_preferences');
    }
};
