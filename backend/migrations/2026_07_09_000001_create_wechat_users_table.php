<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('wechat_users', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->string('openid', 80)->default('')->comment('微信 openid');
            $table->string('unionid', 80)->default('')->comment('微信 unionid，无则空串');
            $table->string('nickname', 120)->default('')->comment('昵称');
            $table->string('avatar_url', 600)->default('')->comment('头像 URL');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('创建时间');
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'))->comment('更新时间');
            $table->unique('openid', 'uniq_openid');
            $table->index('unionid', 'idx_unionid');
            $table->comment('微信小程序用户');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wechat_users');
    }
};
