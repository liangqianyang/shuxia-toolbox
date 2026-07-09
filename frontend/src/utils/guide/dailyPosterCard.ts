import type { Day, FoodRec, Stop, Trip } from '@/types/travel'
import { projectLatLngOnCoveredMap } from './mapProject'
import {
  CARD_H,
  CARD_W,
  C,
  FONT,
  drawBackground,
  drawBanner,
  drawFooter,
  drawImageCover,
  drawNumberedDot,
  isVisitStop,
  poiTrustLine,
  roundRect,
  truncateText,
  wrapText,
} from './theme'

const DAY_COLORS = ['#F6A6A1', '#A8D5A2', '#9FC3F0', '#F3C98B', '#C9A8E0']

interface PosterPoint {
  stop: Stop
  seq: number
  x: number
  y: number
  drawX: number
  drawY: number
}

export function renderDailyPosterCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  dayId: string,
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  const day = trip.days.find((item) => item.id === dayId) ?? trip.days[0]
  if (!day) return

  const stops = day.stops.filter(isVisitStop)
  const dayColor = DAY_COLORS[(day.index - 1) % DAY_COLORS.length]
  const subtitle = [day.routeTag, day.title, `${stops.length} 个地点`].filter(Boolean).join(' · ')

  drawBackground(ctx, bgImage)
  const bannerBottom = drawBanner(ctx, trip.title || `Day ${day.index} 攻略`, subtitle, '🧭')

  const mapX = 64
  const mapY = bannerBottom + 24
  const mapW = CARD_W - mapX * 2
  const lowerGap = 22
  const lowerBottom = CARD_H - 96
  const targetLowerH = 580
  const mapH = Math.max(400, Math.min(500, lowerBottom - mapY - lowerGap - targetLowerH))

  ctx.save()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.clip()
  if (mapImage) {
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
    ctx.fillStyle = 'rgba(255, 252, 245, 0.14)'
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawDayMapOverlay(ctx, trip, stops, dayColor, mapImage, { x: mapX, y: mapY, width: mapW, height: mapH })
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawFallbackRoute(ctx, stops, dayColor, { x: mapX, y: mapY, width: mapW, height: mapH })
  }
  ctx.restore()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.lineWidth = 4
  ctx.strokeStyle = C.line
  ctx.stroke()

  drawDayBadge(ctx, day, dayColor, mapX + 20, mapY + 20)

  const lowerY = mapY + mapH + lowerGap
  const lowerH = lowerBottom - lowerY
  const timelineW = 604
  const rightX = mapX + timelineW + 22
  const rightW = CARD_W - 64 - rightX

  drawTimelinePanel(ctx, day, stops, mapX, lowerY, timelineW, lowerH, dayColor)
  const tipsH = Math.min(214, Math.max(176, Math.floor(lowerH * 0.38)))
  drawTipsPanel(ctx, trip, day, stops, rightX, lowerY, rightW, tipsH, dayColor)
  drawFoodPanel(ctx, trip, stops, rightX, lowerY + tipsH + 16, rightW, lowerH - tipsH - 16, dayColor)
  drawFooter(ctx)
}

function drawDayBadge(ctx: CanvasRenderingContext2D, day: Day, color: string, x: number, y: number): void {
  const tag = day.routeTag || `Day ${day.index}`
  ctx.save()
  ctx.font = `bold 28px ${FONT}`
  const w = Math.min(360, ctx.measureText(tag).width + 56)
  roundRect(ctx, x, y, w, 48, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = C.primaryDark
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateText(ctx, tag, w - 32), x + w / 2, y + 24)
  ctx.restore()
}

