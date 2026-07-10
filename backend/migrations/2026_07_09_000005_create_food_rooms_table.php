<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('food_rooms', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 4)->default('')->comment('4 位饭局分享码');
            $table->unsignedBigInteger('owner_user_id')->default(0)->comment('房主用户 id');
            // JSON 列不支持字面量默认值，MySQL 8.0.13+ 允许表达式默认值
            $table->json('payload')->default(new Expression('(JSON_OBJECT())'))->comment('前端饭局状态快照');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('owner_user_id', 'idx_owner_user_id');
            $table->comment('饭局房间');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('food_rooms');
    }
};
