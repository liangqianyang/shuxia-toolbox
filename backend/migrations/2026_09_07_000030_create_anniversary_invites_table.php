<?php

declare(strict_types=1);

use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

class CreateAnniversaryInvitesTable extends Migration
{
    public function up(): void
    {
        Schema::create('anniversary_invites', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->char('code', 8)->comment('一次性邀请码，8 位十六进制');
            $table->unsignedBigInteger('anniversary_event_id');
            $table->unsignedBigInteger('inviter_user_id');
            $table->string('role', 12)->default('viewer')->comment('接受后获得的权限 editor / viewer');
            $table->string('status', 16)->default('pending')->comment('pending / accepted / expired');
            $table->dateTime('expires_at')->comment('创建后 24 小时');
            $table->unsignedBigInteger('accepted_by')->nullable();
            $table->dateTime('accepted_at')->nullable();
            $table->timestamps();

            $table->unique(['code'], 'uq_anniversary_invite_code');
            $table->index(['anniversary_event_id'], 'idx_anniversary_invite_event');
            $table->index(['status', 'expires_at'], 'idx_anniversary_invite_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('anniversary_invites');
    }
}
