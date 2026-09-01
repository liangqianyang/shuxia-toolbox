/**
 * 枫趣冒险棋盘离屏渲染：程序化 canvas 画一次 → 临时图片模块级缓存（照 ludoRender/unoCards 模式）。
 * 10×10 蛇形山道：五段色带 + 机关格图标 + 缆车虚线 + 营地/枫顶特殊绘制，全程序化零外部素材。
 * 几何与机关定义全部来自 adventureBoard.ts（唯一真相，与后端双份同步）。
 * 山脚起点（pos=0）在棋盘底边下方，由页面层留白容纳，画布本身保持正方形。
 */
import { canvasToFile, createDrawingCanvas } from '../../utils/canvasAdapter'
import { CAMPS, CELLS, SEGMENT_COLORS, SEGMENTS, cellToPoint, isCamp, type CellType } from './adventureBoard'

/** 品牌底色（奶油白/墨绿/枫叶红/金黄，同枫趣牌局色板）。 */
const BOARD_BG = '#FFF8ED'
const BOARD_INK = '#21483D'
const MAPLE = '#E85D4A'
const GOLD = '#F4B942'

/** 机关格底色（在段位浅底上再强调一层）。 */
const CELL_TINT: Partial<Record<CellType, string>> = {
  leaf: '#F7D9C4',
  spring: '#FBE3C9',
  ladder: '#D8ECCE',
  cable: '#D5E4F2',
  slide: '#F2D3CB',
  rock: '#E9DCCB',
  shop: '#F6E2AE',
  supply: '#DDEAD8',
  ambush: '#EBD9E2',
  fate: '#E0DCF2',
  shrine: '#F9E7C9',
  arena: '#F6CFCA',
  avalanche: '#DDE8F0',
  fork: '#E8E3D2',
}

const boardImageCache = new Map<string, Promise<string>>()

/** 渲染棋盘（边长 px 物理像素 + 登顶格 goal），返回临时图片路径；同参数只渲染一次。
 *  短局（goal<100）时 goal 之后的区域以云雾封锁（不可达），枫顶旗画在 goal 格。 */
export function adventureBoardImage(px: number, goal: number = 100): Promise<string> {
  const key = `${Math.round(px)}:${goal}`
  const cached = boardImageCache.get(key)
  if (cached) return cached
  const task = renderBoard(Math.round(px), goal).catch((err) => {
    boardImageCache.delete(key)
    throw err
  })
  boardImageCache.set(key, task)
  return task
}

