/**
 * 五子棋音效：InnerAudioContext 播包内 WAV（小程序/H5 通用）。
 * 首次播放前懒创建实例；播放失败静默吞掉（无声不影响对局）。
 */

import { cdnUrl } from './cdn'
let placeCtx: UniApp.InnerAudioContext | null = null
let winCtx: UniApp.InnerAudioContext | null = null

function player(src: string, existing: UniApp.InnerAudioContext | null): UniApp.InnerAudioContext | null {
  if (existing) return existing
  try {
    const ctx = uni.createInnerAudioContext()
    ctx.src = src
    return ctx
  } catch {
    return null
  }
}

function replay(ctx: UniApp.InnerAudioContext | null) {
  if (!ctx) return
  try {
    ctx.stop()
    ctx.seek(0)
    ctx.play()
  } catch {
    // 音频未就绪等异常不影响游戏
  }
}

/** 落子「嗒」。 */
export function playGomokuPlace() {
  placeCtx = player(cdnUrl('/static/audio/place.wav'), placeCtx)
  replay(placeCtx)
}

/** 胜利琶音。 */
export function playGomokuWin() {
  winCtx = player(cdnUrl('/static/audio/win.wav'), winCtx)
  replay(winCtx)
}
