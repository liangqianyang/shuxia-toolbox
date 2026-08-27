/** Q版 UNO 牌面渲染器：枫叶小精灵（圆叶 + 表情 + 粗描边贴纸风），全部程序化绘制、零外部图片。
 *  每种牌面（4 色 × 0-9/S/R/D + wW/wF + 牌背，共 27 张）只渲染一次到离屏 canvas，
 *  导出为临时图片后模块级缓存，页面用 <image> 引用——牌桌动画全靠 CSS，不做每帧 canvas。
 *  概念稿见 docs/uno-cards-preview.html（C 组）。
 */

import { canvasToFile, createDrawingCanvas } from '@/utils/canvasAdapter'
import { COLOR_META, cardColor, cardValue, isWild } from '@/utils/uno'
import type { UnoColor } from '@/types/uno'

/** 逻辑尺寸（渲染时乘 SCALE）。 */
const CW = 210
const CH = 315
const SCALE = 2

const PAPER = '#fdf6e8'
const INK = '#4a3b32'
const BACK_RED = '#E85D4A' // 品牌枫叶红

const SEASON_COLORS = ['#83cc90', '#f4735f', '#ffc95e', '#7ab5e3']

export const BACK_KEY = 'back'

/** 全部牌面 key：4 色 ×（0-9 + S/R/D）+ wW/wF + back。 */
export const ALL_CARD_KEYS: string[] = (() => {
  const keys: string[] = []
  for (const c of ['r', 'g', 'b', 'y']) {
    for (const v of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', 'D']) {
      keys.push(c + v)
    }
  }
  keys.push('wW', 'wF', BACK_KEY)
  return keys
})()

const imageCache = new Map<string, Promise<string>>()

/** 取某张牌面的图片地址（临时文件 / dataURL），带缓存；失败清缓存可重试。 */
export function unoCardImage(key: string): Promise<string> {
  const cached = imageCache.get(key)
  if (cached) {
    return cached
  }
  const promise = renderCardToFile(key).catch((error) => {
    imageCache.delete(key)
    throw error
  })
  imageCache.set(key, promise)
  return promise
}

/** 预加载全部牌面（进入牌桌时调用，失败不阻塞——用到时会再试）。 */
export async function preloadUnoCards(): Promise<void> {
  await Promise.allSettled(ALL_CARD_KEYS.map((key) => unoCardImage(key)))
}

async function renderCardToFile(key: string): Promise<string> {
  const { canvas, ctx } = createDrawingCanvas(CW * SCALE, CH * SCALE)
  ctx.scale(SCALE, SCALE)
  ctx.clearRect(0, 0, CW, CH)
  if (key === BACK_KEY) {
    drawBack(ctx)
  } else if (key === 'wW') {
    drawWildCandy(ctx)
  } else if (key === 'wF') {
    drawWildFour(ctx)
  } else {
    const color = cardColor(key) as UnoColor
    const value = cardValue(key)
    if (value === 'S') {
      drawSkip(ctx, color)
    } else if (value === 'R') {
      drawReverse(ctx, color)
    } else if (value === 'D') {
      drawPlus2(ctx, color)
    } else {
      drawNumber(ctx, color, value)
    }
  }
  return canvasToFile(canvas, CW * SCALE, CH * SCALE)
}

// ---------- 基础图元 ----------