function drawDayMapOverlay(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  stops: Stop[],
  color: string,
  mapImage: CanvasImageSource | null,
  box: { x: number; y: number; width: number; height: number },
): void {
  const vp = trip.mapViewport
  if (!vp) {
    drawFallbackRoute(ctx, stops, color, box)
    return
  }

  const raw: PosterPoint[] = []
  stops.forEach((stop, index) => {
    if (stop.lat == null || stop.lng == null) return
    const p = projectLatLngOnCoveredMap(stop.lat, stop.lng, vp, box.width, box.height, mapImage)
    const x = box.x + p.x
    const y = box.y + p.y
    raw.push({ stop, seq: index + 1, x, y, drawX: x, drawY: y })
  })
  if (raw.length === 0) {
    drawFallbackRoute(ctx, stops, color, box)
    return
  }

  const points = spreadPoints(raw, box)
  drawLeaders(ctx, points)
  drawRouteLine(ctx, points, 'rgba(255,255,255,0.94)', 14)
  drawRouteLine(ctx, points, color, 8)
  points.forEach((point) => drawPosterDot(ctx, point, color))
  pickLabelPoints(points).forEach((point) => drawPosterLabel(ctx, point, color, box))
}

function drawFallbackRoute(
  ctx: CanvasRenderingContext2D,
  stops: Stop[],
  color: string,
  box: { x: number; y: number; width: number; height: number },
): void {
  const list = stops.slice(0, 8)
  const left = box.x + 86
  const right = box.x + box.width - 86
  const top = box.y + box.height * 0.25
  const bottom = box.y + box.height * 0.72
  const points = list.map((stop, index) => {
    const t = list.length <= 1 ? 0.5 : index / (list.length - 1)
    const x = left + (right - left) * t
    const y = top + (bottom - top) * (index % 2 === 0 ? 0.28 : 0.72)
    return { stop, seq: index + 1, x, y, drawX: x, drawY: y }
  })
  drawRouteLine(ctx, points, 'rgba(255,255,255,0.92)', 14)
  drawRouteLine(ctx, points, color, 8)
  points.forEach((point) => drawPosterDot(ctx, point, color))
  pickLabelPoints(points).forEach((point) => drawPosterLabel(ctx, point, color, box))
}

function spreadPoints(points: PosterPoint[], box: { x: number; y: number; width: number; height: number }): PosterPoint[] {
  const out = points.map((p) => ({ ...p }))
  const minGap = 78
  const margin = 36
  const maxMove = 116

  for (let iter = 0; iter < 54; iter++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        let dx = b.drawX - a.drawX
        let dy = b.drawY - a.drawY
        let dist = Math.hypot(dx, dy)
        if (dist >= minGap) continue
        if (dist < 0.01) {
          const angle = (i * 2.31 + j * 0.77) % (Math.PI * 2)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }
        const push = (minGap - dist) * 0.5
        a.drawX -= (dx / dist) * push
        a.drawY -= (dy / dist) * push
        b.drawX += (dx / dist) * push
        b.drawY += (dy / dist) * push
      }
    }
    out.forEach((point) => {
      const dx = point.drawX - point.x
      const dy = point.drawY - point.y
      const moved = Math.hypot(dx, dy)
      if (moved > maxMove) {
        point.drawX = point.x + (dx / moved) * maxMove
        point.drawY = point.y + (dy / moved) * maxMove
      }
      point.drawX = Math.max(box.x + margin, Math.min(box.x + box.width - margin, point.drawX))
      point.drawY = Math.max(box.y + margin, Math.min(box.y + box.height - margin, point.drawY))
    })
  }

  return out
}

function drawLeaders(ctx: CanvasRenderingContext2D, points: PosterPoint[]): void {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(90,70,50,0.32)'
  ctx.setLineDash([8, 8])
  points.forEach((point) => {
    if (Math.hypot(point.drawX - point.x, point.drawY - point.y) < 12) return
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(point.drawX, point.drawY)
    ctx.stroke()
  })
  ctx.restore()
}

function drawRouteLine(ctx: CanvasRenderingContext2D, points: PosterPoint[], color: string, width: number): void {
  if (points.length < 2) return
  ctx.save()
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.beginPath()
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.drawX, point.drawY) : ctx.lineTo(point.drawX, point.drawY)))
  ctx.stroke()
  ctx.restore()
}

function drawPosterDot(ctx: CanvasRenderingContext2D, point: PosterPoint, color: string): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(point.drawX, point.drawY, 28, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(point.drawX, point.drawY, 21, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${point.seq >= 10 ? 21 : 25}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(point.seq), point.drawX, point.drawY + 1)
  ctx.restore()
}

