import type { Day, DayMood, Stop, Trip } from '@/types/travel'
import {
  CARD_W,
  CARD_H,
  C,
  FONT,
  roundRect,
  drawImageCover,
  drawFooter,
  truncateText,
  wrapText,
  isVisitStop,
  poiTrustLine,
} from './theme'

interface HandbookPalette {
  paper: string
  line: string
  ribbon: string
  ribbonBorder: string
  decorPrimary: string
  decorSecondary: string
  placeholderEnd: string
  placeholderAlt: string
  sectionColors: string[]
  pinColors: string[]
}

const DEFAULT_PALETTE: HandbookPalette = {
  paper: '#FBF4E6',
  line: 'rgba(158,132,96,0.12)',
  ribbon: '#E9F1D8',
  ribbonBorder: '#8AA172',
  decorPrimary: '#8DAF78',
  decorSecondary: '#D8A56E',
  placeholderEnd: '#E6F1E0',
  placeholderAlt: '#9EC7D5',
  sectionColors: ['#B9D8A9', '#F2C56B', '#C9B7E8'],
  pinColors: ['#5BA568', '#D38B28', '#7C5EB8'],
}

const MOOD_PALETTES: Record<DayMood, HandbookPalette> = {
  citywalk: DEFAULT_PALETTE,
  nature: {
    ...DEFAULT_PALETTE,
    paper: '#F4F8EA',
    ribbon: '#DDEDC8',
    ribbonBorder: '#789A62',
    decorPrimary: '#6F9D6A',
    decorSecondary: '#B7C978',
    placeholderEnd: '#DCEED6',
    sectionColors: ['#A8D3A0', '#D9E7A9', '#9CC8D8'],
    pinColors: ['#4F9A62', '#8AA54A', '#438CA4'],
  },
  culture: {
    ...DEFAULT_PALETTE,
    paper: '#FBF1E3',
    ribbon: '#F0DFC7',
    ribbonBorder: '#9D7B58',
    decorPrimary: '#B0835A',
    decorSecondary: '#C05F4D',
    placeholderEnd: '#F1DFCF',
    sectionColors: ['#E2B67B', '#D49A8A', '#B9A0C8'],
    pinColors: ['#A46935', '#A64E43', '#75538F'],
  },
  food: {
    ...DEFAULT_PALETTE,
    paper: '#FFF2E7',
    ribbon: '#FFE2C9',
    ribbonBorder: '#D88249',
    decorPrimary: '#D98255',
    decorSecondary: '#7FA36B',
    placeholderEnd: '#F9DECB',
    sectionColors: ['#F2B278', '#F0D16E', '#B8D78C'],
    pinColors: ['#C96D35', '#B78922', '#5C9A52'],
  },
  family: {
    ...DEFAULT_PALETTE,
    paper: '#FFF7E7',
    ribbon: '#E9F3FF',
    ribbonBorder: '#6E9BC8',
    decorPrimary: '#6EA6C8',
    decorSecondary: '#E5B95F',
    placeholderEnd: '#DCEEFF',
    sectionColors: ['#9CCBE5', '#F5D36C', '#B9D99B'],
    pinColors: ['#4B90B9', '#C78F24', '#5F9B4F'],
  },
  couple: {
    ...DEFAULT_PALETTE,
    paper: '#FFF0EF',
    ribbon: '#F8DADF',
    ribbonBorder: '#C87A89',
    decorPrimary: '#C97D8C',
    decorSecondary: '#B79A61',
    placeholderEnd: '#F5D8DC',
    sectionColors: ['#E7A2AD', '#EAC77A', '#B9B0DD'],
    pinColors: ['#B65F70', '#B8892E', '#7667A9'],
  },
  classic: {
    ...DEFAULT_PALETTE,
    paper: '#F8F3E8',
    ribbon: '#E7E3D4',
    ribbonBorder: '#7E8874',
    decorPrimary: '#7E8874',
    decorSecondary: '#C59B5B',
    placeholderEnd: '#E4E1D4',
    sectionColors: ['#C7C7A7', '#E0B976', '#AFC6D0'],
    pinColors: ['#6F7961', '#AA7934', '#5F8491'],
  },
}