async function renderBoard(px: number, goal: number): Promise<string> {
  const { canvas, ctx } = createDrawingCanvas(px, px)
  const s = px / 10 // 一格的物理像素
  const pt = (n: number): [number, number] => {
    const p = cellToPoint(n)
    return [p.x * px, p.y * px]
  }

  // ── 底板 ──
  ctx.fillStyle = BOARD_BG
  roundRect(ctx, 0, 0, px, px, s * 0.35)
  ctx.fill()
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(2, s * 0.09)
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, px - ctx.lineWidth, px - ctx.lineWidth, s * 0.32)
  ctx.stroke()

  // ── 五段色带（每段两行，视觉上五条横带） ──
  for (let i = 0; i < SEGMENTS.length; i++) {
    const rowTop = (9 - (i * 2 + 1)) * s // 段的上行所在行（自底数）
    ctx.fillStyle = SEGMENT_COLORS[i].band
    roundRect(ctx, s * 0.16, rowTop + s * 0.16, px - s * 0.32, s * 2 - s * 0.32, s * 0.22)
    ctx.fill()
  }

  // ── 100 格 ──
  for (let n = 1; n <= 100; n++) {
    const [cx, cy] = pt(n)
    const x = cx - s / 2
    const y = cy - s / 2
    const margin = s * 0.07
    const def = CELLS[n]
    const type = def?.type ?? 'plain'
    const seg = SEGMENTS.findIndex((g) => n >= g.from && n <= g.to)

    // 云雾封锁区：短局时登顶格之后的区域不可达
    if (n > goal) {
      ctx.fillStyle = 'rgba(33, 72, 61, 0.10)'
      roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.16)
      ctx.fill()
      ctx.fillStyle = 'rgba(33, 72, 61, 0.22)'
      ctx.font = `${Math.round(s * 0.26)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🌫', cx, cy)
      continue
    }

    if (type === 'camp') {
      // 营地：实底 + 帐篷 + 双层描边
      ctx.fillStyle = '#DCEBD2'
      roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.2)
      ctx.fill()
      ctx.strokeStyle = '#4E7A3A'
      ctx.lineWidth = Math.max(1.5, s * 0.05)
      ctx.stroke()
      drawTent(ctx, cx, cy + s * 0.1, s * 0.3, '#4E7A3A')
    } else if (n === goal) {
      // 登顶格（枫顶/短局终点）：三角峰 + 旗帜
      ctx.fillStyle = '#DCE7F3'
      roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.2)
      ctx.fill()
      ctx.strokeStyle = '#3A5A7E'
      ctx.lineWidth = Math.max(1.5, s * 0.05)
      ctx.stroke()
      drawPeak(ctx, cx, cy + s * 0.06, s * 0.34)
    } else {
      // 普通/机关格：段位浅底 + 机关色 + 图标
      ctx.fillStyle = CELL_TINT[type] ?? SEGMENT_COLORS[seg].cell
      roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.16)
      ctx.fill()
      if (type !== 'plain') {
        ctx.strokeStyle = SEGMENT_COLORS[seg].text
        ctx.lineWidth = Math.max(1, s * 0.03)
        roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.16)
        ctx.stroke()
      }
      if (def) drawGlyph(ctx, type, cx, cy, s, SEGMENT_COLORS[seg].text, def)
    }

    // 格号（右下角小字，每 10 加粗）
    ctx.fillStyle = 'rgba(33,72,61,0.55)'
    ctx.font = `${n % 10 === 0 ? 'bold ' : ''}${Math.round(s * 0.2)}px sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(n), x + s - margin * 1.6, y + s - margin * 1.2)
  }

  // ── 蛇形方向箭头（每行行尾一个 chevron，提示走向） ──
  ctx.fillStyle = 'rgba(33,72,61,0.28)'
  for (let row = 0; row < 10; row++) {
    const toRight = row % 2 === 0
    const col = toRight ? 9 : 0
    const cx = ((col + 0.5) / 10) * px
    const cy = (1 - (row + 0.28) / 10) * px
    const r = s * 0.07
    ctx.beginPath()
    if (toRight) {
      ctx.moveTo(cx - r, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx - r, cy + r)
    } else {
      ctx.moveTo(cx + r, cy - r)
      ctx.lineTo(cx - r, cy)
      ctx.lineTo(cx + r, cy + r)
    }
    ctx.closePath()
    ctx.fill()
  }

  // ── 缆车虚线（长跳转的可视化；伸入云雾封锁区的缆车线不画） ──
  ctx.strokeStyle = 'rgba(74,127,181,0.55)'
  ctx.lineWidth = Math.max(1.5, s * 0.045)
  ctx.setLineDash([s * 0.12, s * 0.1])
  for (const from of [14, 38, 62]) {
    const to = CELLS[from]?.to
    if (!to || to > goal) continue
    const [x1, y1] = pt(from)
    const [x2, y2] = pt(to)
    const lift = Math.min(y1, y2) - s * 0.55 // 弧顶抬到两格上方
    ctx.beginPath()
    ctx.moveTo(x1, y1 - s * 0.2)
    ctx.quadraticCurveTo((x1 + x2) / 2, lift, x2, y2 - s * 0.2)
    ctx.stroke()
    // 缆车小厢
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(74,127,181,0.75)'
    const midX = (x1 + x2) / 2
    const t = 0.5
    const bezY = (1 - t) * (1 - t) * (y1 - s * 0.2) + 2 * (1 - t) * t * lift + t * t * (y2 - s * 0.2)
    roundRect(ctx, midX - s * 0.08, bezY - s * 0.02, s * 0.16, s * 0.13, s * 0.03)
    ctx.fill()
    ctx.setLineDash([s * 0.12, s * 0.1])
  }
  ctx.setLineDash([])

  // ── 段名（左缘竖排太挤，改为每段首格旁注音省略；棋盘保持干净） ──

  return canvasToFile(canvas, px, px)
}

