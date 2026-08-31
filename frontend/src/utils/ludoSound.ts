/** 飞行棋音效：本地 wav（程序合成的短提示音，无外部资产），模块级 InnerAudioContext 缓存。
 *  开关持久化到 storage（默认开），页面可切换。
 */

import { cdnUrl } from './cdn'
const SOUND_KEY = 'shuxia-ludo-sound-enabled'

export type LudoSoundName = 'roll' | 'takeoff' | 'capture' | 'fly' | 'finish' | 'win'

const players = new Map<LudoSoundName, UniApp.InnerAudioContext>()
let enabled = true
let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  enabled = uni.getStorageSync(SOUND_KEY) !== 'off'
}

export function ludoSoundEnabled(): boolean {
  ensureLoaded()
  return enabled
}

export function setLudoSoundEnabled(on: boolean): void {
  ensureLoaded()
  enabled = on
  uni.setStorageSync(SOUND_KEY, on ? 'on' : 'off')
}

export function playLudoSound(name: LudoSoundName): void {
  ensureLoaded()
  if (!enabled) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = cdnUrl(`/pages-ludo/static/sounds-ludo/${name}.wav`)
    player.onError(() => {}) // 资源缺失时静默
    players.set(name, player)
  }
  player.stop()
  player.play()
}