export function renderHandbookDayCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  dayId: string,
  bgImage: CanvasImageSource | null = null,
  stopPhotos?: Map<string, CanvasImageSource>,
): void {
  const day = trip.days.find((item) => item.id === dayId)
  const palette = paletteForDay(day)
  drawPaper(ctx, palette)
  if (bgImage) {
    ctx.save()
    ctx.globalAlpha = 0.18
    drawImageCover(ctx, bgImage, 0, 0, CARD_W, CARD_H)
    ctx.restore()
  }
  drawDecor(ctx, palette)

  if (!day) {
    drawFooter(ctx)
    return
  }

  drawRibbon(ctx, `Day ${day.index}`, day.title || trip.title || '旅行手帐', palette)

  const stops = day.stops.filter(isVisitStop).slice(0, 3)
  let y = 218
  stops.forEach((stop, index) => {
    drawStopSection(ctx, stop, index, y, stopPhotos?.get(stop.id) ?? null, palette)
    y += 318
  })

  drawSummary(ctx, day, stops, palette)
  drawFooter(ctx)
}

function paletteForDay(day?: Day): HandbookPalette {
  const mood = day?.dayMood
  return mood && MOOD_PALETTES[mood] ? MOOD_PALETTES[mood] : DEFAULT_PALETTE
}

function drawPaper(ctx: CanvasRenderingContext2D, palette: HandbookPalette): void {
  ctx.fillStyle = palette.paper
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.strokeStyle = palette.line
  ctx.lineWidth = 1
  for (let y = 28; y < CARD_H; y += 34) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CARD_W, y)
    ctx.stroke()
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, palette: HandbookPalette): void {
  ctx.save()
  ctx.globalAlpha = 0.58
  ctx.font = `42px ${FONT}`
  ctx.fillStyle = palette.decorPrimary
  ctx.fillText('✿', 54, 82)
  ctx.fillText('☘', CARD_W - 112, 128)
  ctx.fillStyle = palette.decorSecondary
  ctx.fillText('✦', CARD_W - 92, CARD_H - 112)
  ctx.restore()
}

function drawRibbon(ctx: CanvasRenderingContext2D, dayText: string, title: string, palette: HandbookPalette): void {
  const x = 170
  const y = 48
  const w = CARD_W - 340
  const h = 118
  roundRect(ctx, x, y, w, h, 30)
  ctx.fillStyle = palette.ribbon
  ctx.fill()
  ctx.strokeStyle = palette.ribbonBorder
  ctx.lineWidth = 4
  ctx.setLineDash([14, 10])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#3B2A1A'
  ctx.font = `bold 54px ${FONT}`
  ctx.fillText(`${dayText}  ${truncateText(ctx, title, 430)}`, CARD_W / 2, y + h / 2)

  drawTape(ctx, 68, 60, '旅行手帐')
  drawTape(ctx, CARD_W - 214, 60, '慢下来记录')
}

function drawTape(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  roundRect(ctx, x, y, 150, 86, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,96,72,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = C.note
  ctx.font = `24px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  wrapText(ctx, text, 112).slice(0, 2).forEach((line, index) => ctx.fillText(line, x + 75, y + 28 + index * 28))
}

function drawStopSection(
  ctx: CanvasRenderingContext2D,
  stop: Stop,
  index: number,
  top: number,
  photo: CanvasImageSource | null,
  palette: HandbookPalette,
): void {
  const color = palette.sectionColors[index % palette.sectionColors.length]
  const pin = palette.pinColors[index % palette.pinColors.length]
  const leftX = 72
  const imageX = 575
  const imageW = 430
  const imageH = 236

  drawTimePill(ctx, stop.time || sectionLabel(index), leftX, top, color)
  drawPinTitle(ctx, stop, leftX, top + 78, pin)
  drawDescription(ctx, stop, leftX, top + 136, 442)
  drawIllustration(ctx, stop, imageX, top + 20, imageW, imageH, photo, color, palette)

  ctx.strokeStyle = 'rgba(122,101,82,0.22)'
  ctx.setLineDash([12, 12])
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(70, top + 296)
  ctx.lineTo(CARD_W - 70, top + 296)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawTimePill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  roundRect(ctx, x, y, 260, 52, 26)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#3A2E22'
  ctx.font = `bold 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateText(ctx, text, 220), x + 130, y + 27)
}

