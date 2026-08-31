<?php

declare(strict_types=1);

namespace App\Service\Adventure;

/**
 * 枫趣冒险房间聊天预设：快捷句 + 表情 + 贴纸（服务端权威白名单）。
 *
 * 前端 src/pages-adventure/utils/adventureChat.ts 是本类的同步镜像（改这里必须同步改那边，
 * 同拼豆色卡/unoChat 的双份约定）。预设内容是固定文案/固定美术，无 UGC 风险、不经内容安全接口；
 * 自由文字（kind=text）走 WechatContentSecurityService 过审。客户端发 phrase/sticker 传 id、
 * emoji 直接传表情字符，服务端映射/白名单校验，防止直连接口注入任意内容。
 */
final class AdventureChat
{
    /** 单条自由文字最大长度（字符）。 */
    public const int TEXT_MAX_LENGTH = 40;

    /**
     * 快捷句 id => 文案。id 只用小写字母+下划线。
     * 分组（通用/决斗挑衅/求饶/庆祝）是前端展示逻辑，这里只做全量白名单。
     *
     * @var array<string, string>
     */
    public const array PHRASES = [
        // 通用
        'here_we_go' => '出发登山！',
        'so_lucky' => '这波运气绝了',
        'why_me' => '为什么总是我',
        'climb_carefully' => '上山慢慢走',
        'weather_incoming' => '看一眼天气预报',
        'save_me_leaves' => '枫叶不够花了',
        // 决斗挑衅
        'duel_me' => '就决定是你了',
        'narrow_road' => '狭路相逢！',
        'rps_battle' => '猜拳见真章',
        'bet_on_me' => '都押我，稳赢',
        'bet_on_them' => '快押对面',
        // 求饶
        'mercy' => '手下留情',
        'not_me_please' => '别打我别打我',
        'let_me_pass' => '让我过去行不行',
        'poor_climber' => '我都垫底了',
        // 庆祝
        'gg_wp' => '打得漂亮',
        'summit_soon' => '枫顶就在眼前',
        'revenge_next' => '这局算你的',
        'weather_saved' => '感谢天气大人',
        'trap_master' => '猜猜我埋了什么',
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
     * 贴纸白名单：id => CDN 路径（frontend/cdn-assets/pages-adventure/static/stickers/，
     * AI 生成后经 upload_qiniu.py 上传）。客户端按 id 渲染图片；固定美术不过内容安全。
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

    public static function stickerPath(string $id): ?string
    {
        return self::STICKERS[$id] ?? null;
    }
}
