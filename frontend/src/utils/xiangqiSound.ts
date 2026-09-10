/** 象棋音效：CDN wav（frontend/scripts/gen_xiangqi_sounds.py 程序合成后上传），模块级 InnerAudioContext 缓存。 */

import { cdnUrl } from './cdn'
const SOUND_KEY = 'shuxia-xiangqi-sound-enabled'

export type XiangqiSoundName = 'select' | 'move' | 'capture' | 'check' | 'win' | 'lose' | 'rps'

const players = new Map<XiangqiSoundName, UniApp.InnerAudioContext>()
let enabled = true
let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  enabled = uni.getStorageSync(SOUND_KEY) !== 'off'
}

export function xiangqiSoundEnabled(): boolean {
  ensureLoaded()
  return enabled
}

export function setXiangqiSoundEnabled(on: boolean): void {
  ensureLoaded()
  enabled = on
  uni.setStorageSync(SOUND_KEY, on ? 'on' : 'off')
}

export function playXiangqiSound(name: XiangqiSoundName): void {
  ensureLoaded()
  if (!enabled) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = cdnUrl(`/static/sounds-xiangqi/${name}.wav`)
    player.onError(() => {}) // 资源缺失时静默
    players.set(name, player)
  }
  player.stop()
  player.play()
}
