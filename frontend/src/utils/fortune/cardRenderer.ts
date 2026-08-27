/**
 * 每日灵签分享卡渲染器：1080×1440（3:4 小红书卡），纯程序化绘制（无外部图片素材）。
 *
 * 布局：签种横幅 → 签纸（签号+题+印章+竖排签诗+总断）→ 开运金句 → 落款。
 * 答案之书变体：无签诗，答案大字居中。
 * 上上签：卡面加描金外框（刺激分享欲）。
 *
 * 复用约定来自 utils/anniversaryCard.ts：页面隐藏 <canvas type="2d"> →
 * getCanvasNode → 渲染 → canvasToFile → canvas.width=1 释放内存。
 */
import type { FortuneStick } from '@/types/fortune'
import { isTopStick, levelSeal, type DeckTheme } from './theme'

export interface FortuneCardPayload {
  deck: DeckTheme
  stick: FortuneStick
  categoryName: string
  question?: string | null
  /** AI 解签的开运小贴士（未解签时为空） */
  luckyHint?: string
  /** 出签日期（YYYY-MM-DD） */
  date: string
}

const W = 1080
const H = 1440
const SERIF = '"Songti SC", "STSong", serif'

export async function renderFortuneCard(
  canvas: unknown,
  ctx: CanvasRenderingContext2D,
  payload: FortuneCardPayload,
  width = W,
  height = H,
): Promise<void> {
  const { deck, stick } = payload
  const s = width / W // 尺寸缩放系数（导出固定 1080×1440，恒为 1；留参数与纪念卡一致）

  drawBackground(ctx, deck, width, height)
  drawFrame(ctx, deck, width, height, isTopStick(stick.level))
  drawBanner(ctx, deck, payload, width)
  if (deck.key === 'book') {
    drawBookBody(ctx, deck, payload, width)
  } else {
    drawStickBody(ctx, deck, payload, width)
  }
  drawLuckyHint(ctx, deck, payload, width, height)
  drawFooter(ctx, deck, payload, width, height)
  void canvas
  void s
}

/** 纸色底 + 四角淡淡的主色晕染，营造宣纸质感。 */
function drawBackground(ctx: CanvasRenderingContext2D, deck: DeckTheme, w: number, h: number): void {
  ctx.fillStyle = deck.paper
  ctx.fillRect(0, 0, w, h)

  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 80, w / 2, h * 0.42, h * 0.75)
  glow.addColorStop(0, hexWithAlpha('#FFFFFF', 0.55))
  glow.addColorStop(1, hexWithAlpha(deck.primaryDeep, 0.10))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
}

/** 双线外框；上上签额外描金。 */
function drawFrame(ctx: CanvasRenderingContext2D, deck: DeckTheme, w: number, h: number, top: boolean): void {
  ctx.save()
  ctx.strokeStyle = hexWithAlpha(deck.primaryDeep, 0.55)
  ctx.lineWidth = 4
  roundRectPath(ctx, 40, 40, w - 80, h - 80, 28)
  ctx.stroke()
  ctx.strokeStyle = hexWithAlpha(deck.primaryDeep, 0.28)
  ctx.lineWidth = 2
  roundRectPath(ctx, 58, 58, w - 116, h - 116, 20)
  ctx.stroke()
  if (top) {
    ctx.strokeStyle = '#C9A227'
    ctx.lineWidth = 8
    roundRectPath(ctx, 30, 30, w - 60, h - 60, 34)
    ctx.stroke()
  }
  ctx.restore()
}

/** 顶部：签种名 + 问事分类 pill。 */
function drawBanner(ctx: CanvasRenderingContext2D, deck: DeckTheme, payload: FortuneCardPayload, w: number): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = deck.primaryDeep
  ctx.font = `600 64px ${SERIF}`
  ctx.fillText(deck.name, w / 2, 168)

  const label = payload.categoryName ? `所问 · ${payload.categoryName}` : '每日灵签'
  ctx.font = `30px ${SERIF}`
  const tw = ctx.measureText(label).width
  const pw = tw + 64
  ctx.fillStyle = hexWithAlpha(deck.primary, 0.14)
  roundRectPath(ctx, (w - pw) / 2, 206, pw, 56, 28)
  ctx.fill()
  ctx.fillStyle = deck.primary
  ctx.fillText(label, w / 2, 246)
  ctx.restore()
}

