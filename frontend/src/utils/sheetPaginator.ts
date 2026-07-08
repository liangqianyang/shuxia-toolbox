import type { PatternResult } from '@/types/beads'
import { EMPTY_CELL } from '@/types/beads'
import { getPalette } from '@/utils/beadPalette'
import { textColorOn } from '@/utils/color'
import { displayCode } from '@/utils/format'

/**
 * 分页打印导出：整图 4000px 上限下，104 大板打印出来色号肉眼不可读。
 * 把网格按「每页固定格数」切成多页，每页带全局行列坐标 + 页码 + 拼接标记，
 * 用户按页打印后可按坐标拼接。每页独立 canvas 渲染、独立存相册。
 *
 * 每页格数默认 40×40：A4 打印时单格约 5mm，色号清晰可辨；可按需调。
 */
export const PAGE_CELLS = 40

export interface SheetPage {
  /** 全局起始/结束格坐标（含起、不含止） */
  col0: number
  row0: number
  col1: number
  row1: number
  cols: number
  rows: number
  pageIndex: number
  pageCount: number
  /** 网格布局：pageRow/pageCol（从 0 起） */
  gridRow: number
  gridCol: number
  gridRows: number
  gridCols: number
}

/** 按每页格数切分网格，行优先编号。返回页列表（含全局坐标与拼接所需的行列位置）。 */
export function paginate(result: PatternResult, pageCells = PAGE_CELLS): SheetPage[] {
  const gridCols = Math.ceil(result.width / pageCells)
  const gridRows = Math.ceil(result.height / pageCells)
  const pages: SheetPage[] = []
  const pageCount = gridCols * gridRows
  let pageIndex = 0
  for (let gr = 0; gr < gridRows; gr++) {
    for (let gc = 0; gc < gridCols; gc++) {
      const col0 = gc * pageCells
      const row0 = gr * pageCells
      const col1 = Math.min(result.width, col0 + pageCells)
      const row1 = Math.min(result.height, row0 + pageCells)
      pages.push({
        col0,
        row0,
        col1,
        row1,
        cols: col1 - col0,
        rows: row1 - row0,
        pageIndex,
        pageCount,
        gridRow: gr,
        gridCol: gc,
        gridRows,
        gridCols,
      })
      pageIndex++
    }
  }
  return pages
}

interface PageLayout {
  cellPx: number
  margin: number
  indexBand: number
  titleH: number
  gridX: number
  gridY: number
  totalW: number
  totalH: number
}

const MARGIN_R = 0.8
const INDEX_R = 1.0
const TITLE_R = 2.0

function computePageLayout(page: SheetPage, maxCanvasPx = 3600): PageLayout {
  const widthFactor = 2 * MARGIN_R + 2 * INDEX_R + page.cols
  const heightFactor = 2 * MARGIN_R + TITLE_R + 2 * INDEX_R + page.rows
  const cellPx = Math.max(
    12,
    Math.min(60, Math.floor(maxCanvasPx / widthFactor), Math.floor(maxCanvasPx / heightFactor)),
  )
  const margin = Math.round(cellPx * MARGIN_R)
  const indexBand = Math.round(cellPx * INDEX_R)
  const titleH = Math.round(cellPx * TITLE_R)
  return {
    cellPx,
    margin,
    indexBand,
    titleH,
    gridX: margin + indexBand,
    gridY: margin + titleH + indexBand,
    totalW: Math.ceil(cellPx * widthFactor),
    totalH: Math.ceil(cellPx * heightFactor),
  }
}

const GRID_LINE = 'rgba(0, 0, 0, 0.22)'
const GRID_BORDER = 'rgba(0, 0, 0, 0.5)'
const STITCH = '#C8956C'

function cellFont(code: string, cellPx: number): number {
  if (code.length <= 2) return Math.round(cellPx * 0.44)
  if (code.length === 3) return Math.round(cellPx * 0.36)
  return Math.round(cellPx * 0.28)
}

function drawCheckerCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#F4F4F4'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#E6E6E6'
  const halfW = w / 2
  const halfH = h / 2
  ctx.fillRect(x, y, halfW, halfH)
  ctx.fillRect(x + halfW, y + halfH, w - halfW, h - halfH)
}