function rr(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 11 角枫叶轮廓（直边国旗风坐标，blobPath 二次贝塞尔磨圆成糖感圆叶）。 */
const LEAF: Array<[number, number]> = [
  [0, -100], [12, -56], [40, -72], [34, -32], [76, -44], [50, -4], [86, 16], [30, 28],
  [18, 72], [8, 46], [10, 96], [-10, 96], [-8, 46], [-18, 72], [-30, 28], [-86, 16],
  [-50, -4], [-76, -44], [-34, -32], [-40, -72], [-12, -56],
]

function blobPath(ctx: any): void {
  const n = LEAF.length
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const m0 = mid(LEAF[n - 1], LEAF[0])
  ctx.moveTo(m0[0], m0[1])
  for (let i = 0; i < n; i++) {
    const m = mid(LEAF[i], LEAF[(i + 1) % n])
    ctx.quadraticCurveTo(LEAF[i][0], LEAF[i][1], m[0], m[1])
  }
  ctx.closePath()
}

/** 圆滚滚的 Q 版枫叶：size 为半高（叶子总高约 2×size）。 */
function drawLeafQ(ctx: any, cx: number, cy: number, size: number, rot: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.scale(size / 100, size / 100)
  ctx.beginPath()
  blobPath(ctx)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 7
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

function swirl(ctx: any, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  for (let a = 0; a < Math.PI * 3; a += 0.3) {
    const rr2 = (r * a) / (Math.PI * 3)
    const px = cx + rr2 * Math.cos(a)
    const py = cy + rr2 * Math.sin(a)
    if (a === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.stroke()
}

interface FaceOptions {
  dizzy?: boolean
  winkL?: boolean
  winkR?: boolean
  open?: boolean
}

/** 小精灵表情：豆豆眼 + 高光 + 微笑/开口 + 腮红；s 与 drawLeafQ 的 size 对应。 */
function drawFace(ctx: any, cx: number, cy: number, s: number, o: FaceOptions): void {
  const dx = s * 0.26
  const ey = cy - s * 0.14
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineCap = 'round'
  if (o.dizzy) {
    swirl(ctx, cx - dx, ey, s * 0.12)
    swirl(ctx, cx + dx, ey, s * 0.12)
  } else {
    const eyes: Array<[number, boolean | undefined]> = [[-1, o.winkL], [1, o.winkR]]
    for (const [side, wink] of eyes) {
      const x = cx + side * dx
      if (wink) {
        ctx.beginPath()
        ctx.arc(x, ey, s * 0.08, Math.PI * 1.15, Math.PI * 1.85)
        ctx.lineWidth = s * 0.05
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(x, ey, s * 0.085, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x + s * 0.03, ey - s * 0.03, s * 0.03, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = INK
      }
    }
  }
  ctx.lineWidth = s * 0.05
  if (o.open) {
    ctx.beginPath()
    ctx.arc(cx, cy + s * 0.06, s * 0.13, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.closePath()
    ctx.fillStyle = '#8a3b2e'
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy + s * 0.02, s * 0.14, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,110,120,.4)'
  ctx.beginPath()
  ctx.ellipse(cx - s * 0.46, cy + s * 0.04, s * 0.13, s * 0.075, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx + s * 0.46, cy + s * 0.04, s * 0.13, s * 0.075, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 米白牌底 + 彩点 confetti + 粗描边。 */
function drawBase(ctx: any): void {
  rr(ctx, 0, 0, CW, CH, 22)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.45
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = SEASON_COLORS[i % 4]
    ctx.beginPath()
    ctx.arc(14 + Math.random() * (CW - 28), 14 + Math.random() * (CH - 28), 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  rr(ctx, 7, 7, CW - 14, CH - 14, 16)
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  ctx.stroke()
}

/** 贴纸风文字：白色外晕 + 深色描边。 */
function stickerText(ctx: any, text: string, cx: number, cy: number, px: number, fill: string): void {
  ctx.font = `900 ${px}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = px * 0.22
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText(text, cx, cy)
  ctx.lineWidth = px * 0.09
  ctx.strokeStyle = INK
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = fill
  ctx.fillText(text, cx, cy)
}

/** 角落标记：季节圆形徽章（色盲友好文字色标）+ 数字/符号，对角各一。 */
function cornerQ(ctx: any, cx: number, cy: number, rot: number, color: UnoColor | null, label: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  if (color) {
    ctx.beginPath()
    ctx.arc(0, 0, 14, 0, Math.PI * 2)
    ctx.fillStyle = COLOR_META[color].color
    ctx.fill()
  } else {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, 14, -Math.PI / 2 + (i * Math.PI) / 2, -Math.PI / 2 + ((i + 1) * Math.PI) / 2)
      ctx.closePath()
      ctx.fillStyle = SEASON_COLORS[i]
      ctx.fill()
    }
  }
  ctx.beginPath()
  ctx.arc(0, 0, 14, 0, Math.PI * 2)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 15px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(color ? COLOR_META[color].season : '变', 0, 1)
  ctx.fillStyle = INK
  ctx.font = '900 28px sans-serif'
  ctx.fillText(label, 0, 42)
  ctx.restore()
}

function cornersQ(ctx: any, color: UnoColor | null, label: string): void {
  cornerQ(ctx, 20, 22, 0, color, label)
  cornerQ(ctx, CW - 20, CH - 22, Math.PI, color, label)
}

// ---------- 牌面 ----------

/** 数字牌：泡泡数字漂浮在上，枫叶小精灵在下。 */
function drawNumber(ctx: any, color: UnoColor, num: string): void {
  drawBase(ctx)
  const meta = COLOR_META[color]
  const cx = CW / 2
  const cy = CH / 2 + 40
  stickerText(ctx, num, cx, 62, 62, meta.deep)
  drawLeafQ(ctx, cx, cy, 92, -0.06, meta.color)
  drawFace(ctx, cx, cy, 92, {})
  cornersQ(ctx, color, num)
}

/** 跳过：眨眼的小叶子举着迷你「止」牌。 */
function drawSkip(ctx: any, color: UnoColor): void {
  drawBase(ctx)
  const cx = CW / 2
  const cy = CH / 2 - 12
  drawLeafQ(ctx, cx - 16, cy, 92, -0.1, COLOR_META[color].color)
  drawFace(ctx, cx - 16, cy, 92, { winkR: true, open: true })
  ctx.strokeStyle = INK
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx + 34, cy + 34)
  ctx.lineTo(cx + 58, cy + 58)
  ctx.stroke()
  ctx.save()
  ctx.translate(cx + 66, cy + 82)
  ctx.rotate(0.12)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4
    const px = 38 * Math.cos(a)
    const py = 38 * Math.sin(a)
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
  ctx.fillStyle = '#e84c3d'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('止', 0, 2)
  ctx.restore()
  cornersQ(ctx, color, '止')
}

/** 反转：两只晕头转向的小叶子沿虚线环互相追逐。 */
function drawReverse(ctx: any, color: UnoColor): void {
  drawBase(ctx)
  const meta = COLOR_META[color]
  const cx = CW / 2
  const cy = CH / 2
  ctx.save()
  ctx.setLineDash([11, 9])
  ctx.strokeStyle = meta.deep
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, 60, 0.35, Math.PI * 2 - 0.35)
  ctx.stroke()
  ctx.restore()
  const a1 = 0.5
  const leaves: Array<[number, string]> = [[a1, meta.color], [a1 + Math.PI, meta.deep]]
  for (const [a, col] of leaves) {
    const lx = cx + 60 * Math.cos(a)
    const ly = cy + 60 * Math.sin(a)
    drawLeafQ(ctx, lx, ly, 44, a + Math.PI / 2 + 0.55, col)
    drawFace(ctx, lx, ly, 44, { dizzy: true })
  }
  cornersQ(ctx, color, '回')
}

/** +2：大叶子背着小叶子。 */
function drawPlus2(ctx: any, color: UnoColor): void {
  drawBase(ctx)
  const meta = COLOR_META[color]
  const cx = CW / 2
  const cy = CH / 2 + 26
  stickerText(ctx, '+2', cx, 56, 52, meta.deep)
  drawLeafQ(ctx, cx - 12, cy, 84, -0.08, meta.color)
  drawFace(ctx, cx - 12, cy, 84, {})
  drawLeafQ(ctx, cx + 22, cy - 56, 52, 0.18, meta.deep)
  drawFace(ctx, cx + 22, cy - 56, 52, { open: true })
  cornersQ(ctx, color, '+2')
}

/** 变色：四季糖球，中间一张小脸。 */
function drawWildCandy(ctx: any): void {
  drawBase(ctx)
  const cx = CW / 2
  const cy = CH / 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, 72, -Math.PI / 2 + (i * Math.PI) / 2, -Math.PI / 2 + ((i + 1) * Math.PI) / 2)
    ctx.closePath()
    ctx.fillStyle = SEASON_COLORS[i]
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, 72, 0, Math.PI * 2)
  ctx.lineWidth = 5
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, 30, 0, Math.PI * 2)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.lineWidth = 3
  ctx.stroke()
  drawFace(ctx, cx, cy + 2, 36, { open: true })
  cornersQ(ctx, null, '变')
}

/** +4：四只小叶精围着 +4 蹦跳。 */
function drawWildFour(ctx: any): void {
  drawBase(ctx)
  const cx = CW / 2
  const cy = CH / 2
  const offs: Array<[number, number, number]> = [[-46, -44, -0.3], [46, -44, 0.3], [46, 44, 0.25], [-46, 44, -0.25]]
  offs.forEach(([ox, oy, rot], i) => {
    drawLeafQ(ctx, cx + ox, cy + oy, 40, rot, SEASON_COLORS[i])
    drawFace(ctx, cx + ox, cy + oy, 40, { open: i % 2 === 0 })
  })
  stickerText(ctx, '+4', cx, cy, 56, '#ffffff')
  cornersQ(ctx, null, '+4')
}

/** 牌背：珊瑚红底白波点 + 眨眼大叶脸 + 小屋。 */
function drawBack(ctx: any): void {
  rr(ctx, 0, 0, CW, CH, 22)
  ctx.fillStyle = BACK_RED
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 20; i++) {
    ctx.beginPath()
    ctx.arc(16 + Math.random() * (CW - 32), 16 + Math.random() * (CH - 32), 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  rr(ctx, 7, 7, CW - 14, CH - 14, 16)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.stroke()
  const cx = CW / 2
  drawLeafQ(ctx, cx, CH / 2 - 30, 108, -0.06, PAPER)
  drawFace(ctx, cx, CH / 2 - 30, 108, { winkR: true, open: true })
  // 小屋
  const s = 50
  const hy = CH / 2 + 92
  ctx.fillStyle = PAPER
  rr(ctx, cx - s * 0.55, hy - s * 0.1, s * 1.1, s * 0.62, s * 0.12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.68, hy - s * 0.06)
  ctx.lineTo(cx, hy - s * 0.6)
  ctx.lineTo(cx + s * 0.68, hy - s * 0.06)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(cx + s * 0.28, hy - s * 0.52, s * 0.13, s * 0.26)
  ctx.fillStyle = BACK_RED
  rr(ctx, cx - s * 0.11, hy + s * 0.12, s * 0.22, s * 0.4, s * 0.08)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - s * 0.3, hy + s * 0.12, s * 0.08, 0, Math.PI * 2)
  ctx.fill()
  stickerText(ctx, '枫叶小屋', cx, CH - 40, 26, '#ffffff')
}