/** 灵签卡面主体：签纸 + 印章 + 竖排签诗 + 总断。 */
function drawStickBody(ctx: CanvasRenderingContext2D, deck: DeckTheme, payload: FortuneCardPayload, w: number): void {
  const { stick } = payload
  const paperX = 110
  const paperW = w - 220
  const paperY = 300
  const paperH = 780

  // 签纸
  ctx.save()
  ctx.fillStyle = '#FFFDF6'
  ctx.shadowColor = 'rgba(0,0,0,0.10)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  roundRectPath(ctx, paperX, paperY, paperW, paperH, 20)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = hexWithAlpha(deck.primaryDeep, 0.35)
  ctx.lineWidth = 3
  roundRectPath(ctx, paperX + 14, paperY + 14, paperW - 28, paperH - 28, 12)
  ctx.stroke()

  // 签号 + 签题
  ctx.textAlign = 'center'
  ctx.fillStyle = deck.ink
  ctx.font = `500 44px ${SERIF}`
  const head = stick.title ? `第${stick.no}签 · ${stick.title}` : `第${stick.no}签`
  ctx.fillText(head, w / 2, paperY + 92)

  // 签级印章（右上，轻微旋转）
  const seal = levelSeal(String(stick.level ?? ''))
  if (seal.label) {
    const sealSize = 118
    const sx = paperX + paperW - 88
    const sy = paperY + 118
    ctx.translate(sx, sy)
    ctx.rotate(-0.06)
    ctx.fillStyle = seal.color
    roundRectPath(ctx, -sealSize / 2, -sealSize / 2, sealSize, sealSize, 14)
    ctx.fill()
    ctx.strokeStyle = hexWithAlpha('#FFFFFF', 0.8)
    ctx.lineWidth = 3
    roundRectPath(ctx, -sealSize / 2 + 8, -sealSize / 2 + 8, sealSize - 16, sealSize - 16, 8)
    ctx.stroke()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `600 44px ${SERIF}`
    const chars = seal.label.replace('签', '')
    if (chars.length === 2) {
      ctx.fillText(chars[0], 0, -8)
      ctx.fillText(chars[1], 0, 40)
    } else {
      ctx.fillText(chars, 0, 16)
    }
    ctx.rotate(0.06)
    ctx.translate(-sx, -sy)
  }

  // 竖排签诗：四句从右往左四列，每列自上而下。
  const verse = (stick.verse ?? []).slice(0, 4)
  if (verse.length > 0) {
    const colGap = 96
    const charGap = 74
    const fontSize = 52
    ctx.font = `${fontSize}px ${SERIF}`
    ctx.fillStyle = deck.ink
    const totalW = (verse.length - 1) * colGap
    const startX = w / 2 + totalW / 2
    const startY = paperY + 240
    verse.forEach((line, col) => {
      const x = startX - col * colGap
      const chars = Array.from(line)
      chars.forEach((ch, row) => {
        ctx.fillText(ch, x, startY + row * charGap)
      })
    })
  }

  // 总断
  if (stick.gist) {
    ctx.font = `500 36px ${SERIF}`
    ctx.fillStyle = deck.primary
    ctx.fillText(`【 ${stick.gist} 】`, w / 2, paperY + paperH - 64)
  }
  ctx.restore()
}

