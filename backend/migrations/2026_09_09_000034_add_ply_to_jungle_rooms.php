<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('jungle_rooms', function (Blueprint $table) {
            $table->unsignedInteger('ply')->default(0)->after('last_move')->comment('总手数（红先，每走一步 +1）');
        });
    }

    public function down(): void
    {
        Schema::table('jungle_rooms', function (Blueprint $table) {
            $table->dropColumn('ply');
        });
    }
};
