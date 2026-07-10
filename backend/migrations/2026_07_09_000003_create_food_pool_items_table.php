<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('food_pool_items', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->default(0)->comment('所属用户 id');
            $table->string('client_id', 80)->default('')->comment('前端生成的条目 id');
            $table->string('name', 120)->default('')->comment('餐厅/菜品名称');
            $table->string('note', 255)->default('')->comment('备注');
            $table->string('address', 255)->default('')->comment('地址');
            $table->decimal('lat', 10, 7)->default(0)->comment('纬度，0 表示无坐标');
            $table->decimal('lng', 10, 7)->default(0)->comment('经度，0 表示无坐标');
            $table->string('source', 20)->default('pool')->comment('来源：pool/nearby 等');
            $table->integer('sort_order')->default(0)->comment('排序序号');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique(['user_id', 'client_id'], 'uniq_user_client');
            $table->index('user_id', 'idx_user_id');
            $table->comment('用户饭池条目');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('food_pool_items');
    }
};
