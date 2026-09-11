/**
 * 枫趣冒险音效：InnerAudioContext 直接播 CDN wav（程序合成短提示音，
 * 文件在 frontend/cdn-assets/pages-adventure/static/sounds-adventure/，上传七牛后可播）。
 * 加载失败静默（onError 置空），开关持久化 storage。
 */

import { cdnUrl } from '@/utils/cdn'

export type AdventureSoundName =
  | 'roll' | 'move' | 'ladder' | 'cable' | 'slide' | 'leaf' | 'item'
  | 'duel' | 'duelwin' | 'duellose' | 'bet' | 'weather' | 'summit' | 'chat' | 'trap' | 'win'

const STORAGE_KEY = 'shuxia-adventure-sound-enabled'

const players = new Map<AdventureSoundName, UniApp.InnerAudioContext>()

let enabled: boolean | null = null

function ensureLoaded(): boolean {
  if (enabled === null) {
    enabled = String(uni.getStorageSync(STORAGE_KEY) ?? '1') === '1'
  }
  return enabled
}

export function adventureSoundEnabled(): boolean {
  return ensureLoaded()
}

export function setAdventureSoundEnabled(on: boolean): void {
  enabled = on
  uni.setStorageSync(STORAGE_KEY, on ? '1' : '0')
}

export function playAdventureSound(name: AdventureSoundName): void {
  if (!ensureLoaded()) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = cdnUrl(`/pages-adventure/static/sounds-adventure/${name}.wav`)
    player.onError(() => {})
    players.set(name, player)
  }
  // 快速连击时重启播放
  player.stop()
  player.play()
}
