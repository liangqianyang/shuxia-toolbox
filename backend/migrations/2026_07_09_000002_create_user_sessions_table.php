<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_sessions', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->char('token_hash', 64)->default('')->comment('后端 token 的 sha256');
            $table->unsignedBigInteger('user_id')->default(0)->comment('所属用户 id');
            $table->datetime('expires_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('过期时间');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('last_seen_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('最后活跃时间');
            $table->unique('token_hash', 'uniq_token_hash');
            $table->index('user_id', 'idx_user_id');
            $table->index('expires_at', 'idx_expires_at');
            $table->comment('后端登录会话');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_sessions');
    }
};
