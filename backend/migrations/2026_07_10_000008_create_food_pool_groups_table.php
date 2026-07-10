<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('food_pool_groups', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->default(0)->comment('所属用户 id');
            $table->string('client_id', 80)->default('')->comment('前端生成的分组 id');
            $table->string('name', 40)->default('')->comment('分组名称');
            $table->integer('sort_order')->default(0)->comment('排序序号');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique(['user_id', 'client_id'], 'uniq_user_client');
            $table->index('user_id', 'idx_user_id');
            $table->comment('用户饭池分组');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('food_pool_groups');
    }
};