/** 机关格图标（程序化小图形，色随段位）。 */
function drawGlyph(ctx: CanvasRenderingContext2D, type: CellType, cx: number, cy: number, s: number, color: string, def: { to?: number }): void {
  const c = s * 0.19 // 图标半径基准
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(1.5, s * 0.05)
  ctx.lineCap = 'round'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  switch (type) {
    case 'leaf': {
      // 三瓣枫叶
      for (const a of [-2.4, -Math.PI / 2, -0.7]) {
        ctx.beginPath()
        ctx.moveTo(cx, cy + c * 0.5)
        ctx.quadraticCurveTo(cx + Math.cos(a) * c * 1.4, cy + Math.sin(a) * c * 1.4, cx + Math.cos(a) * c * 0.9, cy + Math.sin(a) * c * 0.9)
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.5) * c * 0.6, cy + Math.sin(a + 0.5) * c * 0.6, cx, cy + c * 0.5)
        ctx.fill()
      }
      break
    }
    case 'spring': {
      // ♨ 三段弧
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.arc(cx + i * c * 0.7, cy, c * 0.55, Math.PI * 1.15, Math.PI * 1.85)
        ctx.stroke()
      }
      break
    }
    case 'ladder': {
      // 双立柱 + 横档（向上）
      const w = c * 0.9
      const h = c * 1.3
      ctx.beginPath()
      ctx.moveTo(cx - w / 2, cy + h / 2)
      ctx.lineTo(cx - w / 2 + c * 0.25, cy - h / 2)
      ctx.moveTo(cx + w / 2, cy + h / 2)
      ctx.lineTo(cx + w / 2 + c * 0.25, cy - h / 2)
      ctx.stroke()
      for (let i = 0; i < 3; i++) {
        const t = i / 2.6
        ctx.beginPath()
        ctx.moveTo(cx - w / 2 + c * 0.25 * t, cy + h / 2 - h * t)
        ctx.lineTo(cx + w / 2 + c * 0.25 * t, cy + h / 2 - h * t)
        ctx.stroke()
      }
      break
    }
    case 'cable': {
      // 吊臂 + 厢
      ctx.beginPath()
      ctx.moveTo(cx - c, cy - c * 0.4)
      ctx.lineTo(cx + c, cy - c * 0.9)
      ctx.stroke()
      ctx.beginPath()
      ctx.rect(cx + c * 0.35, cy - c * 0.8, c * 0.55, c * 0.5)
      ctx.stroke()
      break
    }
    case 'slide': {
      // 下滑弧 + 箭头
      ctx.beginPath()
      ctx.moveTo(cx - c, cy - c)
      ctx.quadraticCurveTo(cx + c * 0.6, cy - c * 0.2, cx + c * 0.2, cy + c)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + c * 0.55, cy + c * 0.45)
      ctx.lineTo(cx + c * 0.2, cy + c)
      ctx.lineTo(cx - c * 0.2, cy + c * 0.7)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'rock': {
      // 落石三角 + 动线
      ctx.beginPath()
      ctx.moveTo(cx - c * 0.8, cy + c * 0.6)
      ctx.lineTo(cx, cy - c * 0.7)
      ctx.lineTo(cx + c * 0.8, cy + c * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + c * 0.2, cy - c * 1.1)
      ctx.lineTo(cx + c * 0.6, cy - c * 1.5)
      ctx.stroke()
      break
    }
    case 'shop': {
      // 店旗
      ctx.beginPath()
      ctx.moveTo(cx - c * 0.2, cy + c)
      ctx.lineTo(cx - c * 0.2, cy - c)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - c * 0.2, cy - c)
      ctx.lineTo(cx + c, cy - c * 0.6)
      ctx.lineTo(cx - c * 0.2, cy - c * 0.2)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'supply': {
      // 补给箱 + 十字
      ctx.beginPath()
      ctx.rect(cx - c * 0.85, cy - c * 0.65, c * 1.7, c * 1.3)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy - c * 0.35)
      ctx.lineTo(cx, cy + c * 0.35)
      ctx.moveTo(cx - c * 0.4, cy)
      ctx.lineTo(cx + c * 0.4, cy)
      ctx.stroke()
      break
    }
    case 'ambush': {
      // 草丛 + 惊叹号
      ctx.beginPath()
      ctx.arc(cx, cy + c * 0.5, c * 0.95, Math.PI, 0)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx, cy - c)
      ctx.lineTo(cx, cy - c * 0.25)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy + c * 0.15, Math.max(1, s * 0.035), 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'fate': {
      // 双向换位箭头
      ctx.beginPath()
      ctx.moveTo(cx - c, cy - c * 0.35)
      ctx.lineTo(cx + c * 0.6, cy - c * 0.35)
      ctx.moveTo(cx + c * 0.25, cy - c * 0.7)
      ctx.lineTo(cx + c * 0.7, cy - c * 0.35)
      ctx.lineTo(cx + c * 0.25, cy)
      ctx.moveTo(cx + c, cy + c * 0.35)
      ctx.lineTo(cx - c * 0.6, cy + c * 0.35)
      ctx.moveTo(cx - c * 0.25, cy + c * 0.7)
      ctx.lineTo(cx - c * 0.7, cy + c * 0.35)
      ctx.lineTo(cx - c * 0.25, cy)
      ctx.stroke()
      break
    }
    case 'shrine': {
      // 鸟居（山神小屋）
      ctx.beginPath()
      ctx.moveTo(cx - c, cy - c * 0.35)
      ctx.lineTo(cx + c, cy - c * 0.35)
      ctx.moveTo(cx - c * 0.7, cy - c * 0.05)
      ctx.lineTo(cx + c * 0.7, cy - c * 0.05)
      ctx.moveTo(cx - c * 0.65, cy - c * 0.3)
      ctx.lineTo(cx - c * 0.65, cy + c)
      ctx.moveTo(cx + c * 0.65, cy - c * 0.3)
      ctx.lineTo(cx + c * 0.65, cy + c)
      ctx.stroke()
      break
    }
    case 'arena': {
      // 交叉双剑
      ctx.beginPath()
      ctx.moveTo(cx - c, cy - c)
      ctx.lineTo(cx + c * 0.7, cy + c * 0.7)
      ctx.moveTo(cx + c, cy - c)
      ctx.lineTo(cx - c * 0.7, cy + c * 0.7)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx - c * 0.85, cy + c * 0.85, c * 0.25, 0, Math.PI * 2)
      ctx.arc(cx + c * 0.85, cy + c * 0.85, c * 0.25, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'avalanche': {
      // 雪崩坡
      ctx.beginPath()
      ctx.moveTo(cx - c, cy + c * 0.7)
      ctx.lineTo(cx - c * 0.1, cy - c * 0.8)
      ctx.lineTo(cx + c, cy + c * 0.7)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx + c * 0.15, cy + c * 0.05, c * 0.16, 0, Math.PI * 2)
      ctx.arc(cx + c * 0.5, cy + c * 0.35, c * 0.13, 0, Math.PI * 2)
      ctx.arc(cx - c * 0.25, cy + c * 0.4, c * 0.11, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'fork': {
      // 分岔箭头
      ctx.beginPath()
      ctx.moveTo(cx - c, cy + c * 0.7)
      ctx.lineTo(cx, cy - c * 0.1)
      ctx.moveTo(cx, cy - c * 0.1)
      ctx.lineTo(cx + c * 0.85, cy - c * 0.9)
      ctx.moveTo(cx, cy - c * 0.1)
      ctx.lineTo(cx - c * 0.35, cy - c)
      ctx.stroke()
      break
    }
    default:
      break
  }
  void def
}

