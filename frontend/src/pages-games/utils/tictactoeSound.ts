/** 井字棋音效：CDN wav（frontend/scripts/gen_tictactoe_sounds.py 程序合成后上传），模块级 InnerAudioContext 缓存。 */

import { cdnUrl } from '@/utils/cdn'
const SOUND_KEY = 'shuxia-tictactoe-sound-enabled'

export type TictactoeSoundName = 'place' | 'win' | 'lose'

const players = new Map<TictactoeSoundName, UniApp.InnerAudioContext>()
let enabled = true
let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  enabled = uni.getStorageSync(SOUND_KEY) !== 'off'
}

export function tictactoeSoundEnabled(): boolean {
  ensureLoaded()
  return enabled
}

export function setTictactoeSoundEnabled(on: boolean): void {
  ensureLoaded()
  enabled = on
  uni.setStorageSync(SOUND_KEY, on ? 'on' : 'off')
}

export function playTictactoeSound(name: TictactoeSoundName): void {
  ensureLoaded()
  if (!enabled) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = cdnUrl(`/static/sounds-tictactoe/${name}.wav`)
    player.onError(() => {}) // 资源缺失时静默
    players.set(name, player)
  }
  player.stop()
  player.play()
}
