<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('travel_shares', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('code', 8)->default('')->comment('8 位分享码');
            $table->string('title', 160)->default('')->comment('行程标题');
            $table->json('payload')->default(new Expression('(JSON_OBJECT())'))->comment('完整行程数据');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('code', 'uniq_code');
            $table->index('created_at', 'idx_created_at');
            $table->comment('旅游行程分享');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('travel_shares');
    }
};
