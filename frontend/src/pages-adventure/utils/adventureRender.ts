/**
 * 枫趣冒险棋盘离屏渲染：程序化 canvas 画一次 → 临时图片模块级缓存（照 ludoRender/unoCards 模式）。
 * 10×10 蛇形山道：五段色带 + 机关格图标 + 缆车虚线 + 营地/枫顶特殊绘制，全程序化零外部素材。
 * 几何与机关定义全部来自 adventureBoard.ts（唯一真相，与后端双份同步）。
 * 山脚起点（pos=0）在棋盘底边下方，由页面层留白容纳，画布本身保持正方形。
 */
import { canvasToFile, createDrawingCanvas } from '../../utils/canvasAdapter'
import { CELLS, cellToPoint, type CellType } from './adventureBoard'

/** 品牌底色（奶油白/墨绿/枫叶红/金黄，同枫趣牌局色板）。 */
const BOARD_BG = '#FFF8ED'
const BOARD_INK = '#21483D'
const MAPLE = '#E85D4A'
const GOLD = '#F4B942'

/**
 * 机关格语义三族（降低视觉噪音的关键：11 种底色 → 3 种语义色）。
 * 前进=绿族 / 后退·危险=暖红族 / 功能·选择=金黄族；营地与登顶格单独强调。
 */
const FAMILY_FORWARD = '#DCEEDD' // 云梯/缆车/枫叶/温泉（前进与收益）
const FAMILY_DANGER = '#F6DDD3' // 滑坡/落石/雪崩/埋伏/擂台（后退与冲突）
const FAMILY_CHOICE = '#F8ECC8' // 商店/补给/山神/命运/岔路（功能与选择）

const CELL_TINT: Partial<Record<CellType, string>> = {
  leaf: FAMILY_FORWARD,
  spring: FAMILY_FORWARD,
  ladder: FAMILY_FORWARD,
  cable: FAMILY_FORWARD,
  slide: FAMILY_DANGER,
  rock: FAMILY_DANGER,
  avalanche: FAMILY_DANGER,
  ambush: FAMILY_DANGER,
  arena: FAMILY_DANGER,
  shop: FAMILY_CHOICE,
  supply: FAMILY_CHOICE,
  shrine: FAMILY_CHOICE,
  fate: FAMILY_CHOICE,
  fork: FAMILY_CHOICE,
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

  // ── 山道路径本体：蛇形连线穿过 1..goal 格心（一眼看懂路线的关键） ──
  ctx.strokeStyle = 'rgba(33, 72, 61, 0.22)'
  ctx.lineWidth = Math.max(2, s * 0.07)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let n = 1; n <= goal; n++) {
    const [x, y] = pt(n)
    if (n === 1) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // ── 100 格 ──
  for (let n = 1; n <= 100; n++) {
    const [cx, cy] = pt(n)
    const x = cx - s / 2
    const y = cy - s / 2
    const margin = s * 0.07
    const def = CELLS[n]
    const type = def?.type ?? 'plain'

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
      // 营地：存档点，最醒目的一档（帐篷 + 数字）
      ctx.fillStyle = '#CFE3C2'
      roundRect(ctx, x + margin * 0.5, y + margin * 0.5, s - margin, s - margin, s * 0.22)
      ctx.fill()
      ctx.strokeStyle = '#4E7A3A'
      ctx.lineWidth = Math.max(2, s * 0.06)
      ctx.stroke()
      drawTent(ctx, cx, cy + s * 0.12, s * 0.32, '#4E7A3A')
      ctx.fillStyle = '#2E5B24'
      ctx.font = `bold ${Math.round(s * 0.24)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(n), cx, y + s - margin)
    } else if (n === goal) {
      // 登顶格（枫顶/短局终点）：三角峰 + 旗帜
      ctx.fillStyle = '#CFE0F0'
      roundRect(ctx, x + margin * 0.5, y + margin * 0.5, s - margin, s - margin, s * 0.22)
      ctx.fill()
      ctx.strokeStyle = '#3A5A7E'
      ctx.lineWidth = Math.max(2, s * 0.06)
      ctx.stroke()
      drawPeak(ctx, cx, cy + s * 0.06, s * 0.36)
      ctx.fillStyle = '#3A5A7E'
      ctx.font = `bold ${Math.round(s * 0.24)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(n), cx, y + s - margin)
    } else if (type !== 'plain') {
      // 机关格：语义族底色 + 图标（无描边——路线连线已提供结构感）
      ctx.fillStyle = CELL_TINT[type] ?? FAMILY_CHOICE
      roundRect(ctx, x + margin, y + margin, s - margin * 2, s - margin * 2, s * 0.18)
      ctx.fill()
      drawGlyph(ctx, type, cx, cy, s * 0.92, '#3C4A44', def)
      // 岔路格标目标格号，帮助决策
      if (type === 'fork' && def?.options) {
        const jump = def.options.find((o) => o.to !== null)
        if (jump) {
          ctx.fillStyle = 'rgba(33,72,61,0.75)'
          ctx.font = `bold ${Math.round(s * 0.2)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`→${jump.to}`, cx, y + s - margin * 0.8)
        }
      }
    }
    // 普通格：只铺路线底（无格号——每 10 一个里程碑数字，见下）

    // 里程碑数字：仅整十格（10/20/…/100），粗体居底
    if (n % 10 === 0 && type !== 'camp' && n !== goal) {
      ctx.fillStyle = 'rgba(33,72,61,0.5)'
      ctx.font = `bold ${Math.round(s * 0.26)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(n), cx, y + s - margin * 0.6)
    }
  }

  // ── 缆车线：极淡弧线提示长跳转（不再画车厢，只留一条线索） ──
  ctx.strokeStyle = 'rgba(74,127,181,0.25)'
  ctx.lineWidth = Math.max(1.5, s * 0.04)
  ctx.setLineDash([s * 0.1, s * 0.14])
  for (const from of [14, 38, 62]) {
    const to = CELLS[from]?.to
    if (!to || to > goal) continue
    const [x1, y1] = pt(from)
    const [x2, y2] = pt(to)
    const lift = Math.min(y1, y2) - s * 0.45
    ctx.beginPath()
    ctx.moveTo(x1, y1 - s * 0.18)
    ctx.quadraticCurveTo((x1 + x2) / 2, lift, x2, y2 - s * 0.18)
    ctx.stroke()
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