/** 营地帐篷。 */
function drawTent(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy + r * 0.75)
  ctx.lineTo(cx - r, cy + r * 0.75)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = BOARD_BG
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.15)
  ctx.lineTo(cx + r * 0.32, cy + r * 0.75)
  ctx.lineTo(cx - r * 0.32, cy + r * 0.75)
  ctx.closePath()
  ctx.fill()
}

/** 枫顶雪峰 + 枫叶旗。 */
function drawPeak(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#8FA9C4'
  ctx.beginPath()
  ctx.moveTo(cx - r, cy + r * 0.7)
  ctx.lineTo(cx, cy - r * 0.7)
  ctx.lineTo(cx + r, cy + r * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.28, cy - r * 0.06)
  ctx.lineTo(cx, cy - r * 0.7)
  ctx.lineTo(cx + r * 0.28, cy - r * 0.06)
  ctx.lineTo(cx + r * 0.1, cy + r * 0.08)
  ctx.lineTo(cx - r * 0.1, cy - r * 0.04)
  ctx.closePath()
  ctx.fill()
  // 旗杆 + 枫叶旗
  ctx.strokeStyle = BOARD_INK
  ctx.lineWidth = Math.max(1, r * 0.09)
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.7)
  ctx.lineTo(cx, cy - r * 1.25)
  ctx.stroke()
  ctx.fillStyle = MAPLE
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 1.25)
  ctx.lineTo(cx + r * 0.8, cy - r * 1.05)
  ctx.lineTo(cx, cy - r * 0.85)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(cx, cy + r * 0.35, r * 0.14, 0, Math.PI * 2)
  ctx.fill()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** 营地集合（页面画“存档点”角标用）。 */
export { CAMPS, isCamp }
