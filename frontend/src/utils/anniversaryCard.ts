import type { AnniversaryEvent, AnniversaryMilestone, AnniversaryOccurrence } from '@/types/anniversary'
import { computeOccurrence, defaultCopyForEvent, eventDateLabel, nextMilestoneForEvent } from '@/utils/anniversary'
import { loadDrawableImage } from '@/utils/canvasAdapter'

interface CardTone {
  bg: string
  card: string
  text: string
  muted: string
  primary: string
  soft: string
  line: string
}

interface RenderState {
  canvas: any
  ctx: CanvasRenderingContext2D
  event: AnniversaryEvent
  occurrence: AnniversaryOccurrence
  milestone: AnniversaryMilestone | null
  copy: string
  tone: CardTone
  width: number
  height: number
}

const TONES: Record<string, CardTone> = {
  warm: { bg: '#fff8f0', card: '#fef9f4', text: '#4a3f35', muted: '#9b8d80', primary: '#c8956c', soft: '#f3e3d3', line: '#ead8c7' },
  fresh: { bg: '#eef8f5', card: '#f5fbf8', text: '#25423c', muted: '#70877f', primary: '#4a9a83', soft: '#d8eee7', line: '#c7ddd6' },
  classic: { bg: '#f6f3ee', card: '#faf8f4', text: '#303030', muted: '#74706a', primary: '#66635d', soft: '#e8e2da', line: '#d5cec4' },
  rose: { bg: '#fff3f4', card: '#fef8f8', text: '#54363b', muted: '#9b7379', primary: '#c87582', soft: '#f3d8dc', line: '#e7c5ca' },
  ink: { bg: '#f7f7f4', card: '#f9faf7', text: '#26302d', muted: '#71807a', primary: '#50645e', soft: '#dfe7e3', line: '#cfd8d3' },
}

/** Derive a photo-background-friendly tone: white text, subtle panels, keeps the accent color. */
function photoTone(base: CardTone): CardTone {
  return {
    bg: 'transparent',
    card: 'rgba(255,255,255,0.08)',
    text: '#ffffff',
    muted: 'rgba(255,255,255,0.65)',
    primary: base.primary,
    soft: 'rgba(255,255,255,0.06)',
    line: 'rgba(255,255,255,0.18)',
  }
}

function softCoverTone(base: CardTone): CardTone {
  return {
    ...base,
    card: 'rgba(255,255,255,0.76)',
    soft: 'rgba(255,255,255,0.5)',
    line: 'rgba(255,255,255,0.42)',
  }
}

