/**
 * 飞行棋棋盘离屏渲染：程序化 canvas 画一次 → 临时图片模块级缓存（照 unoCards.ts 模式），
 * 牌桌 = 棋盘图 + DOM 飞机（页面层做 CSS 动画），无每帧 canvas。
 *
 * 贴图素材来自 static/ludo/tiles/（素材包重切版）；贴图加载失败自动回退为纯色圆。
 * 几何全部来自 ludoBoard.ts（唯一真相）。
 */
import { canvasToFile, createDrawingCanvas, loadDrawableImage } from './canvasAdapter'
import {
  GRID,
  RING,
  YARD_RECTS,
  centerPoint,
  flyArc,
  flyFromIndex,
  hangarSlot,
  homeCell,
  ringIndexFor,
  starIndex,
  trackCell,
  type Point,
} from './ludoBoard'

/** 玩家四色（与素材包飞机/格子同族，棋盘绘制统一用这组）。 */
export const LUDO_COLORS = [
  { name: '红', hex: '#EF5B5B', light: '#FBE3E3' },
  { name: '黄', hex: '#F2B33D', light: '#FBEFD9' },
  { name: '蓝', hex: '#4E8DE8', light: '#DFEAFB' },
  { name: '绿', hex: '#4FBF6B', light: '#DFF3E4' },
]

/** 品牌底色（奶油白/墨绿，同枫趣牌局色板）。 */
const BOARD_BG = '#FFF8ED'
const BOARD_INK = '#21483D'
const BOARD_BORDER = '#E8D9BE'

import { cdnUrl } from './cdn'
const TILE_PATHS = ['red', 'yellow', 'blue', 'green'].map((c) => cdnUrl(`/pages-ludo/static/ludo/tiles/${c}_path.png`))

const boardImageCache = new Map<number, Promise<string>>()

/** 渲染棋盘（边长 px 物理像素），返回临时图片路径；同尺寸只渲染一次。 */
export function ludoBoardImage(px: number): Promise<string> {
  const key = Math.round(px)
  const cached = boardImageCache.get(key)
  if (cached) return cached
  const task = renderBoard(key).catch((err) => {
    boardImageCache.delete(key)
    throw err
  })
  boardImageCache.set(key, task)
  return task
}

