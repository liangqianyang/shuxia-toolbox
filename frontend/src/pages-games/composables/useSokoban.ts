/**
 * 推箱子回合控制器：状态单漏斗 + 撤销/重开 + 限时提示（照 useTetris 家法,但回合制无 timer）。
 * 返回值必须解构成顶层绑定再进模板（MP 编译下嵌套 .value 不建响应依赖——gomoku/uno 家法）。
 * 提示是同步 CPU 求解（贪心限时 ~300ms,本游戏关卡小,通常 <50ms）,不做 worker。
 */

import { ref, shallowRef } from 'vue'
import { applyAction, createGame, type SokobanAction, type SokobanLevel, type SokobanState } from '@/pages-games/utils/sokoban'
import { nextPush } from '@/pages-games/utils/sokobanSolver'

export interface UseSokobanOptions {
  onStateChange?: (state: SokobanState) => void
}

export function useSokoban(options: UseSokobanOptions = {}) {
  const state = shallowRef<SokobanState | null>(null)
  const hintBusy = ref(false)

  function dispatch(action: SokobanAction): void {
    const current = state.value
    if (!current) return
    const next = applyAction(current, action)
    if (next === current) return // 被挡/无效：同引用跳过（引擎家法）
    state.value = next
    options.onStateChange?.(next)
  }

  function start(level: SokobanLevel): void {
    const fresh = createGame(level)
    state.value = fresh
    options.onStateChange?.(fresh)
  }

  function move(dir: number): void {
    dispatch({ t: 'move', dir })
  }

  function undo(): boolean {
    const current = state.value
    if (!current || current.history.length === 0) return false
    dispatch({ t: 'undo' })
    return true
  }

  function reset(): void {
    const current = state.value
    if (!current) return
    start(current.level)
  }

  /** 看下一步提示：求解器限时贪心,找到则把金圈+箭头写进状态;无解/超时返回 false。 */
  function hint(): boolean {
    const current = state.value
    if (!current || current.phase !== 'playing') return false
    hintBusy.value = true
    try {
      const push = nextPush(current.level, current.boxes, current.player, 350)
      if (!push) return false
      dispatch({ t: 'hint', box: push.box, dir: push.dir })
      return true
    } finally {
      hintBusy.value = false
    }
  }

  function destroy(): void {
    state.value = null
  }

  return { state, hintBusy, start, dispatch, move, undo, reset, hint, destroy }
}