/** 答案之书卡面主体：大字答案。 */
function drawBookBody(ctx: CanvasRenderingContext2D, deck: DeckTheme, payload: FortuneCardPayload, w: number): void {
  const { stick } = payload
  ctx.save()
  ctx.textAlign = 'center'

  // 书形底版
  const bx = 130
  const bw = w - 260
  const by = 320
  const bh = 700
  ctx.fillStyle = '#FFFDF6'
  ctx.shadowColor = 'rgba(0,0,0,0.12)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 10
  roundRectPath(ctx, bx, by, bw, bh, 24)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  // 书脊线
  ctx.strokeStyle = hexWithAlpha(deck.primaryDeep, 0.25)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w / 2, by + 30)
  ctx.lineTo(w / 2, by + bh - 30)
  ctx.stroke()

  // 引号
  ctx.fillStyle = hexWithAlpha(deck.accent, 0.35)
  ctx.font = `160px ${SERIF}`
  ctx.fillText('“', bx + 130, by + 210)

  // 问题（小字）+ 答案（大字，自动换行）
  if (payload.question) {
    ctx.fillStyle = hexWithAlpha(deck.ink, 0.6)
    ctx.font = `32px ${SERIF}`
    ctx.fillText(truncate(payload.question, 20), w / 2, by + 120)
  }
  ctx.fillStyle = deck.primaryDeep
  ctx.font = `600 72px ${SERIF}`
  const answer = String(stick.answer ?? '')
  wrapCentered(ctx, answer, w / 2, by + 330, bw - 220, 96, 3)

  ctx.font = `30px ${SERIF}`
  ctx.fillStyle = hexWithAlpha(deck.ink, 0.5)
  ctx.fillText(`—— 第 ${stick.no} 页 ——`, w / 2, by + bh - 70)
  ctx.restore()
}

/** 开运金句（AI 解签的 luckyHint；没有则出一句通用签语）。 */
function drawLuckyHint(ctx: CanvasRenderingContext2D, deck: DeckTheme, payload: FortuneCardPayload, w: number, h: number): void {
  const hint = payload.luckyHint?.trim() || defaultHint(payload)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = `34px ${SERIF}`
  const maxW = w - 320
  const y = h - 300
  ctx.fillStyle = deck.accent
  ctx.font = `600 34px ${SERIF}`
  ctx.fillText('✦ 开运 ✦', w / 2, y - 56)
  ctx.fillStyle = hexWithAlpha(deck.ink, 0.85)
  wrapCentered(ctx, hint, w / 2, y, maxW, 50, 2)
  ctx.restore()
}

function drawFooter(ctx: CanvasRenderingContext2D, deck: DeckTheme, payload: FortuneCardPayload, w: number, h: number): void {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = hexWithAlpha(deck.primaryDeep, 0.75)
  ctx.font = `32px ${SERIF}`
  ctx.fillText('枫叶小屋 · 每日灵签', w / 2, h - 150)
  ctx.fillStyle = hexWithAlpha(deck.ink, 0.45)
  ctx.font = `26px ${SERIF}`
  ctx.fillText(`${payload.date} 抽取 · 心诚则灵，好运分享`, w / 2, h - 104)
  ctx.restore()
}

function defaultHint(payload: FortuneCardPayload): string {
  if (payload.deck.key === 'book') return '书已给出回答，剩下的交给行动。'
  const gist = payload.stick.gist?.trim()
  return gist ? `${gist}。心诚则灵，日行一善。` : '心诚则灵，日行一善。'
}

// ---------- 基础绘制原语 ----------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text)
  return chars.length > maxChars ? chars.slice(0, maxChars - 1).join('') + '…' : text
}

/** 居中文本自动换行，最多 maxLines 行（超出截断加省略号）。 */
function wrapCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''
  for (const ch of chars) {
    if (ctx.measureText(current + ch).width > maxWidth && current !== '') {
      lines.push(current)
      current = ch
      if (lines.length === maxLines) break
    } else {
      current += ch
    }
  }
  if (lines.length < maxLines && current !== '') lines.push(current)
  if (lines.length === maxLines && chars.join('').length > lines.join('').length) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], Math.max(2, Array.from(lines[maxLines - 1]).length - 1))
  }
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight))
}
