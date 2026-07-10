<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('food_pool_items', function (Blueprint $table) {
            $table->string('group_id', 80)->default('default')->after('client_id')->comment('所属饭池分组 client_id');
        });
    }

    public function down(): void
    {
        Schema::table('food_pool_items', function (Blueprint $table) {
            $table->dropColumn('group_id');
        });
    }
};
