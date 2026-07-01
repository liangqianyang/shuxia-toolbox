import type { PatternResult } from '@/types/beads'
import { EMPTY_CELL } from '@/types/beads'
import { getPalette } from '@/utils/beadPalette'
import { textColorOn } from '@/utils/color'
import { displayCode } from '@/utils/format'

/**
 * 图纸版式（对标参考图）：
 * 标题（色卡名+总豆数）/ 四边行列编号 / 格内色号（黑白自适应）/
 * 空格棋盘格 / 底部彩色药丸图例（色号+数量）。
 * 所有尺寸均为 cellPx 的比例，保证任意分辨率下版式一致。
 */
export interface SheetLayout {
  cellPx: number
  margin: number
  indexBand: number
  titleH: number
  gridX: number
  gridY: number
  legendGap: number
  legendItemW: number
  legendItemH: number
  legendCols: number
  legendRows: number
  totalW: number
  totalH: number
  /** cellPx 过小时关闭格内色号 */
  showCodes: boolean
}

const MARGIN_R = 0.6
const INDEX_R = 0.9
const TITLE_R = 1.6
const LEGEND_GAP_R = 0.8
const LEGEND_ITEM_W_R = 4.8
const LEGEND_ITEM_H_R = 1.5
const MIN_CODE_CELL_PX = 22