/** Draw the user's photo as a full-card background with a dark gradient overlay for readability. Returns true if a photo was drawn. */
async function drawPhotoBackground(state: RenderState): Promise<boolean> {
  const { ctx, canvas, event, width, height } = state
  if (!event.coverImage) return false

  const image = await loadDrawableImage(canvas, event.coverImage)
  if (!image) return false

  ctx.save()
  // Cover-fit the image to fill the canvas
  const sourceWidth = Number((image as { width?: number }).width ?? width)
  const sourceHeight = Number((image as { height?: number }).height ?? height)
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const sw = width / scale
  const sh = height / scale
  const sx = (sourceWidth - sw) / 2
  const sy = (sourceHeight - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)

  // Soft gradient overlay: keeps photo text readable without turning the whole card dark.
  const gradient = ctx.createLinearGradient(0, height * 0.2, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0.08)')
  gradient.addColorStop(0.48, 'rgba(0,0,0,0.22)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // Enable text shadow for all subsequent draws
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 2

  return true
}

async function drawSoftCoverBackground(state: RenderState, baseTone: CardTone): Promise<boolean> {
  const { ctx, canvas, event, width, height } = state
  if (!event.coverImage) return false
  const image = await loadDrawableImage(canvas, event.coverImage)
  if (!image) return false

  ctx.save()
  drawImageCover(ctx, image, 0, 0, width, height)
  ctx.fillStyle = baseTone.bg
  ctx.globalAlpha = 0.38
  ctx.fillRect(0, 0, width, height)
  ctx.globalAlpha = 1
  ctx.restore()
  return true
}

export async function renderAnniversaryCard(
  canvas: any,
  ctx: CanvasRenderingContext2D,
  event: AnniversaryEvent,
  width = 1080,
  height = 1440,
): Promise<void> {
  const occurrence = computeOccurrence(event)
  const milestone = nextMilestoneForEvent(event)
  const baseTone = TONES[event.cardTone] ?? TONES.warm
  const state: RenderState = {
    canvas,
    ctx,
    event,
    occurrence,
    milestone,
    copy: defaultCopyForEvent(event, occurrence),
    tone: baseTone,
    width,
    height,
  }
  ctx.clearRect(0, 0, width, height)

  // Only the photo template uses the user's image as full-card background.
  const hasPhotoBg = event.cardTemplate === 'photo' ? await drawPhotoBackground(state) : false

  if (!hasPhotoBg) {
    ctx.fillStyle = state.tone.bg
    ctx.fillRect(0, 0, width, height)
    const hasSoftCover = event.coverImage ? await drawSoftCoverBackground(state, baseTone) : false
    if (hasSoftCover) {
      state.tone = softCoverTone(baseTone)
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  } else {
    state.tone = photoTone(baseTone)
  }

  if (event.cardTemplate === 'calendar') drawCalendarCard(state)
  else if (event.cardTemplate === 'photo') await drawPhotoCard(state, hasPhotoBg)
  else if (event.cardTemplate === 'boarding') drawBoardingCard(state)
  else if (event.cardTemplate === 'certificate') drawCertificateCard(state)
  else if (event.cardTemplate === 'progress') drawProgressCard(state)
  else if (event.cardTemplate === 'festival') drawFestivalCard(state)
  else drawMinimalCard(state)
}

function drawMinimalCard(state: RenderState): void {
  const { ctx, tone } = state
  drawPanel(state, 86, 110, 908, 1220, 52)

  // Geometric accent — thin vertical line creating an asymmetric layout
  ctx.strokeStyle = tone.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(270, 180)
  ctx.lineTo(270, 1190)
  ctx.stroke()

  // Horizontal hairline below header area
  ctx.beginPath()
  ctx.moveTo(144, 280)
  ctx.lineTo(270, 280)
  ctx.stroke()

  drawLabel(ctx, '时光纪念卡', 144, 190, tone)
  drawBigNumber(state, 144, 520)
  drawTitleBlock(state, 144, 760)
  drawFooter(state)
}

function drawCalendarCard(state: RenderState): void {
  const { ctx, event, tone } = state
  drawPanel(state, 86, 110, 908, 1220, 44)
  const date = state.occurrence.date.split('-')
  const [year, month, day] = date.map(Number)
  roundedRect(ctx, 176, 190, 360, 420, 34, tone.card)
  ctx.fillStyle = tone.primary
  roundTopRect(ctx, 176, 190, 360, 110, 34)
  ctx.fillStyle = '#ffffff'
  setFont(ctx, 44, 500)
  ctx.fillText(`${date[0]}.${date[1]}`, 252, 258)
  ctx.fillStyle = tone.text
  setFont(ctx, 176, 500)
  ctx.fillText(date[2], 246, 478)
  drawLabel(ctx, event.repeatType === 'yearly' ? '每年重复' : '重要日子', 600, 214, tone)

  // Mini calendar grid right of the date block
  drawMiniCalendar(ctx, year, month, day, 600, 276, tone)

  drawTitleBlock(state, 144, 735)
  drawFooter(state)
}

/** Draw a compact 7-column month calendar grid, highlighting the event day. */
function drawMiniCalendar(
  ctx: CanvasRenderingContext2D,
  year: number,
  month: number,
  eventDay: number,
  x: number,
  y: number,
  tone: CardTone,
): void {
  const firstDay = new Date(year, month - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const cellW = 44
  const cellH = 36
  const headers = ['日', '一', '二', '三', '四', '五', '六']

  setFont(ctx, 22, 400)
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = tone.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(headers[i], x + i * cellW + cellW / 2, y)
  }

  setFont(ctx, 24, 500)
  let d = 1
  for (let row = 0; row < 6 && d <= daysInMonth; row++) {
    for (let col = 0; col < 7 && d <= daysInMonth; col++) {
      if (row === 0 && col < firstDay) continue
      const cx = x + col * cellW + cellW / 2
      const cy = y + 20 + row * cellH + cellH / 2

      if (d === eventDay) {
        roundedRect(ctx, cx - cellW / 2 + 3, cy - cellH / 2 + 2, cellW - 6, cellH - 4, 8, tone.primary)
        ctx.fillStyle = '#ffffff'
      } else if (d === new Date().getDate() && month === new Date().getMonth() + 1 && year === new Date().getFullYear()) {
        // subtle dot for today
        ctx.fillStyle = tone.text
      } else {
        ctx.fillStyle = tone.muted
      }
      ctx.fillText(String(d), cx, cy + 1)
      d++
    }
  }

  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

async function drawPhotoCard(state: RenderState, hasPhotoBg = false): Promise<void> {
  const { ctx, canvas, event, tone } = state
  drawPanel(state, 70, 86, 940, 1268, 38)

  if (hasPhotoBg) {
    // Photo is already full-canvas background — just leave some breathing room
  } else {
    // Polaroid-style framed photo
    const px = 140, py = 130, pw = 800, ph = 540
    const bottomPad = 56 // extra white margin at bottom like real polaroid

    // White polaroid card
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 8
    roundedRect(ctx, px, py, pw, ph + bottomPad, 12, '#ffffff')
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Image area within polaroid
    const image = await loadDrawableImage(canvas, event.coverImage)
    if (image) {
      ctx.save()
      roundedClip(ctx, px + 16, py + 16, pw - 32, ph - 56, 4)
      drawImageCover(ctx, image, px + 16, py + 16, pw - 32, ph - 56)
      ctx.restore()
    } else {
      ctx.fillStyle = tone.soft
      roundedRect(ctx, px + 16, py + 16, pw - 32, ph - 56, 4, tone.soft)
      ctx.fillStyle = tone.muted
      setFont(ctx, 32, 400)
      ctx.textAlign = 'center'
      ctx.fillText('添加一张照片', px + pw / 2, py + ph / 2)
      ctx.textAlign = 'start'
    }
  }

  const topY = hasPhotoBg ? 800 : 880
  drawBigNumber(state, 144, topY)
  drawTitleBlock(state, 144, topY + 190)
  drawFooter(state)
}

function drawBoardingCard(state: RenderState): void {
  const { ctx, tone, event } = state
  roundedRect(ctx, 74, 180, 932, 980, 44, tone.card)
  ctx.fillStyle = tone.soft
  ctx.fillRect(722, 180, 284, 980)
  ctx.setLineDash([18, 18])
  ctx.strokeStyle = tone.line
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(722, 220)
  ctx.lineTo(722, 1120)
  ctx.stroke()
  ctx.setLineDash([])
  drawLabel(ctx, 'BOARDING DAY', 132, 260, tone)
  drawBigNumber(state, 132, 540)
  drawTitleBlock(state, 132, 790)

  // Right sidebar — flight details
  setFont(ctx, 34, 500)
  ctx.fillStyle = tone.text
  ctx.fillText('FROM', 774, 340)
  ctx.fillText('TO', 774, 520)
  ctx.fillText('DATE', 774, 700)
  ctx.fillText('SEAT', 774, 850)
  setFont(ctx, 56, 500)
  ctx.fillText('SHA', 774, 410)
  ctx.fillText('HGH', 774, 590)
  setFont(ctx, 30, 400)
  ctx.fillStyle = tone.muted
  const [y, m, d] = eventDateLabel(event).split(/[.\s]+/)
  ctx.fillText(`${m || ''}${d || eventDateLabel(event)}`, 774, 756)

  // Seat — decorative random-ish code
  setFont(ctx, 36, 500)
  ctx.fillStyle = tone.text
  ctx.fillText(`${String.fromCharCode(65 + (event.id ?? 1) % 26)}${(event.id ?? 1) % 30 + 1}`, 774, 910)

  // Barcode texture at bottom of sidebar
  drawBarcode(ctx, 748, 960, 232, 80, tone)

  drawFooter(state)
}

/** Draw a barcode-like texture of vertical bars. */
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: CardTone): void {
  ctx.fillStyle = tone.text
  ctx.globalAlpha = 0.25
  const gaps = [3, 4, 5, 6, 8, 2, 4, 7, 3, 5, 6, 2, 4, 3, 8, 5, 3, 7, 4, 6, 3, 5, 2, 4, 8, 3, 6, 4, 5, 3]
  let cx = x
  for (const gap of gaps) {
    const barH = h * (0.55 + (gap / 10) * 0.45)
    ctx.fillRect(cx, y + h - barH, gap - 1, barH)
    cx += gap + 2
  }
  ctx.globalAlpha = 1
}

function drawCertificateCard(state: RenderState): void {
  const { ctx, tone } = state
  drawPanel(state, 72, 96, 936, 1248, 28)
  ctx.strokeStyle = tone.primary
  ctx.lineWidth = 6
  roundedStroke(ctx, 124, 148, 832, 1144, 24)
  ctx.strokeStyle = tone.line
  ctx.lineWidth = 2
  roundedStroke(ctx, 150, 174, 780, 1092, 18)
  drawLabel(ctx, '纪念证书', 408, 260, tone)
  drawBigNumber(state, 174, 610)
  drawTitleBlock(state, 174, 850)

  // Red stamp seal — bottom-right, slightly rotated
  drawStampSeal(ctx, 750, 1080, 68, tone)

  drawFooter(state)
}

/** Draw a red circular stamp seal with "纪" character, rotated for realism. */
function drawStampSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, tone: CardTone): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-16 * Math.PI / 180)

  // Outer ring
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#c0392b'
  ctx.lineWidth = 5
  ctx.stroke()

  // Inner ring
  ctx.beginPath()
  ctx.arc(0, 0, radius - 12, 0, Math.PI * 2)
  ctx.strokeStyle = '#c0392b'
  ctx.lineWidth = 2
  ctx.stroke()

  // "纪" character centered
  setFont(ctx, 48, 700)
  ctx.fillStyle = '#c0392b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('纪', 0, 2)
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'

  ctx.restore()
}

