/**
 * 俄罗斯方块 canvas 渲染器：纯 2D API（类型对 CanvasRenderingContext2D，同 sheetRenderer 家法），
 * 无 #ifdef、无 uni/wx——canvas 节点获取归页面（canvasAdapter），本文件只管"给状态画一帧"。
 * 配色与布局按 Pen 原型稿（冷调墨蓝街机皮肤）：深墨蓝底 + 深色右栏面板 + 圆角斜面格子。
 * 每次状态变化整幅重绘（clearRect 清全幅——右栏透明区不清屏会残留旧帧叠成马赛克）。
 */

import { BOARD_H, BOARD_W, ghostY, pieceCells, type ActivePiece, type PieceId, type TetrisState } from '@/utils/tetris'

/** 经典 7 色（柔和版）。 */
export const PIECE_COLORS: Record<PieceId, string> = {
  I: '#3EC6E0',
  O: '#F2C14E',
  T: '#A86EE8',
  S: '#5CC26A',
  Z: '#E05F5F',
  J: '#6E8DF2',
  L: '#E8974E',
}

export const BOARD_BG = '#F7EEDF'
export const BOARD_GRID = '#E9DCC8'
export const BOARD_FRAME = '#D8C4A8'
/** 右栏白色面板（亮色皮肤:奶油页 + 白面板 + 暖棕标签）。 */
const RAIL_PANEL = '#FFFFFF'
const RAIL_TEXT = '#7D6F60'
const ACTION_COLOR = '#1E9DBE'
/** 消行闪烁色:浅底上白色闪不出来,用品牌金。 */
const CLEAR_FLASH = '#F4B942'

export interface TetrisLayout {
  /** 整个 canvas 的 css 尺寸（棋盘 + 右栏）。 */
  totalW: number
  totalH: number
  boardX: number
  boardY: number
  /** 棋盘格边长。 */
  cell: number
  holdX: number
  holdY: number
  holdCell: number
  nextX: number
  nextY: number
  nextCell: number
  nextGap: number
  /** 右栏标签字号。 */
  labelPx: number
  /** HOLD/NEXT 面板盒高（含内边距）。 */
  boxH: number
}

/** 总宽按棋盘格表达：10 列棋盘 + 0.42 间隔 + 3.3 右栏 = 13.72 格（原型 375 屏 → 格 ≈25.6）。 */
const GAP_CELLS = 0.42
const RAIL_CELLS = 3.3
const TOTAL_COLS = BOARD_W + GAP_CELLS + RAIL_CELLS

export function computeTetrisLayout(availW: number, availH: number): TetrisLayout {
  const cell = Math.max(8, Math.floor(Math.min(availW / TOTAL_COLS, availH / BOARD_H)))
  const boardW = cell * BOARD_W
  const railX = boardW + cell * GAP_CELLS
  const railW = cell * RAIL_CELLS
  // 预览格约为棋盘格一半（原型 13/25.5），I 块横放 4 格 + 间隙仍放进右栏
  const holdCell = Math.round(cell * 0.51)
  const nextCell = holdCell
  const nextGap = Math.round(cell * 0.42)
  const labelPx = Math.max(9, Math.round(cell * 0.42))
  const boxInnerGap = Math.max(6, Math.round(cell * 0.35))
  const boxPad = Math.max(8, Math.round(cell * 0.39))
  const boxH = boxPad * 2 + labelPx + boxInnerGap + holdCell * 2 + 2
  const holdY = labelPx + 5
  const nextY = holdY + boxH + boxInnerGap
  return {
    totalW: Math.ceil(railX + railW),
    totalH: cell * BOARD_H,
    boardX: 0,
    boardY: 0,
    cell,
    holdX: railX,
    holdY,
    holdCell,
    nextX: railX,
    nextY,
    nextCell,
    nextGap,
    labelPx,
    boxH,
  }
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.round((n & 0xff) * factor))
  return `rgb(${r},${g},${b})`
}

const SHADED: Record<PieceId, { dark: string; light: string }> = Object.fromEntries(
  (Object.keys(PIECE_COLORS) as PieceId[]).map((id) => [id, { dark: shade(PIECE_COLORS[id], 0.72), light: shade(PIECE_COLORS[id], 1.22) }]),
) as Record<PieceId, { dark: string; light: string }>

