import { nextTick, ref, shallowRef } from 'vue'
import type { PatternResult } from '@/types/beads'
import { getCanvasNode, getElementRect, getWindowInfo, type ElementRect, type CanvasNode } from '@/utils/canvasAdapter'
import { computeSheetLayout, renderSheet, renderCell, type SheetLayout } from '@/utils/sheetRenderer'

export interface BeadCanvasCellHit {
  x: number
  y: number
  paletteIndex: number
}

/**
 * 页内预览：与导出共用 renderSheet，预览即所得。
 * 通过倍率重绘实现放大（避开小程序 pinch 手势与 canvas 同层渲染的兼容坑），
 * canvas 放在 scroll-view 里横纵滚动。
 */
export function useBeadCanvas(selector: string) {
  const node = shallowRef<CanvasNode | null>(null)
  const zoom = ref(1)
  /** 预览 canvas 的 CSS 尺寸，供模板绑定 */
  const cssWidth = ref(0)
  const cssHeight = ref(0)
  /** scroll-view 内真实可滚动内容尺寸 */
  const contentWidth = ref(0)
  const contentHeight = ref(0)
  const scrollLeft = ref(0)
  const scrollTop = ref(0)
  const lastLayout = shallowRef<SheetLayout | null>(null)
  /** 缓存的 canvas 视口矩形；随 render/setZoom/scroll 失效，避免每次 tap 都异步查一次 */
  const cachedRect = shallowRef<ElementRect | null>(null)
  const pinching = ref(false)
  const pinchStartDistance = ref(0)
  const pinchStartZoom = ref(1)
  /** 隔离高亮的色板下标（null = 不高亮）。改值后需 setHighlight 重绘 */
  const highlightIndex = ref<number | null>(null)

  async function ensureNode(component?: unknown): Promise<CanvasNode> {
    if (!node.value) {
      node.value = await getCanvasNode(selector, component)
    }
    return node.value
  }

  async function render(result: PatternResult, component?: unknown): Promise<void> {
    const { canvas, ctx, dpr } = await ensureNode(component)

    const baseCssW = (getWindowInfo().windowWidth || 375) - 32 // 页面左右 padding
    const targetCssW = baseCssW * zoom.value
    // 物理分辨率上限 3500，避免低端机超 canvas 限制
    const maxPx = Math.min(3500, Math.round(targetCssW * dpr))

    const layout = computeSheetLayout(result, maxPx)
    lastLayout.value = layout
    canvas.width = layout.totalW
    canvas.height = layout.totalH

    cssWidth.value = targetCssW
    cssHeight.value = (layout.totalH / layout.totalW) * targetCssW
    contentWidth.value = cssWidth.value
    contentHeight.value = cssHeight.value
    cachedRect.value = null // 尺寸变了，rect 缓存失效

    renderSheet(ctx, result, layout, highlightIndex.value ?? undefined)
  }

  /**
   * 单格编辑后的增量重绘：版式未变时只重画该格 + 标题 + 图例，跳过全网格重绘。
   * 版式变化（用色数变→图例行数变→totalH 变）或无节点/布局时返回 false，调用方回退 render()。
   */
  function renderEditedCell(result: PatternResult, x: number, y: number): boolean {
    const current = node.value
    const layout = lastLayout.value
    if (!current || !layout) return false
    // gridW/gridH/maxPx 不变，唯一能改版式的是用色数（图例行数）。legendCols 只依赖 gridW（不变），
    // 据旧 cols 重算 rows：行数变则 totalH 变、必须全量重绘；不变则整套 layout 完全一致，直接复用。
    const newRows = Math.ceil(result.used.length / layout.legendCols)
    if (newRows !== layout.legendRows) return false
    renderCell(current.ctx, result, layout, x, y, highlightIndex.value ?? undefined)
    return true
  }

  /** 设置/取消隔离高亮并重绘。index=null 关闭高亮 */
  async function setHighlight(
    index: number | null,
    result: PatternResult | null,
    component?: unknown,
  ): Promise<void> {
    highlightIndex.value = index
    if (result) {
      await render(result, component)
    }
  }

  async function getCellFromEvent(
    event: unknown,
    result: PatternResult | null,
    component?: unknown,
  ): Promise<BeadCanvasCellHit | null> {
    if (!result || !lastLayout.value) return null
    const point = getEventPoint(event)
    if (!point) return null

    // rect 只随缩放/滚动变化，缓存复用，省掉每次 tap 的异步 selectorQuery 往返
    let rect = cachedRect.value
    if (!rect) {
      rect = await getElementRect(selector, component)
      cachedRect.value = rect
    }
    const localX = point.local ? point.x : point.x - rect.left
    const localY = point.local ? point.y : point.y - rect.top
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null

    const layout = lastLayout.value
    const scaleX = layout.totalW / Math.max(1, cssWidth.value || rect.width)
    const scaleY = layout.totalH / Math.max(1, cssHeight.value || rect.height)
    const sheetX = localX * scaleX
    const sheetY = localY * scaleY
    const gridRight = layout.gridX + result.width * layout.cellPx
    const gridBottom = layout.gridY + result.height * layout.cellPx
    if (
      sheetX < layout.gridX ||
      sheetX >= gridRight ||
      sheetY < layout.gridY ||
      sheetY >= gridBottom
    ) {
      return null
    }

    const x = Math.floor((sheetX - layout.gridX) / layout.cellPx)
    const y = Math.floor((sheetY - layout.gridY) / layout.cellPx)
    if (x < 0 || x >= result.width || y < 0 || y >= result.height) return null

    return {
      x,
      y,
      paletteIndex: result.cells[y * result.width + x],
    }
  }

  async function setZoom(value: number, result: PatternResult | null, component?: unknown) {
    scrollLeft.value = 0
    scrollTop.value = 0
    zoom.value = clampZoom(value)
    if (result) {
      await render(result, component)
    }
    scrollLeft.value = 0
    scrollTop.value = 0
  }

  function onScroll(event: { detail?: { scrollLeft?: number; scrollTop?: number } }) {
    scrollLeft.value = event.detail?.scrollLeft ?? scrollLeft.value
    scrollTop.value = event.detail?.scrollTop ?? scrollTop.value
    cachedRect.value = null // 滚动后视口位移，rect 失效
  }

  function onPinchStart(event: unknown): boolean {
    const distance = getTouchDistance(event)
    if (!distance || distance <= 0) return false
    pinching.value = true
    pinchStartDistance.value = distance
    pinchStartZoom.value = zoom.value
    return true
  }

  function onPinchMove(event: unknown): boolean {
    if (!pinching.value || pinchStartDistance.value <= 0) return false
    const distance = getTouchDistance(event)
    if (!distance) return false
    const nextZoom = clampZoom(pinchStartZoom.value * (distance / pinchStartDistance.value))
    applyLiveZoom(nextZoom)
    const maybePreventable = event as { preventDefault?: () => void }
    maybePreventable.preventDefault?.()
    return true
  }

  async function onPinchEnd(result: PatternResult | null, component?: unknown): Promise<boolean> {
    if (!pinching.value) return false
    pinchStartDistance.value = 0
    pinchStartZoom.value = zoom.value
    if (result) {
      // 先按最终 zoom 重绘并把放大后的内容尺寸写进 contentWidth/Height。
      await render(result, component)
    }
    // 必须在 render 完成 + nextTick（尺寸已落到 DOM）之后再放开滚动：
    // 真机 scroll-view 仅在 scroll-x/y 由 false→true 切换的那一刻重新测量子内容、激活滚动范围；
    // 若先放开再 render，尺寸变化发生在 scroll=false 的 pinch 期间，切回 true 后沿用旧测量值 → 放大后拖不动。
    await nextTick()
    pinching.value = false
    return true
  }

  function applyLiveZoom(value: number) {
    value = clampZoom(value)
    if (cssWidth.value <= 0 || cssHeight.value <= 0) {
      zoom.value = value
      return
    }
    const oldZoom = zoom.value || 1
    const baseWidth = cssWidth.value / oldZoom
    const aspect = cssHeight.value / cssWidth.value
    zoom.value = value
    cssWidth.value = baseWidth * value
    cssHeight.value = cssWidth.value * aspect
    contentWidth.value = cssWidth.value
    contentHeight.value = cssHeight.value
    cachedRect.value = null // 实时缩放改了 CSS 尺寸，rect 失效
  }

  function setLiveZoom(value: number) {
    applyLiveZoom(value)
  }

  function release() {
    // 预览 canvas 用完把底层缓冲缩到 1×1 释放内存，避免与导出大画布并存时峰值 OOM
    const current = node.value
    if (current?.canvas) {
      try {
        current.canvas.width = 1
        current.canvas.height = 1
      } catch {
        // 某些平台 canvas 已随节点卸载，忽略
      }
    }
    node.value = null
    cssWidth.value = 0
    cssHeight.value = 0
    contentWidth.value = 0
    contentHeight.value = 0
    scrollLeft.value = 0
    scrollTop.value = 0
    lastLayout.value = null
    cachedRect.value = null
    pinching.value = false
    pinchStartDistance.value = 0
    highlightIndex.value = null
  }

  return {
    zoom,
    cssWidth,
    cssHeight,
    contentWidth,
    contentHeight,
    scrollLeft,
    scrollTop,
    pinching,
    highlightIndex,
    render,
    renderEditedCell,
    setHighlight,
    setZoom,
    onScroll,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    setLiveZoom,
    getCellFromEvent,
    release,
  }
}

