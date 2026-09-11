/**
 * 俄罗斯方块游戏循环 composable：33ms 自调度 setTimeout 链驱动引擎 tick（仓库无 rAF,
 * 全状态驱动重绘的家法）；输入（手势/按钮/DAS 连发）全部收敛到 dispatch——一次状态替换
 * + 一次 onStateChange 回调（页面在那里重绘 canvas、放音效/振动）。
 * dt 用 Date.now() 差值并钳 250ms：后台限流/前台唤醒都不会爆积分。
 */

import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { applyAction, createGame, type GameAction, type TetrisState } from '@/pages-games/utils/tetris'

const TICK_MS = 33
const DT_CLAMP_MS = 250
/** 按钮 ←/→ 连发：按下立即一格,停 170ms 后每 45ms 连发（DAS/ARR）。 */
const DAS_DELAY_MS = 170
const ARR_INTERVAL_MS = 45

export interface UseTetrisOptions {
  /** 每次状态变化回调（新状态可能与旧状态同引用——被挡动作,页面可跳过重绘与特效）。 */
  onStateChange: (state: TetrisState) => void
}

export function useTetris(options: UseTetrisOptions) {
  const state: ShallowRef<TetrisState | null> = shallowRef(null)
  const running: Ref<boolean> = ref(false)
  const paused: Ref<boolean> = ref(false)

  let tickTimer: ReturnType<typeof setTimeout> | null = null
  let lastTickAt = 0
  let dasDelayTimer: ReturnType<typeof setTimeout> | null = null
  let arrTimer: ReturnType<typeof setInterval> | null = null
  let dasDir: -1 | 1 | null = null

  function clearTickTimer(): void {
    if (tickTimer !== null) {
      clearTimeout(tickTimer)
      tickTimer = null
    }
  }

  function armTick(): void {
    clearTickTimer()
    if (!running.value || paused.value) return
    tickTimer = setTimeout(() => {
      const current = state.value
      if (!current) return
      const dt = Math.min(DT_CLAMP_MS, Math.max(0, Date.now() - lastTickAt))
      lastTickAt = Date.now()
      dispatch({ t: 'tick', dtMs: dt })
      if (state.value && state.value.phase !== 'over') armTick()
    }, TICK_MS)
  }

  function dispatch(action: GameAction): void {
    const current = state.value
    if (!current) return
    const next = applyAction(current, action)
    if (next === current) return // 被挡/无效动作：不换引用,页面跳过重绘与特效
    state.value = next
    options.onStateChange(next)
  }

  function start(startLevel: number): void {
    stopDas()
    running.value = true
    paused.value = false
    const game = createGame(startLevel)
    state.value = game
    options.onStateChange(game)
    lastTickAt = Date.now()
    armTick()
  }

  function pause(): void {
    if (!running.value || paused.value) return
    paused.value = true
    clearTickTimer()
  }

  function resume(): void {
    if (!running.value || !paused.value) return
    paused.value = false
    lastTickAt = Date.now()
    armTick()
  }

  function destroy(): void {
    running.value = false
    paused.value = false
    clearTickTimer()
    stopDas()
    state.value = null
  }

  /** 按钮/手势输入入口（tick 之外的五个动作都从这里走）。 */
  function input(action: GameAction): void {
    if (!running.value || paused.value) return
    dispatch(action)
  }

  function stopDas(): void {
    if (dasDelayTimer !== null) {
      clearTimeout(dasDelayTimer)
      dasDelayTimer = null
    }
    if (arrTimer !== null) {
      clearInterval(arrTimer)
      arrTimer = null
    }
    dasDir = null
  }

  /** ←/→ 按下：立即一格,DAS 延迟后 ARR 连发。 */
  function beginMove(dx: -1 | 1): void {
    if (!running.value || paused.value) return
    if (dasDir === dx) return
    stopDas()
    dasDir = dx
    dispatch({ t: 'move', dx })
    dasDelayTimer = setTimeout(() => {
      arrTimer = setInterval(() => {
        dispatch({ t: 'move', dx })
      }, ARR_INTERVAL_MS)
    }, DAS_DELAY_MS)
  }

  /** ←/→ 抬起/取消。 */
  function endMove(): void {
    stopDas()
  }

  return {
    state,
    running,
    paused,
    start,
    dispatch,
    input,
    pause,
    resume,
    destroy,
    beginMove,
    endMove,
  }
}
