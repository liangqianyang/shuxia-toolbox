<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\AnniversaryService;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;

#[Command]
class SendAnniversaryRemindersCommand extends HyperfCommand
{
    protected ?string $name = 'anniversary:send-reminders';
    protected string $description = '扫描待发送的纪念日订阅消息并推送微信提醒。';

    public function __construct(
        private readonly AnniversaryService $anniversaries,
    ) {
        parent::__construct();
    }

    public function handle(): void
    {
        $result = $this->anniversaries->sendDueReminders();
        $this->line("发送: {$result['sent']} 条，错误: " . count($result['errors']));

        foreach ($result['errors'] as $error) {
            $this->warn((string) $error);
        }
    }
}