export function computeSheetLayout(result: PatternResult, maxCanvasPx = 4000): SheetLayout {
  const { width: gridW, height: gridH, used } = result

  // 宽度方向：totalW = cellPx * (2*margin + 2*indexBand + gridW)
  const widthFactor = 2 * MARGIN_R + 2 * INDEX_R + gridW
  // 图例列数只与宽高比例有关，与 cellPx 无关
  const legendAvailR = widthFactor - 2 * MARGIN_R
  const legendCols = Math.max(1, Math.floor(legendAvailR / LEGEND_ITEM_W_R))
  const legendRows = Math.ceil(used.length / legendCols)
  const heightFactor =
    2 * MARGIN_R + TITLE_R + 2 * INDEX_R + gridH + LEGEND_GAP_R + legendRows * LEGEND_ITEM_H_R

  const cellPx = Math.max(
    8,
    Math.min(50, Math.floor(maxCanvasPx / widthFactor), Math.floor(maxCanvasPx / heightFactor)),
  )

  const margin = Math.round(cellPx * MARGIN_R)
  const indexBand = Math.round(cellPx * INDEX_R)
  const titleH = Math.round(cellPx * TITLE_R)
  const gridX = margin + indexBand
  const gridY = margin + titleH + indexBand

  return {
    cellPx,
    margin,
    indexBand,
    titleH,
    gridX,
    gridY,
    legendGap: Math.round(cellPx * LEGEND_GAP_R),
    legendItemW: Math.round(cellPx * LEGEND_ITEM_W_R),
    legendItemH: Math.round(cellPx * LEGEND_ITEM_H_R),
    legendCols,
    legendRows,
    totalW: Math.ceil(cellPx * widthFactor),
    totalH: Math.ceil(cellPx * heightFactor),
    showCodes: cellPx >= MIN_CODE_CELL_PX,
  }
}

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function renderSheet(
  ctx: CanvasRenderingContext2D,
  result: PatternResult,
  layout: SheetLayout,
  /** 隔离高亮的色板下标：传入时只点亮该色，其余格子（含空格）罩暗纱聚焦该色；
   *  导出与默认预览不传 → 无暗纱，不影响。 */
  highlightIndex?: number,
): void {
  const { width: gridW, height: gridH, cells, used, totalBeads } = result
  const palette = getPalette(result.params.paletteKey)
  const { cellPx, margin, indexBand, gridX, gridY, totalW, totalH, showCodes } = layout

  // 每格左缘取整对齐，宽度用相邻边缘差，杜绝缝隙和重叠毛边
  const edgeX = (i: number) => Math.round(gridX + i * cellPx)
  const edgeY = (i: number) => Math.round(gridY + i * cellPx)
  const gridRight = edgeX(gridW)
  const gridBottom = edgeY(gridH)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 底色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, totalW, totalH)

  // 标题：Mard(3474) · 52×50 · 1 张 52 小板
  ctx.fillStyle = '#3A3A3A'
  ctx.font = `bold ${Math.round(cellPx * 0.72)}px sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(
    `${palette.displayName}(${totalBeads}) · ${gridW}×${gridH} · ${result.boardPlan.label}`,
    margin,
    margin + layout.titleH / 2,
  )
  ctx.textAlign = 'center'

  // 四边行列编号
  ctx.fillStyle = '#8C8C8C'
  ctx.font = `${Math.round(cellPx * 0.38)}px sans-serif`
  for (let x = 0; x < gridW; x++) {
    const cx = (edgeX(x) + edgeX(x + 1)) / 2
    ctx.fillText(String(x + 1), cx, gridY - indexBand / 2)
    ctx.fillText(String(x + 1), cx, gridBottom + indexBand / 2)
  }
  for (let y = 0; y < gridH; y++) {
    const cy = (edgeY(y) + edgeY(y + 1)) / 2
    ctx.fillText(String(y + 1), gridX - indexBand / 2, cy)
    ctx.fillText(String(y + 1), gridRight + indexBand / 2, cy)
  }

  // 格子填色 / 空格棋盘
  for (let y = 0; y < gridH; y++) {
    const py = edgeY(y)
    const ph = edgeY(y + 1) - py
    for (let x = 0; x < gridW; x++) {
      const px = edgeX(x)
      const pw = edgeX(x + 1) - px
      const idx = cells[y * gridW + x]
      if (idx === EMPTY_CELL) {
        drawCheckerCell(ctx, px, py, pw, ph)
      } else {
        ctx.fillStyle = palette.colors[idx].hex
        ctx.fillRect(px, py, pw, ph)
      }
    }
  }

  // 网格线
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= gridW; x++) {
    const px = edgeX(x) + 0.5
    ctx.moveTo(px, gridY)
    ctx.lineTo(px, gridBottom)
  }
  for (let y = 0; y <= gridH; y++) {
    const py = edgeY(y) + 0.5
    ctx.moveTo(gridX, py)
    ctx.lineTo(gridRight, py)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.lineWidth = 2
  ctx.strokeRect(gridX, gridY, gridRight - gridX, gridBottom - gridY)

  // 格内色号（黑白自适应）
  if (showCodes) {
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = cells[y * gridW + x]
        if (idx === EMPTY_CELL) continue
        const color = palette.colors[idx]
        const code = displayCode(color.code)
        ctx.fillStyle = textColorOn(color.rgb)
        ctx.font = `${cellFont(code, cellPx)}px sans-serif`
        ctx.fillText(code, (edgeX(x) + edgeX(x + 1)) / 2, (edgeY(y) + edgeY(y + 1)) / 2)
      }
    }
  }

  // 隔离高亮：只点亮某一色，其余格子（含空格）罩一层暗纱聚焦该色。色号/网格线一并变暗。
  if (highlightIndex != null) {
    ctx.fillStyle = 'rgba(18, 18, 18, 0.55)'
    for (let y = 0; y < gridH; y++) {
      const py = edgeY(y)
      const ph = edgeY(y + 1) - py
      for (let x = 0; x < gridW; x++) {
        if (cells[y * gridW + x] === highlightIndex) continue
        const px = edgeX(x)
        const pw = edgeX(x + 1) - px
        ctx.fillRect(px, py, pw, ph)
      }
    }
  }

  // 图例：彩色药丸（色号 + 数量），按用量降序
  const legendTop = gridBottom + indexBand + layout.legendGap
  const pillW = layout.legendItemW - Math.round(cellPx * 0.4)
  const pillH = layout.legendItemH - Math.round(cellPx * 0.35)
  const legendFont = Math.round(cellPx * 0.42)
  for (let i = 0; i < used.length; i++) {
    const col = i % layout.legendCols
    const row = (i / layout.legendCols) | 0
    const x = margin + col * layout.legendItemW
    const y = legendTop + row * layout.legendItemH
    const item = used[i]

    roundRect(ctx, x, y, pillW, pillH, Math.round(cellPx * 0.18))
    ctx.fillStyle = item.color.hex
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = textColorOn(item.color.rgb)
    ctx.font = `bold ${legendFont}px sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText(
      `${displayCode(item.color.code)}  (${item.count})`,
      x + Math.round(cellPx * 0.35),
      y + pillH / 2,
    )
    ctx.textAlign = 'center'
  }

  ctx.restore()
}
