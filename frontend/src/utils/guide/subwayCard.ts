import type { Stop, TransitRoute, Trip } from '@/types/travel'
import {
  CARD_W,
  CARD_H,
  C,
  FONT,
  roundRect,
  drawBackground,
  drawBanner,
  drawFooter,
  truncateText,
  isVisitStop,
} from './theme'

/**
 * 地铁/公交换乘图（1080×1440）。
 * 数据源为后端调用腾讯 transit 路线规划后写入的 stop.travelToNext.transit。
 * 没有真实 transit 数据时不伪造线路，只给出明确空态，避免误导用户。
 */
export function renderSubwayCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  _mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  if (bgImage) {
    drawBackground(ctx, bgImage)
  } else {
    drawTransitBackground(ctx)
  }

  const bannerBottom = drawBanner(ctx, trip.title || '地铁公交换乘图', '腾讯公共交通规划', '🚇')
  const groups = buildTransitGroups(trip)
  const top = bannerBottom + 32
  const bottom = CARD_H - 96

  if (groups.length === 0) {
    drawEmptyState(ctx, top, bottom)
    drawFooter(ctx)
    return
  }

  let y = top
  outer:
  for (const group of groups) {
    if (y + 44 > bottom) break
    ctx.fillStyle = C.primaryDark
    ctx.font = `bold 30px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`Day ${group.dayIndex}${group.title ? ' · ' + group.title : ''}`, 72, y)
    y += 46

    for (const segment of group.segments) {
      const h = segmentHeight(segment)
      if (y + h > bottom) break outer
      drawTransitSegment(ctx, segment, 64, y, CARD_W - 128, h)
      y += h + 18
    }
    y += 10
  }

  drawFooter(ctx)
}

interface TransitSegment {
  from: Stop
  to: Stop
  route: TransitRoute
}

interface TransitGroup {
  dayIndex: number
  title: string
  segments: TransitSegment[]
}

const LINE_COLORS = ['#E13333', '#2F80D2', '#4DB848', '#F5A623', '#9B59B6', '#1BBC9B']

function buildTransitGroups(trip: Trip): TransitGroup[] {
  const groups: TransitGroup[] = []
  trip.days.forEach((day) => {
    const segments: TransitSegment[] = []
    for (let i = 0; i < day.stops.length - 1; i++) {
      const from = day.stops[i]
      const to = day.stops[i + 1]
      if (!isVisitStop(from) || !isVisitStop(to)) continue
      const route = from.travelToNext?.transit
      if (route && route.lines.length > 0) {
        segments.push({ from, to, route })
      }
    }
    if (segments.length > 0) {
      groups.push({ dayIndex: day.index, title: day.title, segments })
    }
  })
  return groups
}

function segmentHeight(segment: TransitSegment): number {
  const lines = Math.min(segment.route.lines.length, 3)
  return 132 + lines * 44 + (segment.route.lines.length > 3 ? 26 : 0)
}

function drawTransitBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#FAF7F2'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.strokeStyle = 'rgba(200,180,160,0.18)'
  ctx.lineWidth = 1
  const step = 60
  for (let x = 0; x < CARD_W; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CARD_H)
    ctx.stroke()
  }
  for (let y = 0; y < CARD_H; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CARD_W, y)
    ctx.stroke()
  }
}

function drawEmptyState(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
  const x = 86
  const y = top + 120
  const w = CARD_W - x * 2
  const h = Math.min(300, bottom - y)
  roundRect(ctx, x, y, w, h, 32)
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.name
  ctx.font = `bold 40px ${FONT}`
  ctx.fillText('暂无真实公共交通规划', CARD_W / 2, y + h / 2 - 32)
  ctx.fillStyle = C.note
  ctx.font = `28px ${FONT}`
  ctx.fillText('补齐地点坐标并重新生成行程后，会显示腾讯地铁/公交换乘方案', CARD_W / 2, y + h / 2 + 28)
}

function drawTransitSegment(
  ctx: CanvasRenderingContext2D,
  segment: TransitSegment,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  roundRect(ctx, x, y, w, h, 26)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.strokeStyle = C.banner
  ctx.lineWidth = 3
  ctx.stroke()

  const route = segment.route
  const title = `${segment.from.name} → ${segment.to.name}`
  ctx.fillStyle = C.name
  ctx.font = `bold 32px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(truncateText(ctx, title, w - 260), x + 24, y + 22)

  ctx.fillStyle = C.primary
  ctx.font = `24px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(`${fmtMin(route.durationMin)} · 换乘${route.transferCount}次`, x + w - 24, y + 28)

  drawLineSummary(ctx, route, x + 24, y + 68, w - 48)

  let rowY = y + 112
  route.lines.slice(0, 3).forEach((line, i) => {
    const color = LINE_COLORS[i % LINE_COLORS.length]
    drawRouteLine(ctx, line, color, x + 28, rowY, w - 56)
    rowY += 44
  })
  if (route.lines.length > 3) {
    ctx.fillStyle = C.note
    ctx.font = `22px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`另有 ${route.lines.length - 3} 段换乘，建议出发前打开地图确认`, x + 28, rowY)
  }

  const meta = [`步行约 ${route.walkingM}m`, `总距 ${fmtDistance(route.distanceM)}`]
  ctx.fillStyle = C.note
  ctx.font = `22px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(meta.join(' · '), x + w - 24, y + h - 18)
}

function drawLineSummary(ctx: CanvasRenderingContext2D, route: TransitRoute, x: number, y: number, w: number): void {
  ctx.font = `24px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const summary = route.lines.map((line) => `${vehicleIcon(line.vehicle, line.title)} ${line.title}`).join('  →  ')
  ctx.fillStyle = C.primaryDark
  ctx.fillText(truncateText(ctx, summary, w), x, y)
}

function drawRouteLine(
  ctx: CanvasRenderingContext2D,
  line: TransitRoute['lines'][number],
  color: string,
  x: number,
  y: number,
  w: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + 8, y + 20)
  ctx.lineTo(x + w - 8, y + 20)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x + 8, y + 20, 13, 0, Math.PI * 2)
  ctx.arc(x + w - 8, y + 20, 13, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.stroke()

  const stationText = [line.geton, line.getoff].filter(Boolean).join(' → ')
  const stationCount = line.stationCount > 0 ? ` · ${line.stationCount}站` : ''
  const text = `${vehicleIcon(line.vehicle, line.title)} ${line.title}${stationText ? ' · ' + stationText : ''}${stationCount}`
  ctx.font = `24px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const label = truncateText(ctx, text, w - 48)
  const labelX = x + 24
  const labelW = Math.min(w - 48, ctx.measureText(label).width + 18)
  roundRect(ctx, labelX - 9, y + 2, labelW, 36, 18)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(216,184,146,0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = C.name
  ctx.fillText(label, labelX, y + 20)
}

function vehicleIcon(vehicle: string, title: string): string {
  return /subway|metro|地铁/i.test(vehicle + title) ? '🚇' : '🚌'
}

function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h > 0 ? `${h}小时${r ? r + '分' : ''}` : `${r}分钟`
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}
