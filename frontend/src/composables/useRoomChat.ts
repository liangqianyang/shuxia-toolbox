/**
 * 通用房间聊天逻辑（飞行棋/五子棋共用；uno/冒险棋有各自的内联实现，成熟后可归并到这里）。
 *
 * 职责：面板开关/未读计数/3 秒冷却倒数/座位气泡按 seq 增量/消息渲染辅助。
 * 页面只需提供：读当前房间 chat 数组与我的座位、发送函数、（可选）收到新消息回调（音效）。
 * 发送体验同 uno/冒险棋：快捷句/表情/贴纸发送即收面板并起冷却；自由文字清空输入、收面板、
 * 失败还原；服务端负责内容审核与 fail-closed。
 */

import { computed, reactive, ref, watch, type Ref } from 'vue'
import { GAME_PHRASE_GROUPS, gamePhraseText } from '@/utils/gameChat'

export interface RoomChatMessage {
  seq: number
  uid: number
  seat?: number
  role?: string
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

export interface UseRoomChatOptions {
  /** 当前房间 chat 数组（可能为空数组）。 */
  chat: () => RoomChatMessage[]
  /** 房间 code。 */
  code: () => string
  /** 发送函数（页面各自调各自的 API；返回是否成功）。 */
  send: (kind: string, payload: { id?: string; text?: string }) => Promise<boolean>
  /** 收到他人新消息时回调（音效等）。 */
  onIncoming?: () => void
}

const CHAT_COOLDOWN_SECONDS = 3

export function useRoomChat(options: UseRoomChatOptions) {
  const chatPanelOpen = ref(false)
  const chatTab = ref<'quick' | 'emoji' | 'sticker' | 'text'>('quick')
  const chatInput = ref('')
  const chatCooling = ref(false)
  const chatCooldown = ref(0)
  const unreadChat = ref(0)
  /** 座位/角色 → 气泡（页面按自己的布局锚定渲染）。 */
  const chatBubbles = reactive<Record<string, { text: string; isEmoji: boolean }>>({})
  const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let lastChatSeq = 0
  let chatSynced = false

  const recentChats = computed(() => options.chat().slice(-5))
  const chatLog = computed(() => [...options.chat()].reverse().slice(0, 30))
  const phraseGroups = computed(() => GAME_PHRASE_GROUPS)

  /** 本地座位键（飞行棋=seat、五子棋=role），页面渲染气泡时用同一键。 */
  function bubbleKeyOf(m: RoomChatMessage): string {
    return m.role ?? String(m.seat ?? m.uid)
  }

  /** 消息正文的展示文案（phrase 反查文案，sticker 给占位）。 */
  function chatBody(m: RoomChatMessage): string {
    if (m.kind === 'phrase') return gamePhraseText(m.text) ?? m.text
    return m.text
  }

  function chatPreview(m: RoomChatMessage): string {
    const body = m.kind === 'sticker' ? '[贴纸]' : m.kind === 'emoji' ? m.text : chatBody(m)
    return body
  }

  watch(
    () => options.chat(),
    (chat) => {
      if (!chat.length) return
      if (!chatSynced) {
        chatSynced = true
        lastChatSeq = chat[chat.length - 1].seq
        return
      }
      for (const m of chat) {
        if (m.seq <= lastChatSeq) continue
        lastChatSeq = m.seq
        showBubble(m)
        options.onIncoming?.()
        if (!chatPanelOpen.value) unreadChat.value++
      }
    },
  )

  watch(
    () => options.code(),
    () => {
      chatSynced = false
      lastChatSeq = 0
      unreadChat.value = 0
    },
  )

  function showBubble(m: RoomChatMessage) {
    const text = m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? gamePhraseText(m.text) ?? m.text : m.text
    const key = bubbleKeyOf(m)
    chatBubbles[key] = { text, isEmoji: m.kind === 'emoji' }
    const old = bubbleTimers.get(key)
    if (old) clearTimeout(old)
    bubbleTimers.set(key, setTimeout(() => delete chatBubbles[key], 4000))
  }

  function startChatCooldown() {
    chatCooling.value = true
    chatCooldown.value = CHAT_COOLDOWN_SECONDS
    const timer = setInterval(() => {
      chatCooldown.value--
      if (chatCooldown.value <= 0) {
        clearInterval(timer)
        chatCooling.value = false
      }
    }, 1000)
  }

  async function sendPhrase(id: string) {
    if (chatCooling.value) return
    chatPanelOpen.value = false
    startChatCooldown()
    await options.send('phrase', { id })
  }

  async function sendEmoji(emoji: string) {
    if (chatCooling.value) return
    chatPanelOpen.value = false
    startChatCooldown()
    await options.send('emoji', { id: emoji })
  }

  async function sendSticker(id: string) {
    if (chatCooling.value) return
    chatPanelOpen.value = false
    startChatCooldown()
    await options.send('sticker', { id })
  }

  async function sendText() {
    const text = chatInput.value.trim()
    if (!text || chatCooling.value) return
    // 同 uno/冒险棋：发送即清空输入并收起面板——消息随后出现在底部 feed / 座位气泡
    chatInput.value = ''
    chatPanelOpen.value = false
    startChatCooldown()
    const ok = await options.send('text', { text })
    if (!ok) chatInput.value = text // 发送失败还原文字（重开面板可见）
  }

  return {
    chatPanelOpen,
    chatTab,
    chatInput,
    chatCooling,
    chatCooldown,
    unreadChat,
    chatBubbles,
    recentChats,
    chatLog,
    phraseGroups,
    chatBody,
    chatPreview,
    bubbleKeyOf,
    sendPhrase,
    sendEmoji,
    sendSticker,
    sendText,
  }
}