/** 圆角矩形路径（WeChat 2d ctx 的 roundRect 兼容性不稳,手画路径）。 */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

/** 经典斜面格子（原型样式）：圆角平涂 + 顶部亮条 + 深色描边,无渐变/阴影。 */
function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, id: PieceId, alpha = 1): void {
  const { dark, light } = SHADED[id]
  const rad = Math.max(2, size * 0.16)
  ctx.globalAlpha = alpha
  ctx.fillStyle = PIECE_COLORS[id]
  roundRectPath(ctx, x, y, size, size, rad)
  ctx.fill()
  ctx.fillStyle = light
  roundRectPath(ctx, x, y, size, Math.max(3, size * 0.3), rad)
  ctx.fill()
  ctx.strokeStyle = dark
  ctx.lineWidth = 1
  roundRectPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1, rad)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** 把一个块（rot 0 态）居中画进预览面板（按包围盒居中,O/I 不偏航;I 块缩一档防贴边）。 */
function drawPiecePreview(
  ctx: CanvasRenderingContext2D,
  id: PieceId,
  centerX: number,
  centerY: number,
  cell: number,
  clipRect: { x: number; y: number; w: number; h: number },
  dim = false,
): void {
  ctx.save()
  roundRectPath(ctx, clipRect.x, clipRect.y, clipRect.w, clipRect.h, 6)
  ctx.clip()
  const cells = pieceCells(id, 0)
  let minX = 4
  let maxX = -1
  let minY = 4
  let maxY = -1
  for (const [cx, cy] of cells) {
    minX = Math.min(minX, cx)
    maxX = Math.max(maxX, cx)
    minY = Math.min(minY, cy)
    maxY = Math.max(maxY, cy)
  }
  const pieceW = (maxX - minX + 1) * cell
  const scale = pieceW > clipRect.w - 10 ? (clipRect.w - 10) / pieceW : 1
  const cw = cell * scale
  const w = (maxX - minX + 1) * cw
  const h = (maxY - minY + 1) * cw
  const originX = centerX - w / 2
  const originY = centerY - h / 2
  for (const [cx, cy] of cells) {
    drawCell(ctx, originX + (cx - minX) * cw, originY + (cy - minY) * cw, cw, id, dim ? 0.5 : 1)
  }
  ctx.restore()
}

function drawRailPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  labelPx: number,
): void {
  const rad = Math.max(8, labelPx * 1.1)
  ctx.fillStyle = RAIL_PANEL
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad)
  ctx.fill()
  ctx.strokeStyle = BOARD_FRAME
  ctx.lineWidth = 1
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad)
  ctx.stroke()
  ctx.fillStyle = RAIL_TEXT
  ctx.font = `700 ${labelPx}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + w / 2, y + rad * 0.8)
  ctx.textAlign = 'left'
}

/** 一帧 = 清屏 → 棋盘（网格/边框/满行白闪/幽灵/活动块） + 右栏 HOLD/NEXT×3 深色面板。 */
export function drawTetrisFrame(ctx: CanvasRenderingContext2D, layout: TetrisLayout, state: TetrisState): void {
  const { cell, boardX, boardY } = layout
  const boardW = cell * BOARD_W
  const boardH = cell * BOARD_H

  ctx.clearRect(0, 0, layout.totalW, layout.totalH)

  // 棋盘底 + 网格 + 边框
  ctx.fillStyle = BOARD_BG
  ctx.fillRect(boardX, boardY, boardW, boardH)
  ctx.strokeStyle = BOARD_GRID
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 1; x < BOARD_W; x++) {
    ctx.moveTo(boardX + x * cell + 0.5, boardY)
    ctx.lineTo(boardX + x * cell + 0.5, boardY + boardH)
  }
  for (let y = 1; y < BOARD_H; y++) {
    ctx.moveTo(boardX, boardY + y * cell + 0.5)
    ctx.lineTo(boardX + boardW, boardY + y * cell + 0.5)
  }
  ctx.stroke()
  ctx.strokeStyle = BOARD_FRAME
  ctx.lineWidth = 1.5
  ctx.strokeRect(boardX + 0.75, boardY + 0.75, boardW - 1.5, boardH - 1.5)

  // 棋盘内容全部裁剪在棋盘矩形内（防御:任何越界绘制都剪掉,不会渗进右栏间隙）
  ctx.save()
  ctx.beginPath()
  ctx.rect(boardX, boardY, boardW, boardH)
  ctx.clip()

  // 已固化格子
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      const id = state.board[y * BOARD_W + x]
      if (id) drawCell(ctx, boardX + x * cell + 1.5, boardY + y * cell + 1.5, cell - 3, id)
    }
  }

  // 满行金闪（clearing 相位,塌行由引擎 tick 收尾;浅底上白色不可见）
  if (state.phase === 'clearing') {
    ctx.fillStyle = CLEAR_FLASH
    for (const row of state.clearingRows) {
      roundRectPath(ctx, boardX + 3, boardY + row * cell + 3, boardW - 6, cell - 6, cell * 0.16)
      ctx.fill()
    }
  }

  // 幽灵块（描边样式——半透明填充在深底上发 muddy,描边更干净）+ 活动块
  const active: ActivePiece | null = state.active
  if (active && state.phase === 'playing') {
    const gy = ghostY(state)
    if (gy > active.y) {
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = PIECE_COLORS[active.id]
      ctx.lineWidth = 1.5
      for (const [cx, cy] of pieceCells(active.id, active.rot)) {
        roundRectPath(ctx, boardX + (active.x + cx) * cell + 3, boardY + (gy + cy) * cell + 3, cell - 6, cell - 6, cell * 0.14)
        ctx.stroke()
      }
      ctx.restore()
    }
    for (const [cx, cy] of pieceCells(active.id, active.rot)) {
      drawCell(ctx, boardX + (active.x + cx) * cell + 1.5, boardY + (active.y + cy) * cell + 1.5, cell - 3, active.id)
    }
  }
  ctx.restore()

  // 右栏：HOLD（已用变暗）+ NEXT×3 面板（第一个全亮,其余 0.85）
  const railW = layout.totalW - layout.holdX
  drawRailPanel(ctx, layout.holdX, layout.holdY, railW, layout.boxH, 'HOLD', layout.labelPx)
  if (state.hold) {
    drawPiecePreview(
      ctx,
      state.hold,
      layout.holdX + railW / 2,
      layout.holdY + layout.boxH / 2 + layout.labelPx * 0.35,
      layout.holdCell,
      { x: layout.holdX, y: layout.holdY, w: railW, h: layout.boxH },
      state.holdUsed,
    )
  }

  const queue = state.queue.slice(0, 3)
  queue.forEach((id, i) => {
    const boxTop = layout.nextY + i * (layout.boxH + layout.nextGap)
    drawRailPanel(ctx, layout.nextX, boxTop, railW, layout.boxH, 'NEXT', layout.labelPx)
    drawPiecePreview(
      ctx,
      id,
      layout.nextX + railW / 2,
      boxTop + layout.boxH / 2 + layout.labelPx * 0.35,
      layout.nextCell,
      { x: layout.nextX, y: boxTop, w: railW, h: layout.boxH },
      i > 0,
    )
  })

  // 等级数字画在右栏底部,填充剩余高度（街机 HUD 感）
  const lastBoxBottom = layout.nextY + Math.max(0, queue.length - 1) * (layout.boxH + layout.nextGap) + layout.boxH
  const levelTop = lastBoxBottom + cell * 0.5
  if (levelTop + labelSafe(layout) < layout.totalH) {
    ctx.fillStyle = RAIL_TEXT
    ctx.font = `700 ${Math.max(9, Math.round(cell * 0.34))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('LEVEL', layout.nextX + railW / 2, levelTop)
    ctx.fillStyle = ACTION_COLOR
    ctx.font = `700 ${Math.max(12, Math.round(cell * 0.62))}px sans-serif`
    ctx.fillText(String(state.level), layout.nextX + railW / 2, levelTop + cell * 0.42)
    ctx.textAlign = 'left'
  }
}

function labelSafe(layout: TetrisLayout): number {
  return layout.labelPx * 2 + layout.cell * 0.62
}
