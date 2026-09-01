/**
 * 通用房间聊天预设（飞行棋/五子棋共用）：与后端 App\Service\Chat\GameChat 双份同步——
 * **id 必须与后端白名单一字不差**，否则服务端 422（同 unoChat/adventureChat 的约定）。
 * 贴纸与冒险棋同一套 CDN 资源。
 */

import { cdnUrl } from '@/utils/cdn'

export interface GamePhraseGroup {
  key: string
  title: string
  phrases: { id: string; text: string }[]
}

export const GAME_PHRASE_GROUPS: GamePhraseGroup[] = [
  {
    key: 'general',
    title: '通用',
    phrases: [
      { id: 'here_we_go', text: '开整！' },
      { id: 'so_lucky', text: '这波运气绝了' },
      { id: 'why_me', text: '为什么总是我' },
      { id: 'play_slowly', text: '慢慢来不急' },
      { id: 'hurry_up', text: '等花都谢了' },
      { id: 'good_game', text: '打得漂亮' },
      { id: 'revenge_next', text: '这局算你的' },
      { id: 'one_more', text: '再来再来' },
    ],
  },
  {
    key: 'taunt',
    title: '挑衅',
    phrases: [
      { id: 'just_warming', text: '我才刚认真' },
      { id: 'you_first', text: '你先慌了？' },
      { id: 'too_strong', text: '你太强了带带我' },
      { id: 'lucky_only', text: '你就是运气好' },
    ],
  },
  {
    key: 'mercy',
    title: '求饶',
    phrases: [
      { id: 'mercy', text: '手下留情' },
      { id: 'let_me_win', text: '让我赢一把吧' },
      { id: 'almost_win', text: '我就快赢了' },
    ],
  },
  {
    key: 'praise',
    title: '赞叹',
    phrases: [
      { id: 'nice_move', text: '好棋！' },
      { id: 'genius', text: '简直是天才' },
      { id: 'unbelievable', text: '离谱到家的操作' },
      { id: 'say_something', text: '说句话呀' },
      { id: 'watch_this', text: '看我表演' },
    ],
  },
]

/** 全量 id → 文案（渲染收到的 phrase 消息用）。 */
export function gamePhraseText(id: string): string | null {
  for (const group of GAME_PHRASE_GROUPS) {
    const hit = group.phrases.find((p) => p.id === id)
    if (hit) return hit.text
  }
  return null
}

/** 与后端 EMOJIS 白名单一致（发送时表情字符本身即 id）。 */
export const GAME_EMOJIS = [
  '😀', '😂', '🤣', '😎', '🤔', '😏',
  '😭', '😡', '😱', '🥳', '😴', '🤡',
  '👍', '👎', '🙏', '🤝', '💪', '🔥',
  '⛰️', '🍁', '🍀', '⚡️', '💣', '🎉',
  '⛄️', '🌫️', '🙈',
]

/** 与后端 STICKERS 白名单一致（与冒险棋同一套资源）。 */
export const GAME_STICKERS: Record<string, string> = {
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

export function gameStickerUrl(id: string): string {
  const path = GAME_STICKERS[id]
  return path ? cdnUrl(path) : ''
}