function pickLabelPoints(points: PosterPoint[]): PosterPoint[] {
  if (points.length <= 4) return points
  const picks = new Map<number, PosterPoint>()
  picks.set(points[0].seq, points[0])
  picks.set(points[points.length - 1].seq, points[points.length - 1])
  picks.set(points[Math.floor(points.length / 2)].seq, points[Math.floor(points.length / 2)])
  return Array.from(picks.values()).sort((a, b) => a.seq - b.seq)
}

function drawPosterLabel(
  ctx: CanvasRenderingContext2D,
  point: PosterPoint,
  color: string,
  box: { x: number; y: number; width: number; height: number },
): void {
  ctx.save()
  ctx.font = `bold 24px ${FONT}`
  const text = truncateText(ctx, point.stop.name || `地点${point.seq}`, 150)
  const w = ctx.measureText(text).width + 22
  const h = 36
  const leftSide = point.drawX > box.x + box.width * 0.58
  const rect = clampRect({
    x: leftSide ? point.drawX - w - 34 : point.drawX + 34,
    y: point.drawY - h / 2,
    w,
    h,
  }, box)
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = C.name
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, rect.x + 11, rect.y + rect.h / 2)
  ctx.restore()
}

function clampRect(
  rect: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const pad = 8
  return {
    ...rect,
    x: Math.max(box.x + pad, Math.min(box.x + box.width - rect.w - pad, rect.x)),
    y: Math.max(box.y + pad, Math.min(box.y + box.height - rect.h - pad, rect.y)),
  }
}

