/**
 * 枫趣冒险聊天预设（快捷句/表情/贴纸）：与后端 App\Service\Adventure\AdventureChat
 * 双份同步——**id 必须与后端白名单一字不差**，否则服务端 422（同 unoChat 的约定）。
 * 分组是前端展示逻辑；贴纸 id → CDN 路径在这里映射（固定美术不过内容安全）。
 */

import { cdnUrl } from '@/utils/cdn'

export interface PhraseGroup {
  key: string
  title: string
  phrases: { id: string; text: string }[]
}

export const ADVENTURE_PHRASE_GROUPS: PhraseGroup[] = [
  {
    key: 'general',
    title: '通用',
    phrases: [
      { id: 'here_we_go', text: '出发登山！' },
      { id: 'so_lucky', text: '这波运气绝了' },
      { id: 'why_me', text: '为什么总是我' },
      { id: 'climb_carefully', text: '上山慢慢走' },
      { id: 'weather_incoming', text: '看一眼天气预报' },
      { id: 'save_me_leaves', text: '枫叶不够花了' },
    ],
  },
  {
    key: 'duel',
    title: '决斗',
    phrases: [
      { id: 'duel_me', text: '就决定是你了' },
      { id: 'narrow_road', text: '狭路相逢！' },
      { id: 'rps_battle', text: '猜拳见真章' },
      { id: 'bet_on_me', text: '都押我，稳赢' },
      { id: 'bet_on_them', text: '快押对面' },
    ],
  },
  {
    key: 'mercy',
    title: '求饶',
    phrases: [
      { id: 'mercy', text: '手下留情' },
      { id: 'not_me_please', text: '别打我别打我' },
      { id: 'let_me_pass', text: '让我过去行不行' },
      { id: 'poor_climber', text: '我都垫底了' },
    ],
  },
  {
    key: 'celebrate',
    title: '庆祝',
    phrases: [
      { id: 'gg_wp', text: '打得漂亮' },
      { id: 'summit_soon', text: '枫顶就在眼前' },
      { id: 'revenge_next', text: '这局算你的' },
      { id: 'weather_saved', text: '感谢天气大人' },
      { id: 'trap_master', text: '猜猜我埋了什么' },
    ],
  },
]

/** 全量 id → 文案（渲染收到的 phrase 消息用）。 */
export function adventurePhraseText(id: string): string | null {
  for (const group of ADVENTURE_PHRASE_GROUPS) {
    const hit = group.phrases.find((p) => p.id === id)
    if (hit) return hit.text
  }
  return null
}

/** 与后端 EMOJIS 白名单一致（发送时表情字符本身即 id）。 */
export const ADVENTURE_EMOJIS = [
  '😀', '😂', '🤣', '😎', '🤔', '😏',
  '😭', '😡', '😱', '🥳', '😴', '🤡',
  '👍', '👎', '🙏', '🤝', '💪', '🔥',
  '⛰️', '🍁', '🍀', '⚡️', '💣', '🎉',
  '⛄️', '🌫️', '🙈',
]

/** 与后端 STICKERS 白名单一致：id → CDN 完整地址。 */
export const ADVENTURE_STICKERS: Record<string, string> = {
  god_hi: '/pages-adventure/static/stickers/god-hi.png',
  god_smug: '/pages-adventure/static/stickers/god-smug.png',
  god_bless: '/pages-adventure/static/stickers/god-bless.png',
  god_snow: '/pages-adventure/static/stickers/god-snow.png',
  god_angry: '/pages-adventure/static/stickers/god-angry.png',
  elf_cheer: '/pages-adventure/static/stickers/elf-cheer.png',
  elf_sad: '/pages-adventure/static/stickers/elf-sad.png',
  elf_peek: '/pages-adventure/static/stickers/elf-peek.png',
  elf_trap: '/pages-adventure/static/stickers/elf-trap.png',
  elf_run: '/pages-adventure/static/stickers/elf-run.png',
}

export function stickerUrl(id: string): string {
  const path = ADVENTURE_STICKERS[id]
  return path ? cdnUrl(path) : ''
}
