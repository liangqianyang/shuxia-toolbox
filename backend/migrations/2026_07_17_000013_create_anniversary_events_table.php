<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Query\Expression;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('anniversary_events', function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键');
            $table->unsignedBigInteger('user_id')->comment('用户 ID');
            $table->string('title', 80)->comment('纪念日标题');
            $table->string('scene_type', 24)->default('custom')->comment('场景：birthday/relationship/wedding/travel/deadline/baby/habit/custom');
            $table->date('event_date')->comment('公历日期；农历事件存所选/换算时的公历锚点');
            $table->string('calendar_type', 12)->default('solar')->comment('日期类型：solar/lunar');
            $table->unsignedSmallInteger('lunar_year')->nullable()->comment('农历年');
            $table->unsignedTinyInteger('lunar_month')->nullable()->comment('农历月');
            $table->unsignedTinyInteger('lunar_day')->nullable()->comment('农历日');
            $table->boolean('is_lunar_leap_month')->default(false)->comment('是否农历闰月');
            $table->string('repeat_type', 16)->default('none')->comment('重复：none/yearly');
            $table->string('count_mode', 16)->default('countdown')->comment('计数：countdown/countup');
            $table->unsignedTinyInteger('remind_days_before')->default(1)->comment('写入手机日历时提前几天提醒');
            $table->datetime('calendar_added_at')->nullable()->comment('最近一次写入手机日历时间');
            $table->string('calendar_repeat_type', 16)->default('')->comment('写入手机日历时使用的重复类型');
            $table->string('cover_image', 600)->default('')->comment('本机封面图路径或远程图');
            $table->string('card_template', 40)->default('minimal')->comment('默认纪念卡模板');
            $table->string('card_tone', 24)->default('warm')->comment('默认卡片语气/色调');
            $table->unsignedInteger('sort_order')->default(0)->comment('用户自定义排序');
            $table->datetime('created_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->datetime('updated_at')->default(new Expression('CURRENT_TIMESTAMP'));
            $table->index(['user_id', 'sort_order', 'id'], 'idx_anniversary_user_sort');
            $table->index(['user_id', 'event_date'], 'idx_anniversary_user_date');
            $table->comment('用户纪念日与倒数日');
        });

        Db::table('tool_catalog')->updateOrInsert(
            ['tool_key' => 'anniversary'],
            [
                'name' => '时光纪念卡',
                'description' => '记录纪念日、倒数提醒，生成可保存的纪念卡',
                'icon' => '📅',
                'route' => '/pages/anniversary/index',
                'is_published' => true,
                'sort_order' => 50,
                'updated_at' => new Expression('CURRENT_TIMESTAMP'),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('anniversary_events');
        Db::table('user_tool_preferences')->where('tool_key', 'anniversary')->delete();
        Db::table('tool_catalog')->where('tool_key', 'anniversary')->delete();
    }
};
