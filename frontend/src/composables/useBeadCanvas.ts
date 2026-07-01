import { ref, shallowRef } from 'vue'
import type { PatternResult } from '@/types/beads'
import { getCanvasNode, getElementRect, type CanvasNode } from '@/utils/canvasAdapter'
import { computeSheetLayout, renderSheet, type SheetLayout } from '@/utils/sheetRenderer'

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

    const info = uni.getSystemInfoSync()
    const baseCssW = (info.windowWidth || 375) - 32 // 页面左右 padding
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

    renderSheet(ctx, result, layout, highlightIndex.value ?? undefined)
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

    const rect = await getElementRect(selector, component)
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
    pinching.value = false
    pinchStartDistance.value = 0
    pinchStartZoom.value = zoom.value
    if (result) {
      await render(result, component)
    }
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
  }

  function setLiveZoom(value: number) {
    applyLiveZoom(value)
  }

  function release() {
    node.value = null
    cssWidth.value = 0
    cssHeight.value = 0
    contentWidth.value = 0
    contentHeight.value = 0
    scrollLeft.value = 0
    scrollTop.value = 0
    lastLayout.value = null
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
