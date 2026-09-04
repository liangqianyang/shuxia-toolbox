/**
 * 飞行棋棋盘离屏渲染：程序化 canvas 画一次 → 临时图片模块级缓存（照 unoCards.ts 模式），
 * 牌桌 = 棋盘图 + DOM 飞机（页面层做 CSS 动画），无每帧 canvas。
 *
 * 样式参考经典飞行棋：奶油底 + 方格留缝；四角实色机场顶满角（白色停机位）、
 * 跑道白底格（细色描边表示跳跃归属，颜色重量交给机场/跑道/起飞格）、
 * 起飞/飞行格实色 + 白图标、环上箭羽标行进方向、终点跑道实色列、
 * 入口箭头指向跑道、中心四色三角（各对准本色的臂）。
 * 全程序化不贴素材（早期贴 tiles 素材包效果杂乱已弃用）；几何全部来自 ludoBoard.ts（唯一真相）。
 */
import { canvasToFile, createDrawingCanvas } from '../../utils/canvasAdapter'
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

/** 玩家四色（页面飞机回退色/播报条同用这组）。 */
export const LUDO_COLORS = [
  { name: '红', hex: '#EF5B5B' },
  { name: '黄', hex: '#F2B33D' },
  { name: '蓝', hex: '#4E8DE8' },
  { name: '绿', hex: '#4FBF6B' },
]

