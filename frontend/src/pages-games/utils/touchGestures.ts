/**
 * 触摸手势识别器（俄罗斯方块棋盘区用）：纯逻辑、零平台依赖（照 tetris.ts 家法,Node 可测）。
 * 锚点步进式：水平拖动每过 stepPx 发一格 onMove（可连发多格）；竖直意图后转软降模式
 * 每过 stepPx 发一次 onSoftDrop；touchend 按 时长/位移/速度 判 tap / 快滑硬降 / 上滑。
 * 坐标提取按仓库惯例（useBeadCanvas.getEventPoint）：changedTouches[0] ?? touches[0]，
 * clientX ?? pageX ?? x（H5/小程序字段差异都兜住）。
 */

export interface DragConfig {
  /** 一步 = 一个棋盘格的 css 像素（页面按当前布局喂进来）。 */
  stepPx: number
  tapMaxDist: number
  tapMaxMs: number
  flickMinDist: number
  flickMaxMs: number
  /** px/ms，快滑硬降的最小速度。 */
  flickMinVel: number
  swipeUpMinDist: number
  /** 可注入时钟（测试用），默认 Date.now。 */
  now?: () => number
}

export interface DragCallbacks {
  onMove: (dx: -1 | 1) => void
  onSoftDrop: () => void
  onTap: () => void
  onHardDrop: () => void
  onSwipeUp: () => void
}

interface TouchPoint {
  x: number
  y: number
}

interface DragState {
  startX: number
  startY: number
  /** 步进锚点：每偏离它一个 stepPx 就发一格并把锚点推过去。 */
  anchorX: number
  anchorY: number
  startAt: number
  /** 竖直意图已确认（此后不再横移）。 */
  vertical: boolean
}

function defaultNow(): number {
  return Date.now()
}

export function pointOfEvent(event: unknown): TouchPoint | null {
  const e = event as { changedTouches?: unknown[]; touches?: unknown[] }
  const touch = (e.changedTouches && e.changedTouches[0]) ?? (e.touches && e.touches[0])
  if (!touch) return null
  const t = touch as { clientX?: number; pageX?: number; x?: number; clientY?: number; pageY?: number; y?: number }
  const x = t.clientX ?? t.pageX ?? t.x
  const y = t.clientY ?? t.pageY ?? t.y
  if (typeof x !== 'number' || typeof y !== 'number') return null
  return { x, y }
}

export function createDragController(config: DragConfig, cb: DragCallbacks): {
  onTouchStart: (event: unknown) => void
  onTouchMove: (event: unknown) => void
  onTouchEnd: (event: unknown) => void
  onTouchCancel: (event: unknown) => void
} {
  const now = config.now ?? defaultNow
  let drag: DragState | null = null

  function onTouchStart(event: unknown): void {
    const p = pointOfEvent(event)
    if (!p) return
    drag = { startX: p.x, startY: p.y, anchorX: p.x, anchorY: p.y, startAt: now(), vertical: false }
  }

  function onTouchMove(event: unknown): void {
    if (!drag) return
    const p = pointOfEvent(event)
    if (!p) return
    const dx = p.x - drag.startX
    const dy = p.y - drag.startY
    // 竖直意图：向下且明显竖直主导（1.3 倍）→ 进入软降模式,后续只按竖直步进
    if (!drag.vertical && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      drag.vertical = true
    }
    if (drag.vertical) {
      while (p.y - drag.anchorY >= config.stepPx) {
        drag.anchorY += config.stepPx
        cb.onSoftDrop()
      }
      return
    }
    // 水平步进（尚未判竖直时也允许小幅竖直不影响）
    while (p.x - drag.anchorX >= config.stepPx) {
      drag.anchorX += config.stepPx
      cb.onMove(1)
    }
    while (drag.anchorX - p.x >= config.stepPx) {
      drag.anchorX -= config.stepPx
      cb.onMove(-1)
    }
  }

  function finish(event: unknown): void {
    if (!drag) return
    const d = drag
    drag = null
    const p = pointOfEvent(event) ?? { x: d.startX, y: d.startY }
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    const dist = Math.hypot(dx, dy)
    const duration = Math.max(0, now() - d.startAt)
    if (duration <= config.tapMaxMs && dist <= config.tapMaxDist) {
      cb.onTap()
      return
    }
    if (dy >= config.flickMinDist && duration <= config.flickMaxMs && dy / Math.max(1, duration) >= config.flickMinVel) {
      cb.onHardDrop()
      return
    }
    if (dy <= -config.swipeUpMinDist && Math.abs(dy) > Math.abs(dx)) {
      cb.onSwipeUp()
    }
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: finish,
    // 取消不判手势（比如滚动接管）,只清状态
    onTouchCancel: () => {
      drag = null
    },
  }
}

/** 默认阈值（stepPx 由页面按棋盘格喂）：tap 250ms/12px,硬降 ≥80px 且 ≤220ms 且 ≥0.55px/ms,上滑 ≥30px。 */
export function defaultDragConfig(stepPx: number): DragConfig {
  return {
    stepPx,
    tapMaxDist: 12,
    tapMaxMs: 250,
    flickMinDist: 80,
    flickMaxMs: 220,
    flickMinVel: 0.55,
    swipeUpMinDist: 30,
  }
}
