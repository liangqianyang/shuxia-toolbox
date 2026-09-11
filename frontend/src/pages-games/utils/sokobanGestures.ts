/**
 * 推箱子触摸手势（四向滑动）：纯逻辑零平台依赖（照 touchGestures.ts 家法，Node 可测）。
 * 首次意图锁定：某轴位移超过 stepPx 且明显主导（1.3 倍）即锁轴，之后每再偏 stepPx 发一格
 * （可连发多格）；另一轴的抖动忽略。回合制无 tap/快滑语义，touchend 只复位。
 * 坐标提取沿用仓库惯例（changedTouches[0] ?? touches[0]，clientX ?? pageX ?? x）。
 */

export interface SwipeConfig {
  /** 一步 = 一个棋盘格的 css 像素（页面按当前布局喂进来）。 */
  stepPx: number
  /** 主导轴判定倍率。 */
  intentRatio?: number
  /** 可注入时钟（测试用），默认 Date.now。 */
  now?: () => number
}

export type SokobanDir = 0 | 1 | 2 | 3

export interface SwipeCallbacks {
  onStep: (dir: SokobanDir) => void
}

interface SwipeState {
  anchorX: number
  anchorY: number
  /** 已锁轴（null = 尚未判定意图）。 */
  axis: 'x' | 'y' | null
}

function pointOfEvent(event: unknown): { x: number; y: number } | null {
  const e = event as { changedTouches?: unknown[]; touches?: unknown[] }
  const touch = (e.changedTouches && e.changedTouches[0]) ?? (e.touches && e.touches[0])
  if (!touch) return null
  const t = touch as { clientX?: number; pageX?: number; x?: number; clientY?: number; pageY?: number; y?: number }
  const x = t.clientX ?? t.pageX ?? t.x
  const y = t.clientY ?? t.pageY ?? t.y
  if (typeof x !== 'number' || typeof y !== 'number') return null
  return { x, y }
}

export function createSwipeController(config: SwipeConfig, cb: SwipeCallbacks): {
  onTouchStart: (event: unknown) => void
  onTouchMove: (event: unknown) => void
  onTouchEnd: (event: unknown) => void
  onTouchCancel: (event: unknown) => void
} {
  const intentRatio = config.intentRatio ?? 1.3
  let swipe: SwipeState | null = null

  function onTouchStart(event: unknown): void {
    const p = pointOfEvent(event)
    if (!p) return
    swipe = { anchorX: p.x, anchorY: p.y, axis: null }
  }

  function onTouchMove(event: unknown): void {
    if (!swipe) return
    const p = pointOfEvent(event)
    if (!p) return
    const dx = p.x - swipe.anchorX
    const dy = p.y - swipe.anchorY
    if (swipe.axis === null) {
      // 意图判定：越过一格且明显主导才锁轴（小幅抖动不触发）
      if (Math.abs(dx) >= config.stepPx && Math.abs(dx) > Math.abs(dy) * intentRatio) {
        swipe.axis = 'x'
      } else if (Math.abs(dy) >= config.stepPx && Math.abs(dy) > Math.abs(dx) * intentRatio) {
        swipe.axis = 'y'
      } else {
        return
      }
    }
    if (swipe.axis === 'x') {
      while (p.x - swipe.anchorX >= config.stepPx) {
        swipe.anchorX += config.stepPx
        cb.onStep(1)
      }
      while (swipe.anchorX - p.x >= config.stepPx) {
        swipe.anchorX -= config.stepPx
        cb.onStep(3)
      }
    } else {
      while (p.y - swipe.anchorY >= config.stepPx) {
        swipe.anchorY += config.stepPx
        cb.onStep(2)
      }
      while (swipe.anchorY - p.y >= config.stepPx) {
        swipe.anchorY -= config.stepPx
        cb.onStep(0)
      }
    }
  }

  function reset(): void {
    swipe = null
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: reset,
    // 取消（滚动接管等）只清状态
    onTouchCancel: reset,
  }
}