function drawTimelinePanel(
  ctx: CanvasRenderingContext2D,
  day: Day,
  stops: Stop[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  drawPanel(ctx, x, y, w, h, '今日路线', color)
  const footerReserve = stops.length > 6 ? 36 : 18
  const bodyTop = y + 76
  const bodyBottom = y + h - footerReserve
  const maxRows = h >= 520 ? 6 : 5
  const rows = stops.slice(0, maxRows)
  const rowGap = 8
  const rowH = rows.length > 0
    ? Math.max(58, Math.min(68, Math.floor((bodyBottom - bodyTop - rowGap * (rows.length - 1)) / rows.length)))
    : 0
  let cy = bodyTop

  ctx.save()
  roundRect(ctx, x, y, w, h, 24)
  ctx.clip()
  rows.forEach((stop, index) => {
    const dotCy = cy + rowH / 2
    drawNumberedDot(ctx, index + 1, x + 34, dotCy, 18, stop.type)
    ctx.fillStyle = C.note
    ctx.font = `21px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const timeText = truncateText(ctx, stop.time.trim() || '弹性', 118)
    ctx.fillText(timeText, x + 64, dotCy - 13)
    ctx.fillStyle = C.name
    ctx.font = `bold 26px ${FONT}`
    ctx.fillText(truncateText(ctx, stop.name || '未命名', w - 104), x + 64, dotCy + 15)
    cy += rowH + rowGap
  })
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  if (stops.length > rows.length) {
    ctx.fillStyle = C.note
    ctx.font = `24px ${FONT}`
    ctx.fillText(`+${stops.length - rows.length} 个地点见详细行程`, x + 70, y + h - 24)
  }
}

function drawTipsPanel(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  day: Day,
  stops: Stop[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  drawPanel(ctx, x, y, w, h, '行前必看', color)
  const tips = buildDayTips(trip, day, stops).slice(0, 2)
  let ty = y + 72
  const bottom = y + h - 18

  ctx.save()
  roundRect(ctx, x, y, w, h, 24)
  ctx.clip()
  tips.forEach((tip) => {
    if (ty + 28 > bottom) return
    ctx.fillStyle = color
    ctx.font = `bold 24px ${FONT}`
    ctx.fillText('•', x + 24, ty + 1)
    ctx.fillStyle = C.name
    ctx.font = `23px ${FONT}`
    const maxLines = ty + 62 <= bottom ? 2 : 1
    const lines = wrapText(ctx, tip, w - 58).slice(0, maxLines)
    lines.forEach((line, i) => ctx.fillText(line, x + 46, ty + i * 28))
    ty += Math.max(34, lines.length * 28 + 8)
  })
  ctx.restore()
}

function drawFoodPanel(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  stops: Stop[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  drawPanel(ctx, x, y, w, h, '本日美食', color)
  const sourceFoods = buildFoodItems(trip, stops)
  const itemH = 64
  const maxFoods = Math.max(1, Math.min(2, Math.floor((h - 92) / (itemH + 10))))
  const foods = sourceFoods.slice(0, maxFoods)
  let fy = y + 72

  ctx.save()
  roundRect(ctx, x, y, w, h, 24)
  ctx.clip()
  if (foods.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `23px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    wrapText(ctx, '按当天路线就近安排，优先选择离下一站更顺路的餐厅。', w - 44)
      .slice(0, 3)
      .forEach((line, index) => ctx.fillText(line, x + 22, fy + index * 30))
    ctx.restore()
    return
  }

  foods.forEach((food, index) => {
    roundRect(ctx, x + 18, fy, w - 36, itemH, 18)
    ctx.fillStyle = index % 2 === 0 ? '#FFF7EC' : '#F7FBF5'
    ctx.fill()
    ctx.fillStyle = color
    ctx.font = `bold 24px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(index + 1), x + 38, fy + itemH / 2)
    ctx.fillStyle = C.name
    ctx.font = `bold 24px ${FONT}`
    ctx.fillText(truncateText(ctx, food.name, w - 102), x + 68, fy + 24)
    ctx.fillStyle = C.note
    ctx.font = `20px ${FONT}`
    ctx.fillText(truncateText(ctx, food.sub, w - 102), x + 68, fy + 49)
    fy += itemH + 10
  })
  if (sourceFoods.length > foods.length && fy + 24 < y + h) {
    ctx.fillStyle = C.note
    ctx.font = `21px ${FONT}`
    ctx.fillText(`+${sourceFoods.length - foods.length} 个备选见详细行程`, x + 22, y + h - 22)
  }
  ctx.restore()
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, color: string): void {
  roundRect(ctx, x, y, w, h, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color + '66'
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `bold 30px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(title, x + 24, y + 22)
}

function buildDayTips(trip: Trip, day: Day, stops: Stop[]): string[] {
  const tips: string[] = []
  const reserve = stops.find((stop) => stop.poiInfo?.reservation)
  if (reserve?.poiInfo?.reservation) tips.push(`${reserve.name}: ${reserve.poiInfo.reservation}`)
  const ticket = stops.find((stop) => stop.poiInfo?.ticket)
  if (ticket?.poiInfo?.ticket) tips.push(`${ticket.name}: ${ticket.poiInfo.ticket}`)
  const longLeg = stops.find((stop) => (stop.travelToNext?.durationMin ?? 0) >= 35)
  if (longLeg?.travelToNext) tips.push(`${longLeg.name}后路程约${longLeg.travelToNext.durationMin}分钟，预留缓冲`)
  if (day.handbookSummary) tips.push(day.handbookSummary)
  tips.push(...trip.packingNotes.slice(0, 2))
  tips.push(`当天共 ${stops.length} 站，出发前再确认开放时间和天气`)
  return [...new Set(tips)].filter(Boolean)
}

function buildFoodItems(trip: Trip, stops: Stop[]): Array<{ name: string; sub: string }> {
  const byStops = stops
    .filter((stop) => stop.type === 'food')
    .map((stop) => ({
      name: stop.name || '用餐点',
      sub: stop.note || poiTrustLine(stop.poiInfo, { max: 2, separator: ' / ' }) || '按当天路线就近安排',
    }))
  const byTrip = trip.food.map((food: FoodRec) => ({
    name: food.name,
    sub: [food.shop, food.dishes.slice(0, 2).join('、')].filter(Boolean).join(' · ') || food.note,
  }))
  return [...byStops, ...byTrip]
}
