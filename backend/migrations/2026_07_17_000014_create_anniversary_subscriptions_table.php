<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

class CreateAnniversarySubscriptionsTable extends Migration
{
    public function up(): void
    {
        Schema::create('anniversary_subscriptions', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('anniversary_event_id');
            $table->string('template_id', 64)->comment('微信订阅消息模板ID');
            $table->string('status', 16)->default('pending')->comment('pending / sent / expired');
            $table->dateTime('subscribed_at');
            $table->dateTime('sent_at')->nullable();
            $table->dateTime('created_at');
            $table->dateTime('updated_at')->nullable();

            $table->index(['user_id', 'status']);
            $table->index(['anniversary_event_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('anniversary_subscriptions');
    }
}
