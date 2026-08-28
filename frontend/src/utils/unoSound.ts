/** UNO 音效：本地 wav（程序合成的短提示音，无外部资产），模块级 InnerAudioContext 缓存。
 *  开关持久化到 storage（默认开），页面可切换。
 */

const SOUND_KEY = 'shuxia-uno-sound-enabled'

export type UnoSoundName = 'play' | 'draw' | 'uno' | 'win' | 'chat'

const players = new Map<UnoSoundName, UniApp.InnerAudioContext>()
let enabled = true
let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  enabled = uni.getStorageSync(SOUND_KEY) !== 'off'
}

export function unoSoundEnabled(): boolean {
  ensureLoaded()
  return enabled
}

export function setUnoSoundEnabled(on: boolean): void {
  ensureLoaded()
  enabled = on
  uni.setStorageSync(SOUND_KEY, on ? 'on' : 'off')
}

export function playUnoSound(name: UnoSoundName): void {
  ensureLoaded()
  if (!enabled) return
  let player = players.get(name)
  if (!player) {
    player = uni.createInnerAudioContext()
    player.src = `/static/sounds/${name}.wav`
    player.onError(() => {}) // 资源缺失时静默
    players.set(name, player)
  }
  player.stop()
  player.play()
}
