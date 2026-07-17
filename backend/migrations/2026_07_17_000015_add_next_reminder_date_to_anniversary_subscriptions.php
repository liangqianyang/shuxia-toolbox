<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

class AddNextReminderDateToAnniversarySubscriptions extends Migration
{
    public function up(): void
    {
        Schema::table('anniversary_subscriptions', function (Blueprint $table): void {
            $table->date('next_occurrence_date')->nullable()->after('template_id')
                ->comment('前端预计算的下一公历发生日期，农历年变公历也变');
        });
    }

    public function down(): void
    {
        Schema::table('anniversary_subscriptions', function (Blueprint $table): void {
            $table->dropColumn('next_occurrence_date');
        });
    }
}