function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.75, Math.round(value * 100) / 100))
}

function getEventPoint(event: unknown): { x: number; y: number; local: boolean } | null {
  const e = event as {
    detail?: { x?: number; y?: number }
    clientX?: number
    clientY?: number
    changedTouches?: Array<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number; x?: number; y?: number }>
    touches?: Array<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number; x?: number; y?: number }>
  }
  const touch = e.changedTouches?.[0] ?? e.touches?.[0]
  const clientX = touch?.clientX ?? touch?.pageX ?? e.clientX
  const clientY = touch?.clientY ?? touch?.pageY ?? e.clientY
  if (typeof clientX === 'number' && typeof clientY === 'number') {
    return { x: clientX, y: clientY, local: false }
  }
  if (typeof e.detail?.x === 'number' && typeof e.detail?.y === 'number') {
    return { x: e.detail.x, y: e.detail.y, local: true }
  }
  if (typeof touch?.x === 'number' && typeof touch?.y === 'number') {
    return { x: touch.x, y: touch.y, local: true }
  }
  return null
}

function getTouchDistance(event: unknown): number | null {
  const e = event as {
    touches?: Array<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number; x?: number; y?: number }>
  }
  const touches = e.touches
  if (!touches || touches.length < 2) return null
  const a = touches[0]
  const b = touches[1]
  const ax = a.clientX ?? a.pageX ?? a.x
  const ay = a.clientY ?? a.pageY ?? a.y
  const bx = b.clientX ?? b.pageX ?? b.x
  const by = b.clientY ?? b.pageY ?? b.y
  if (
    typeof ax !== 'number' ||
    typeof ay !== 'number' ||
    typeof bx !== 'number' ||
    typeof by !== 'number'
  ) {
    return null
  }
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}