/**
 * 渲染单页：全局行列坐标 + 页码标题 + 拼接标记（右/下若还有相邻页则标「接第N页 →/↓」）。
 * cells 只画该页覆盖的全局格范围，色号沿用全局黑白自适应。
 */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  result: PatternResult,
  page: SheetPage,
  layout: PageLayout,
): void {
  const palette = getPalette(result.params.paletteKey)
  const { cellPx, margin, indexBand, titleH, gridX, gridY, totalW, totalH } = layout
  const edgeX = (i: number) => Math.round(gridX + i * cellPx)
  const edgeY = (i: number) => Math.round(gridY + i * cellPx)
  const gridRight = edgeX(page.cols)
  const gridBottom = edgeY(page.rows)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 底色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, totalW, totalH)

  // 标题：Mard · 第 X/Y 页 · 行 r1-r2 列 c1-c2
  ctx.fillStyle = '#3A3A3A'
  ctx.font = `bold ${Math.round(cellPx * 0.6)}px sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(
    `${palette.displayName} · 第 ${page.pageIndex + 1}/${page.pageCount} 页 · ` +
      `列 ${page.col0 + 1}-${page.col1} 行 ${page.row0 + 1}-${page.row1}`,
    margin,
    margin + titleH / 2,
  )
  ctx.textAlign = 'center'

  // 全局行列编号（打印后按此坐标拼接）
  ctx.fillStyle = '#8C8C8C'
  ctx.font = `${Math.round(cellPx * 0.36)}px sans-serif`
  for (let x = 0; x < page.cols; x++) {
    const cx = (edgeX(x) + edgeX(x + 1)) / 2
    const label = String(page.col0 + x + 1)
    ctx.fillText(label, cx, gridY - indexBand / 2)
    ctx.fillText(label, cx, gridBottom + indexBand / 2)
  }
  for (let y = 0; y < page.rows; y++) {
    const cy = (edgeY(y) + edgeY(y + 1)) / 2
    const label = String(page.row0 + y + 1)
    ctx.fillText(label, gridX - indexBand / 2, cy)
    ctx.fillText(label, gridRight + indexBand / 2, cy)
  }

  // 格子填色 / 空格棋盘
  for (let y = 0; y < page.rows; y++) {
    const py = edgeY(y)
    const ph = edgeY(y + 1) - py
    for (let x = 0; x < page.cols; x++) {
      const px = edgeX(x)
      const pw = edgeX(x + 1) - px
      const idx = result.cells[(page.row0 + y) * result.width + (page.col0 + x)]
      if (idx === EMPTY_CELL) {
        drawCheckerCell(ctx, px, py, pw, ph)
      } else {
        ctx.fillStyle = palette.colors[idx].hex
        ctx.fillRect(px, py, pw, ph)
      }
    }
  }

  // 网格线 + 外框
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= page.cols; x++) {
    const px = edgeX(x) + 0.5
    ctx.moveTo(px, gridY)
    ctx.lineTo(px, gridBottom)
  }
  for (let y = 0; y <= page.rows; y++) {
    const py = edgeY(y) + 0.5
    ctx.moveTo(gridX, py)
    ctx.lineTo(gridRight, py)
  }
  ctx.stroke()
  ctx.strokeStyle = GRID_BORDER
  ctx.lineWidth = 2
  ctx.strokeRect(gridX, gridY, gridRight - gridX, gridBottom - gridY)

  // 格内色号
  const meta = new Map<number, { code: string; fill: string; font: string }>()
  for (const item of result.used) {
    const code = displayCode(item.color.code)
    meta.set(item.paletteIndex, {
      code,
      fill: textColorOn(item.color.rgb),
      font: `${cellFont(code, cellPx)}px sans-serif`,
    })
  }
  let lastFont = ''
  let lastFill = ''
  for (let y = 0; y < page.rows; y++) {
    for (let x = 0; x < page.cols; x++) {
      const idx = result.cells[(page.row0 + y) * result.width + (page.col0 + x)]
      if (idx === EMPTY_CELL) continue
      const m = meta.get(idx)
      if (!m) continue
      if (m.font !== lastFont) {
        ctx.font = m.font
        lastFont = m.font
      }
      if (m.fill !== lastFill) {
        ctx.fillStyle = m.fill
        lastFill = m.fill
      }
      ctx.fillText(m.code, (edgeX(x) + edgeX(x + 1)) / 2, (edgeY(y) + edgeY(y + 1)) / 2)
    }
  }

  // 拼接标记：右/下若有相邻页，画彩色箭头 + 「接第N页」
  ctx.fillStyle = STITCH
  ctx.font = `bold ${Math.round(cellPx * 0.34)}px sans-serif`
  if (page.gridCol < page.gridCols - 1) {
    const rightPage = page.pageIndex + 1 + 1
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`接第${rightPage}页 →`, gridRight + indexBand / 2, gridY + (gridBottom - gridY) / 2)
    ctx.restore()
  }
  if (page.gridRow < page.gridRows - 1) {
    const downPage = page.pageIndex + page.gridCols + 1
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`接第${downPage}页 ↓`, gridX + (gridRight - gridX) / 2, gridBottom + indexBand / 2)
    ctx.restore()
  }

  ctx.restore()
}

export { computePageLayout }
export type { PageLayout }
