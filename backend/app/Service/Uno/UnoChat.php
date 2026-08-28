<?php

declare(strict_types=1);

namespace App\Service\Uno;

/**
 * 枫趣牌局房间聊天预设：快捷句 + 表情面板（服务端权威白名单）。
 *
 * 前端 src/utils/unoChat.ts 是本类的同步镜像（改这里必须同步改那边，同拼豆色卡的双份约定）。
 * 预设内容是固定文案，无 UGC 风险、不经内容安全接口；自由文字（kind=text）走
 * WechatContentSecurityService 过审。客户端发 phrase 传 id、emoji 直接传表情字符，
 * 服务端映射/白名单校验，防止直连接口注入任意文案。
 */
final class UnoChat
{
    /** 单条自由文字最大长度（字符）。 */
    public const int TEXT_MAX_LENGTH = 40;

    /**
     * 快捷句 id => 文案。id 只用小写字母+下划线，前端按 id 引用。
     * 局势分组（出+4后/被质疑/有人剩1张…）是前端展示逻辑，这里只做全量白名单。
     *
     * @var array<string, string>
     */
    public const array PHRASES = [
        // 通用
        'calm' => '稳了稳了',
        'careful_next' => '下家小心点',
        'scared' => '怕了吧',
        // 出 +4 后
        'no_other_cards' => '我真没有别的牌了！',
        'doubt_me' => '不信你质疑啊',
        // 被质疑窗口
        'dare_bet' => '你敢赌吗？',
        'bet_lose6' => '赌一把，输 6 张哦',
        // 有人剩 1 张
        'block_him' => '拦住他！！',
        'dont_let_run' => '别让他跑了',
        'last_card_red' => '他最后一张八成是红色',
        'last_card_green' => '他最后一张八成是绿色',
        'last_card_yellow' => '他最后一张八成是黄色',
        'last_card_blue' => '他最后一张八成是蓝色',
        // 自己剩 1 张（真话或 bluff）
        'my_last_red' => '我最后一张是红的，信我',
        'my_last_not_green' => '我最后一张不是绿色',
        'guess_my_color' => '猜猜我最后一张什么颜色~',
        // 示弱（误导用）
        'bad_hand' => '我牌好烂…',
        'no_red_left' => '没红牌了没红牌了',
        'sob' => '呜呜呜',
    ];

    /** 表情面板：Unicode emoji 白名单（kind=emoji 时直接以表情字符为 id）。 */
    public const array EMOJIS = [
        '😀', '😂', '🤣', '😎', '🤔', '😏',
        '😭', '😡', '😱', '🥳', '😴', '🤡',
        '👍', '👎', '🙏', '🤝', '💪', '🔥',
        '❄️', '🍁', '🍀', '⚡️', '💣', '🎉',
        '😤', '🙃', '🙈',
    ];

    public static function phraseText(string $id): ?string
    {
        return self::PHRASES[$id] ?? null;
    }

    public static function isEmoji(string $emoji): bool
    {
        return in_array($emoji, self::EMOJIS, true);
    }
}
