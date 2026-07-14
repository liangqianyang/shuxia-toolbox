<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('wechat_users', function (Blueprint $table) {
            $table->string('role', 20)->default('user')->after('avatar_url')->comment('用户角色：user/admin');
            $table->index('role', 'idx_wechat_users_role');
        });
    }

    public function down(): void
    {
        Schema::table('wechat_users', function (Blueprint $table) {
            $table->dropIndex('idx_wechat_users_role');
            $table->dropColumn('role');
        });
    }
};