function drawProgressCard(state: RenderState): void {
  const { ctx, tone, milestone } = state
  drawPanel(state, 86, 110, 908, 1220, 48)
  drawLabel(ctx, '进度记录', 144, 190, tone)
  drawBigNumber(state, 144, 520)
  drawTitleBlock(state, 144, 700)

  const progress = milestone
    ? Math.max(0.05, Math.min(1, (milestone.targetDays - milestone.remainingDays) / milestone.targetDays))
    : 1

  // Circular progress ring
  const cx = 540
  const cy = 1000
  const ringRadius = 74
  const ringWidth = 18

  ctx.beginPath()
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
  ctx.strokeStyle = tone.soft
  ctx.lineWidth = ringWidth
  ctx.lineCap = 'round'
  ctx.stroke()

  const startAngle = -Math.PI / 2
  const endAngle = startAngle + Math.PI * 2 * progress
  ctx.beginPath()
  ctx.arc(cx, cy, ringRadius, startAngle, endAngle)
  ctx.strokeStyle = tone.primary
  ctx.lineWidth = ringWidth
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Percentage in center
  setFont(ctx, 36, 500)
  ctx.fillStyle = tone.primary
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(progress * 100)}%`, cx, cy)
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'

  // Milestone label below ring
  setFont(ctx, 30, 400)
  ctx.fillStyle = tone.muted
  ctx.textAlign = 'center'
  ctx.fillText(milestone ? `${milestone.remainingDays} 天后到 ${milestone.label}` : '每一天都算数', cx, cy + ringRadius + 50)
  ctx.textAlign = 'start'

  drawFooter(state)
}

function drawFestivalCard(state: RenderState): void {
  const { ctx, tone } = state
  drawPanel(state, 86, 110, 908, 1220, 56)
  ctx.fillStyle = tone.soft
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(822, 276, 132, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Decorative stars scattered in upper area
  const stars: Array<[number, number, number]> = [
    [720, 380, 22], [880, 310, 14], [200, 350, 18],
    [840, 500, 16], [300, 440, 12], [900, 430, 20],
  ]
  for (const [sx, sy, sr] of stars) {
    drawStar(ctx, sx, sy, sr, sr * 0.42, 5, tone.primary)
  }

  // Small dot confetti
  const dots: Array<[number, number, number]> = [
    [760, 340, 6], [850, 470, 4], [240, 390, 5],
    [910, 360, 5], [180, 420, 4], [820, 420, 7],
  ]
  ctx.fillStyle = tone.primary
  ctx.globalAlpha = 0.5
  for (const [dx, dy, dr] of dots) {
    ctx.beginPath()
    ctx.arc(dx, dy, dr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  drawLabel(ctx, '今天值得被记住', 144, 210, tone)
  drawBigNumber(state, 144, 590)
  drawTitleBlock(state, 144, 850)
  drawFooter(state)
}

/** Draw a 5-pointed star centered at (cx, cy). */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number, points: number, fill: string): void {
  ctx.save()
  ctx.fillStyle = fill
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (i * Math.PI) / points - Math.PI / 2
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawPanel(state: RenderState, x: number, y: number, w: number, h: number, r: number): void {
  roundedRect(state.ctx, x, y, w, h, r, state.tone.card)
}

function drawBigNumber(state: RenderState, x: number, y: number): void {
  const { ctx, occurrence, event, tone } = state
  const notStarted = event.countMode === 'countup' && occurrence.elapsedDays === 0
  const value = notStarted
    ? Math.max(0, occurrence.daysUntil)
    : event.countMode === 'countup'
      ? occurrence.elapsedDays
      : Math.max(0, occurrence.daysUntil)
  setFont(ctx, 188, 500)
  ctx.fillStyle = tone.text
  ctx.fillText(String(value), x, y)
  setFont(ctx, 42, 400)
  ctx.fillStyle = tone.muted
  const unit = notStarted
    ? '天后出发'
    : event.countMode === 'countup'
      ? '天'
      : occurrence.daysUntil === 0 ? '今天' : '天'
  ctx.fillText(unit, x + measureText(ctx, String(value)) + 18, y - 12)
}

function drawTitleBlock(state: RenderState, x: number, y: number): void {
  const { ctx, event, occurrence, tone, copy } = state
  setFont(ctx, 58, 500)
  ctx.fillStyle = tone.text
  wrapText(ctx, event.title, x, y, 760, 72, 2)
  setFont(ctx, 34, 400)
  ctx.fillStyle = tone.muted
  ctx.fillText(occurrence.detail, x, y + 140)
  setFont(ctx, 34, 400)
  wrapText(ctx, copy, x, y + 214, 760, 46, 2)
}

function drawFooter(state: RenderState): void {
  const { ctx, event, tone, height } = state
  ctx.strokeStyle = tone.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(144, height - 190)
  ctx.lineTo(936, height - 190)
  ctx.stroke()
  setFont(ctx, 30, 400)
  ctx.fillStyle = tone.muted
  ctx.fillText(eventDateLabel(event), 144, height - 120)
  ctx.fillText('枫叶小屋 · 时光纪念卡', 604, height - 120)
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tone: CardTone): void {
  setFont(ctx, 32, 500)
  const width = measureText(ctx, text) + 44
  roundedRect(ctx, x, y - 38, width, 58, 29, tone.soft)
  ctx.fillStyle = tone.primary
  ctx.fillText(text, x + 22, y)
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.beginPath()
  roundedPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function roundedStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  roundedPath(ctx, x, y, w, h, r)
  ctx.stroke()
}

function roundedClip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  roundedPath(ctx, x, y, w, h, r)
  ctx.clip()
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function roundTopRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fill()
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const sourceWidth = Number((image as { width?: number }).width ?? w)
  const sourceHeight = Number((image as { height?: number }).height ?? h)
  const scale = Math.max(w / sourceWidth, h / sourceHeight)
  const sw = w / scale
  const sh = h / scale
  const sx = (sourceWidth - sw) / 2
  const sy = (sourceHeight - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
  let line = ''
  let lines = 0
  for (const char of text) {
    const test = line + char
    if (measureText(ctx, test) > maxWidth && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}…` : line, x, y + lines * lineHeight)
      lines += 1
      line = char
      if (lines >= maxLines) return
    } else {
      line = test
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight)
  }
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: 400 | 500 | 700): void {
  ctx.font = `${weight} ${size}px sans-serif`
  ctx.textBaseline = 'alphabetic'
}

function measureText(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width
}
