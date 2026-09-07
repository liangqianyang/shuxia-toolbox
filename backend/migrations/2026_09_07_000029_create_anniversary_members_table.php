<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

class CreateAnniversaryMembersTable extends Migration
{
    public function up(): void
    {
        Schema::create('anniversary_members', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('anniversary_event_id');
            $table->unsignedBigInteger('user_id');
            $table->string('role', 12)->default('viewer')->comment('owner / editor / viewer');
            // 以下均为成员个人偏好（每人一份，共享互不影响）
            $table->unsignedTinyInteger('remind_days_before')->default(1)->comment('写入手机日历时提前几天提醒');
            $table->string('remind_time', 5)->default('09:00')->comment('日历提醒时刻 HH:mm');
            $table->string('card_template', 40)->default('minimal')->comment('纪念卡模板偏好');
            $table->string('card_tone', 24)->default('warm')->comment('纪念卡风格偏好');
            $table->string('cover_image', 600)->default('')->comment('个人封面图');
            $table->dateTime('calendar_added_at')->nullable()->comment('本成员写入手机日历的时间');
            $table->string('calendar_repeat_type', 16)->default('')->comment('本成员写入日历的重复类型');
            $table->timestamps();

            $table->unique(['anniversary_event_id', 'user_id'], 'uq_anniversary_member');
            $table->index(['user_id'], 'idx_anniversary_member_user');
        });

        // 回填：存量事件每条生成一行 owner 成员，偏好字段原样搬入
        \Hyperf\DbConnection\Db::statement(
            "INSERT INTO anniversary_members
                (anniversary_event_id, user_id, role, remind_days_before, remind_time,
                 card_template, card_tone, cover_image, calendar_added_at, calendar_repeat_type, created_at)
             SELECT id, user_id, 'owner', remind_days_before, '09:00',
                 card_template, card_tone, cover_image, calendar_added_at, calendar_repeat_type, NOW()
             FROM anniversary_events"
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('anniversary_members');
    }
}