/** 品牌底色（奶油白/墨绿，同枫趣牌局色板）。 */
const BOARD_BG = '#FFF8ED'
const BOARD_INK = '#21483D'

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

  /** 方格（格中心 p，留缝 inset、圆角 r）。 */
  const drawCellSquare = (p: Point, fill: string, stroke: string | null) => {
    const [cx, cy] = cell(p)
    const inset = s * 0.03
    roundRect(ctx, cx - s / 2 + inset, cy - s / 2 + inset, s - inset * 2, s - inset * 2, s * 0.1)
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = Math.max(1, s * 0.08)
      ctx.stroke()
    }
  }

  // ── 底板 ──
  ctx.fillStyle = BOARD_BG
  roundRect(ctx, 0, 0, px, px, s * 0.5)
  ctx.fill()
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(2, s * 0.14)
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, px - ctx.lineWidth, px - ctx.lineWidth, s * 0.48)
  ctx.stroke()

  // ── 四角机场：实色块顶满四角（只留细缝，参考经典棋盘）+ 白色停机位 ──
  YARD_RECTS.forEach(([x0, y0, x1, y1], color) => {
    const pad = s * 0.06
    ctx.fillStyle = LUDO_COLORS[color].hex
    roundRect(ctx, x0 * s + pad, y0 * s + pad, (x1 - x0 + 1) * s - pad * 2, (y1 - y0 + 1) * s - pad * 2, s * 0.3)
    ctx.fill()
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = cell(hangarSlot(color, i))
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.52, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  // ── 主道 52 格：跑道白底（细色描边 = 跳跃归属）；起飞/飞行格实色 + 白图标 ──
  RING.forEach((_gridPos, i) => {
    const p = trackCell(i)
    const color = i % 4
    if (i === starIndex(color)) {
      // 起飞格 = 星标保护格
      drawCellSquare(p, LUDO_COLORS[color].hex, null)
      drawStar(ctx, cell(p), s * 0.3, '#FFFFFF', BOARD_INK)
      return
    }
    if (flyFromIndices.has(i)) {
      // 飞行格：白色小飞机标记（朝飞行弧出发方向）
      drawCellSquare(p, LUDO_COLORS[color].hex, null)
      drawPaperPlane(ctx, cell(p), s * 0.28, RING[i], flyArc(color).ctrl)
      return
    }
    drawCellSquare(p, '#FFFFFF', LUDO_COLORS[color].hex)
  })

  // ── 入口箭头：d=50 格（本色跑道入口外侧）指向跑道第一格 ──
  for (let color = 0; color < 4; color++) {
    const entry = trackCell(ringIndexFor(color, 50))
    const first = homeCell(color, 51)
    drawArrow(ctx, cell(entry), cell(first), s * 0.32, LUDO_COLORS[color].hex)
  }

  // ── 路线方向标：环上小箭羽指向下一格（顺时针行进方向），让"怎么走"一眼可读。
  //    每色起飞格后一格必标（起飞去向），其余每 4 格一枚；已有标记（星/飞机/闪电/入口箭头）的格子跳过。 ──
  const markedCells = new Set<number>([
    ...[0, 1, 2, 3].map((c) => starIndex(c)),
    ...flyFromIndices,
    ...[0, 1, 2, 3].map((c) => ringIndexFor(c, 22)),
    ...[0, 1, 2, 3].map((c) => ringIndexFor(c, 50)),
  ])
  const chevronCells = new Set<number>()
  for (let i = 2; i < RING.length; i += 4) chevronCells.add(i)
  for (let c = 0; c < 4; c++) chevronCells.add((starIndex(c) + 1) % RING.length)
  for (const i of chevronCells) {
    if (markedCells.has(i)) continue
    const from = trackCell(i)
    const to = trackCell(i + 1)
    drawChevron(ctx, cell(from), s * 0.22, Math.atan2(to.y - from.y, to.x - from.x))
  }

  // ── 终点跑道 4×5：实色列通向中心 ──
  for (let color = 0; color < 4; color++) {
    for (let pos = 51; pos <= 55; pos++) {
      drawCellSquare(homeCell(color, pos), LUDO_COLORS[color].hex, null)
    }
  }

  // ── 飞行虚线弧（细、淡，语义提示）+ 压碾格小闪电 ──
  for (let color = 0; color < 4; color++) {
    const { from, to, ctrl } = flyArc(color)
    const [fx, fy] = cell(from)
    const [tx, ty] = cell(to)
    const [cxp, cyp] = cell(ctrl)
    ctx.save()
    ctx.strokeStyle = LUDO_COLORS[color].hex
    ctx.globalAlpha = 0.3
    ctx.lineWidth = Math.max(1.2, s * 0.06)
    ctx.setLineDash([s * 0.24, s * 0.22])
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.quadraticCurveTo(cxp, cyp, tx, ty)
    ctx.stroke()
    ctx.restore()
    const crushP = trackCell(ringIndexFor(color, 22))
    drawBolt(ctx, cell(crushP), s * 0.15, LUDO_COLORS[color].hex)
  }

  // ── 中心终点：四色三角各对准本色的臂（底边贴臂、尖角向心），奶油缝隙分隔 ──
  const [ccx, ccy] = cell(centerPoint())
  const half = s * 1.48
  const corners: Array<[Point, Point]> = [
    [{ x: -1, y: -1 }, { x: -1, y: 1 }], // 色 0：左（左臂跑道来向）
    [{ x: -1, y: -1 }, { x: 1, y: -1 }], // 色 1：顶
    [{ x: 1, y: -1 }, { x: 1, y: 1 }], // 色 2：右
    [{ x: -1, y: 1 }, { x: 1, y: 1 }], // 色 3：底
  ]
  corners.forEach(([d1, d2], color) => {
    ctx.fillStyle = LUDO_COLORS[color].hex
    ctx.beginPath()
    ctx.moveTo(ccx, ccy)
    ctx.lineTo(ccx + d1.x * half, ccy + d1.y * half)
    ctx.lineTo(ccx + d2.x * half, ccy + d2.y * half)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = BOARD_BG
    ctx.lineWidth = Math.max(1.2, s * 0.07)
    ctx.stroke()
  })

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

function drawStar(
  ctx: CanvasRenderingContext2D,
  [cx, cy]: [number, number],
  r: number,
  fill = '#FFFFFF',
  stroke?: string,
) {
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
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(0.8, r * 0.1)
    ctx.stroke()
  }
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

/** 环上方向标：小箭羽（chevron）指向行进方向，墨绿半透明不抢主体标记。 */
function drawChevron(ctx: CanvasRenderingContext2D, [cx, cy]: [number, number], r: number, angle: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = 'rgba(33, 72, 61, 0.34)'
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(-r * 0.6, r * 0.6)
  ctx.lineTo(-r * 0.32, 0)
  ctx.lineTo(-r * 0.6, -r * 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 入口箭头：从 from 格指向 to 格方向的小实心三角（跑道入口指示，参考经典棋盘）。 */
function drawArrow(ctx: CanvasRenderingContext2D, [cx, cy]: [number, number], to: [number, number], r: number, color: string) {
  const angle = Math.atan2(to[1] - cy, to[0] - cx)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = Math.max(0.8, r * 0.14)
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
