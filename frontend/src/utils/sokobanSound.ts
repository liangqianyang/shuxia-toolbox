/** 推箱子音效：CDN wav（gen_sokoban_sounds.py 程序合成,无外部资产）,
 *  模块级 InnerAudioContext 缓存 + stop/play 立即重触发（照 tetrisSound.ts 家法）。
 *  开关持久化到 storage（默认开）。
 */

import { cdnUrl } from './cdn'
const SOUND_KEY = 'shuxia-sokoban-sound-enabled'

export type SokobanSoundName =
  | 'walk'
  | 'push'
  | 'place'
  | 'undo'
  | 'win'
  | 'dead'

const players = new Map<SokobanSoundName, UniApp.InnerAudioContext>()
let enabled = true
let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  enabled = uni.getStorageSync(SOUND_KEY) !== 'off'
}

export function sokobanSoundEnabled(): boolean {
  ensureLoaded()
  return enabled
}

export function setSokobanSoundEnabled(on: boolean): void {
  ensureLoaded()
  enabled = on
  uni.setStorageSync(SOUND_KEY, on ? 'on' : 'off')
}

export function playSokobanSound(name: SokobanSoundName): void {
  ensureLoaded()
  if (!enabled) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = cdnUrl(`/static/sounds-sokoban/${name}.wav`)
    player.onError(() => {}) // 资源缺失时静默
    players.set(name, player)
  }
  player.stop()
  player.play()
}
