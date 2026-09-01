<?php

declare(strict_types=1);

namespace App\Service\Chat;

/**
 * 通用房间聊天预设（飞行棋/五子棋共用）：快捷句 + 表情 + 贴纸（服务端权威白名单）。
 *
 * 前端 src/utils/gameChat.ts 是本类的同步镜像（改这里必须同步改那边，同 unoChat/adventureChat
 * 的双份约定）。预设内容是固定文案/固定美术，无 UGC 风险、不经内容安全接口；自由文字
 * （kind=text）走 WechatContentSecurityService 过审，开关复用 feature.uno_chat_text
 * （一个开关管所有房间聊天的自由文字，快捷句/表情/贴纸不受影响）。
 * 贴纸资源与冒险棋同一套（frontend/cdn-assets/pages-adventure/static/stickers/，已在 CDN）。
 */
final class GameChat
{
    /** 单条自由文字最大长度（字符）。 */
    public const int TEXT_MAX_LENGTH = 40;

    /**
     * 快捷句 id => 文案（通用对局向，棋类/骰类都适用）。
     *
     * @var array<string, string>
     */
    public const array PHRASES = [
        // 通用
        'here_we_go' => '开整！',
        'so_lucky' => '这波运气绝了',
        'why_me' => '为什么总是我',
        'play_slowly' => '慢慢来不急',
        'hurry_up' => '等花都谢了',
        'good_game' => '打得漂亮',
        'revenge_next' => '这局算你的',
        'one_more' => '再来再来',
        // 挑衅/嘴硬
        'just_warming' => '我才刚认真',
        'you_first' => '你先慌了？',
        'too_strong' => '你太强了带带我',
        'lucky_only' => '你就是运气好',
        // 求饶/示弱
        'mercy' => '手下留情',
        'let_me_win' => '让我赢一把吧',
        'almost_win' => '我就快赢了',
        // 赞叹
        'nice_move' => '好棋！',
        'genius' => '简直是天才',
        'unbelievable' => '离谱到家的操作',
        // 聊天引导
        'say_something' => '说句话呀',
        'watch_this' => '看我表演',
    ];

    /** 表情面板：Unicode emoji 白名单（kind=emoji 时直接以表情字符为 id）。 */
    public const array EMOJIS = [
        '😀', '😂', '🤣', '😎', '🤔', '😏',
        '😭', '😡', '😱', '🥳', '😴', '🤡',
        '👍', '👎', '🙏', '🤝', '💪', '🔥',
        '⛰️', '🍁', '🍀', '⚡️', '💣', '🎉',
        '⛄️', '🌫️', '🙈',
    ];

    /**
     * 贴纸白名单：id => CDN 路径（与冒险棋同一套资源）。
     *
     * @var array<string, string>
     */
    public const array STICKERS = [
        'god_hi' => '/pages-adventure/static/stickers/god-hi.png',
        'god_smug' => '/pages-adventure/static/stickers/god-smug.png',
        'god_bless' => '/pages-adventure/static/stickers/god-bless.png',
        'god_snow' => '/pages-adventure/static/stickers/god-snow.png',
        'god_angry' => '/pages-adventure/static/stickers/god-angry.png',
        'elf_cheer' => '/pages-adventure/static/stickers/elf-cheer.png',
        'elf_sad' => '/pages-adventure/static/stickers/elf-sad.png',
        'elf_peek' => '/pages-adventure/static/stickers/elf-peek.png',
        'elf_trap' => '/pages-adventure/static/stickers/elf-trap.png',
        'elf_run' => '/pages-adventure/static/stickers/elf-run.png',
    ];

    public static function phraseText(string $id): ?string
    {
        return self::PHRASES[$id] ?? null;
    }

    public static function isEmoji(string $emoji): bool
    {
        return in_array($emoji, self::EMOJIS, true);
    }

    public static function isSticker(string $id): bool
    {
        return isset(self::STICKERS[$id]);
    }
}