async function renderBoard(px: number): Promise<string> {
  const { canvas, ctx } = createDrawingCanvas(px, px)
  const s = px / GRID // 一格的物理像素
  const cell = (p: Point): [number, number] => [p.x * px, p.y * px]

  // 贴图（绑定本 canvas；失败回退纯色圆）
  const tiles = await Promise.all(TILE_PATHS.map((src) => loadDrawableImage(canvas, src)))

  // ── 底板 ──
  ctx.fillStyle = BOARD_BG
  roundRect(ctx, 0, 0, px, px, s * 0.9)
  ctx.fill()
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(2, s * 0.16)
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, px - ctx.lineWidth, px - ctx.lineWidth, s * 0.85)
  ctx.stroke()

  const drawCircleCell = (p: Point, color: number, size = 0.92) => {
    const [cx, cy] = cell(p)
    const r = (s * size) / 2
    const tile = tiles[color]
    if (tile) {
      ctx.drawImage(tile, cx - r, cy - r, r * 2, r * 2)
      return
    }
    ctx.fillStyle = LUDO_COLORS[color].hex
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // ── 四角机场 ──
  YARD_RECTS.forEach(([x0, y0, x1, y1], color) => {
    const pad = s * 0.35
    const rx = x0 * s + pad
    const ry = y0 * s + pad
    const rw = (x1 - x0 + 1) * s - pad * 2
    const rh = (y1 - y0 + 1) * s - pad * 2
    ctx.fillStyle = LUDO_COLORS[color].light
    roundRect(ctx, rx, ry, rw, rh, s * 0.8)
    ctx.fill()
    ctx.strokeStyle = LUDO_COLORS[color].hex
    ctx.lineWidth = Math.max(1.5, s * 0.12)
    roundRect(ctx, rx, ry, rw, rh, s * 0.8)
    ctx.stroke()
    // 2×2 停机位圆盘
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = cell(hangarSlot(color, i))
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.52, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = LUDO_COLORS[color].hex
      ctx.lineWidth = Math.max(1, s * 0.08)
      ctx.stroke()
    }
  })

  // ── 主道 52 格 ──
  RING.forEach((_gridPos, i) => {
    const p = trackCell(i)
    const color = i % 4
    if (i === starIndex(color)) {
      // 起飞格 = 星标保护格：己色圆 + 白星
      drawCircleCell(p, color, 1.0)
      drawStar(ctx, cell(p), s * 0.34)
      return
    }
    if (flyFromIndices.has(i)) {
      // 飞行格：己色圆 + 白色小飞机标记（朝飞行弧出发方向）
      drawCircleCell(p, color, 1.0)
      drawPaperPlane(ctx, cell(p), s * 0.3, RING[i], flyArc(color).ctrl)
      return
    }
    drawCircleCell(p, color, 0.86)
  })

  // ── 终点跑道 4×5 ──
  for (let color = 0; color < 4; color++) {
    for (let pos = 51; pos <= 55; pos++) {
      drawCircleCell(homeCell(color, pos), color, 0.8)
    }
  }

  // ── 飞行虚线弧（穿过碾压格上方） + 碾压格小闪电 ──
  for (let color = 0; color < 4; color++) {
    const { from, to, ctrl } = flyArc(color)
    const [fx, fy] = cell(from)
    const [tx, ty] = cell(to)
    const [cxp, cyp] = cell(ctrl)
    ctx.save()
    ctx.strokeStyle = LUDO_COLORS[color].hex
    ctx.globalAlpha = 0.75
    ctx.lineWidth = Math.max(1.5, s * 0.11)
    ctx.setLineDash([s * 0.28, s * 0.22])
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.quadraticCurveTo(cxp, cyp, tx, ty)
    ctx.stroke()
    ctx.restore()
    const crushP = trackCell(ringIndexFor(color, 22))
    drawBolt(ctx, cell(crushP), s * 0.2, LUDO_COLORS[color].hex)
  }

  // ── 中心终点：四色三角转盘 + 星 ──
  const [ccx, ccy] = cell(centerPoint())
  const half = s * 1.28
  const dirs: Array<[Point, Point]> = [
    [{ x: 0, y: -1 }, { x: 1, y: 0 }], // 上：指向顶臂（色 1 跑道来向）
    [{ x: 1, y: 0 }, { x: 0, y: 1 }], // 右：色 2
    [{ x: 0, y: 1 }, { x: -1, y: 0 }], // 下：色 3
    [{ x: -1, y: 0 }, { x: 0, y: -1 }], // 左：色 0
  ]
  dirs.forEach(([d1, d2], color) => {
    ctx.fillStyle = LUDO_COLORS[color].hex
    ctx.beginPath()
    ctx.moveTo(ccx, ccy)
    ctx.lineTo(ccx + d1.x * half, ccy + d1.y * half)
    ctx.lineTo(ccx + d2.x * half, ccy + d2.y * half)
    ctx.closePath()
    ctx.fill()
  })
  ctx.fillStyle = BOARD_BG
  ctx.beginPath()
  ctx.arc(ccx, ccy, s * 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(1.5, s * 0.1)
  ctx.stroke()
  drawStar(ctx, [ccx, ccy], s * 0.36, BOARD_INK)

  return canvasToFile(canvas, px, px)
}

/** 四个飞行起点的环索引集合（绘制标记用）。 */
const flyFromIndices = new Set([0, 1, 2, 3].map((c) => flyFromIndex(c)))

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawStar(ctx: CanvasRenderingContext2D, [cx, cy]: [number, number], r: number, fill = '#FFFFFF') {
  ctx.fillStyle = fill
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

/** 飞行格上的小纸飞机标记（朝飞行弧出发方向：格中心 → 弧控制点）。 */
function drawPaperPlane(ctx: CanvasRenderingContext2D, [cx, cy]: [number, number], r: number, ringPos: [number, number], ctrl: Point) {
  const angle = Math.atan2(ctrl.y * GRID - ringPos[1], ctrl.x * GRID - ringPos[0])
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(0.8, r * 0.08)
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(-r * 0.7, r * 0.62)
  ctx.lineTo(-r * 0.34, 0)
  ctx.lineTo(-r * 0.7, -r * 0.62)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** 碾压格上的小闪电。 */
function drawBolt(ctx: CanvasRenderingContext2D, [cx, cy]: [number, number], r: number, color: string) {
  ctx.fillStyle = color
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = Math.max(0.8, r * 0.16)
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.28, cy - r)
  ctx.lineTo(cx - r * 0.5, cy + r * 0.12)
  ctx.lineTo(cx + r * 0.02, cy + r * 0.12)
  ctx.lineTo(cx - r * 0.28, cy + r)
  ctx.lineTo(cx + r * 0.5, cy - r * 0.12)
  ctx.lineTo(cx - r * 0.02, cy - r * 0.12)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
}