function drawPinTitle(ctx: CanvasRenderingContext2D, stop: Stop, x: number, y: number, color: string): void {
  ctx.fillStyle = color
  ctx.font = `34px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('📍', x, y)
  ctx.fillStyle = C.name
  ctx.font = `bold 36px ${FONT}`
  ctx.fillText(truncateText(ctx, stop.name || '未命名地点', 360), x + 48, y)
}

function drawDescription(ctx: CanvasRenderingContext2D, stop: Stop, x: number, y: number, w: number): void {
  const text = stop.handbookText || stop.note || stop.illustrationPrompt || '把这一站慢慢写进旅行手帐里。'
  ctx.fillStyle = '#4B3828'
  ctx.font = `28px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  wrapText(ctx, text, w).slice(0, 2).forEach((line, index) => ctx.fillText(line, x + 8, y + index * 38))

  const trust = poiTrustLine(stop.poiInfo, { max: 2, separator: ' · ' })
  if (trust) {
    ctx.fillStyle = C.note
    ctx.font = `23px ${FONT}`
    ctx.fillText(`☆ Tips：${truncateText(ctx, trust, w - 80)}`, x + 8, y + 96)
  }
}

function drawIllustration(
  ctx: CanvasRenderingContext2D,
  stop: Stop,
  x: number,
  y: number,
  w: number,
  h: number,
  photo: CanvasImageSource | null,
  color: string,
  palette: HandbookPalette,
): void {
  ctx.save()
  roundRect(ctx, x, y, w, h, 28)
  ctx.clip()
  if (photo) {
    drawImageCover(ctx, photo, x, y, w, h)
  } else {
    drawWatercolorPlaceholder(ctx, stop, x, y, w, h, color, palette)
  }
  ctx.restore()
  roundRect(ctx, x, y, w, h, 28)
  ctx.strokeStyle = 'rgba(111,88,62,0.28)'
  ctx.lineWidth = 3
  ctx.stroke()
}

function drawWatercolorPlaceholder(
  ctx: CanvasRenderingContext2D,
  stop: Stop,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  palette: HandbookPalette,
): void {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#F8F1DF')
  g.addColorStop(1, palette.placeholderEnd)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  ctx.globalAlpha = 0.42
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(x + 70 + i * 58, y + 72 + (i % 3) * 20, 90, 42, -0.18, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 === 0 ? color : palette.placeholderAlt
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = 'rgba(82,65,45,0.72)'
  ctx.font = `bold 34px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateText(ctx, stop.name || '旅行插画', w - 80), x + w / 2, y + h / 2)
  ctx.font = `24px ${FONT}`
  ctx.fillStyle = C.note
  ctx.fillText('水彩手帐插画', x + w / 2, y + h / 2 + 42)
}

function drawSummary(ctx: CanvasRenderingContext2D, day: Day, stops: Stop[], palette: HandbookPalette): void {
  const y = 1168
  roundRect(ctx, 76, y, 430, 170, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(122,101,82,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = C.name
  ctx.font = `bold 34px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('今日行程小结', 112, y + 24)
  ctx.fillStyle = C.note
  ctx.font = `25px ${FONT}`
  const summary = day.handbookSummary || (day.title ? `${day.title}，慢慢收藏这一日的风景。` : '慢慢收藏这一日的风景。')
  wrapText(ctx, summary, 360).slice(0, 3).forEach((line, index) => ctx.fillText(line, 112, y + 72 + index * 32))

  const routeY = 1238
  const startX = 565
  stops.forEach((stop, index) => {
    const cx = startX + index * 145
    ctx.beginPath()
    ctx.arc(cx, routeY, 36, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = palette.pinColors[index % palette.pinColors.length]
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = palette.pinColors[index % palette.pinColors.length]
    ctx.font = `bold 24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(index + 1), cx, routeY)
    ctx.fillStyle = C.name
    ctx.font = `22px ${FONT}`
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, stop.name, 110), cx, routeY + 48)
    if (index < stops.length - 1) {
      ctx.fillStyle = '#D58A6A'
      ctx.font = `30px ${FONT}`
      ctx.fillText('→', cx + 72, routeY - 12)
    }
  })
}

function sectionLabel(index: number): string {
  return ['上午', '下午', '晚上'][index] ?? '行程'
}
