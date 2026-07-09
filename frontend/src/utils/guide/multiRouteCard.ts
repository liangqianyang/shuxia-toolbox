import type { Trip } from '@/types/travel'
import { projectLatLngOnCoveredMap } from './mapProject'
import {
  CARD_W,
  CARD_H,
  C,
  FONT,
  roundRect,
  drawImageCover,
  drawBackground,
  drawBanner,
  drawFooter,
  truncateText,
  isVisitStop,
} from './theme'

interface MapPoint {
  stop: StopRef['stop']
  routeIndex: number
  seq: number
  x: number
  y: number
  drawX: number
  drawY: number
}

/**
 * 多路线分区地图（1080×1440）：按天的 routeTag 分色展示路线。
 * 多天同 routeTag 合并为同一路线（如 Day1+Day2 同属「西湖线」）；
 * 无 routeTag 的天退化为 "Day N" 作路线名。
 * - 上：真实底图 + 右上角路线图例浮层
 * - 下：每条路线一个分色区块（彩色标题 + 景点横排）
 */
export function renderMultiRouteCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)

  const routes = buildRouteGroups(trip)
  const subtitle = routes.map((r) => r.tag).slice(0, 3).join(' · ')
  const bannerBottom = drawBanner(ctx, trip.title || '多路线规划图', subtitle, '🗺️')

  // ---- 地图区 ----
  const mapX = 64
  const mapY = bannerBottom + 24
  const mapW = CARD_W - mapX * 2
  const mapH = 450

  ctx.save()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.clip()
  if (mapImage) {
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
    ctx.fillStyle = 'rgba(255, 252, 245, 0.18)'
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawMultiRouteOverlay(ctx, trip, routes, mapImage, { x: mapX, y: mapY, width: mapW, height: mapH })
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawMultiRouteFallback(ctx, routes, { x: mapX, y: mapY, width: mapW, height: mapH })
  }
  ctx.restore()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.lineWidth = 4
  ctx.strokeStyle = C.line
  ctx.stroke()

  // ---- 图例浮层（地图右上角）----
  drawRouteLegendOverlay(ctx, routes, mapX + mapW - 16, mapY + 16)

  // ---- 路线区块（地图下方）----
  const blockTop = mapY + mapH + 28
  const blockBottom = CARD_H - 82
  const n = routes.length
  const blockH = Math.min(200, Math.floor((blockBottom - blockTop - Math.max(0, n - 1) * 16) / n))

  let y = blockTop
  routes.forEach((route) => {
    if (y + Math.max(blockH, 80) > blockBottom) return
    drawRouteBlock(ctx, route, 64, y, CARD_W - 128, blockH)
    y += blockH + 16
  })

  drawFooter(ctx)
}

// ---- 数据准备 ----

const ROUTE_PALETTE = ['#F48CB8', '#5DBD8A', '#4A9EDB', '#F09856', '#9C88D4']

interface StopRef {
  stop: Trip['days'][0]['stops'][0]
  dayIndex: number
}

interface RouteGroup {
  tag: string
  color: string
  dayNumbers: number[]
  items: StopRef[]
}

function buildRouteGroups(trip: Trip): RouteGroup[] {
  const map = new Map<string, RouteGroup>()
  let colorIdx = 0

  trip.days.forEach((day) => {
    const tag = day.routeTag?.trim() || `Day ${day.index}`
    if (!map.has(tag)) {
      map.set(tag, {
        tag,
        color: ROUTE_PALETTE[colorIdx++ % ROUTE_PALETTE.length],
        dayNumbers: [],
        items: [],
      })
    }
    const g = map.get(tag)!
    if (!g.dayNumbers.includes(day.index)) g.dayNumbers.push(day.index)
    day.stops.forEach((stop) => {
      // transit 枢纽不作为路线上的景点
      if (isVisitStop(stop)) g.items.push({ stop, dayIndex: day.index })
    })
  })

  return Array.from(map.values())
}

// ---- 绘制子函数 ----

function drawMultiRouteOverlay(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  routes: RouteGroup[],
  mapImage: CanvasImageSource | null,
  box: { x: number; y: number; width: number; height: number },
): void {
  const vp = trip.mapViewport
  if (!vp) {
    drawMultiRouteFallback(ctx, routes, box)
    return
  }

  const raw: MapPoint[] = []
  routes.forEach((route, routeIndex) => {
    route.items.forEach((item, itemIndex) => {
      const { lat, lng } = item.stop
      if (lat == null || lng == null) return
      const p = projectLatLngOnCoveredMap(lat, lng, vp, box.width, box.height, mapImage)
      const x = box.x + p.x
      const y = box.y + p.y
      raw.push({ stop: item.stop, routeIndex, seq: itemIndex + 1, x, y, drawX: x, drawY: y })
    })
  })
  if (raw.length === 0) {
    drawMultiRouteFallback(ctx, routes, box)
    return
  }

  const points = spreadRoutePoints(raw, box)
  drawRouteLeaders(ctx, points)

  routes.forEach((route, routeIndex) => {
    const pts = points.filter((p) => p.routeIndex === routeIndex)
    if (pts.length < 2) return
    const linePts = pts.map((p) => ({ x: p.drawX, y: p.drawY }))
    drawRouteLine(ctx, linePts, 'rgba(255,255,255,0.92)', 13)
    drawRouteLine(ctx, linePts, route.color, 8)
  })

  points.forEach((point) => {
    const route = routes[point.routeIndex]
    drawRouteDot(ctx, point.drawX, point.drawY, point.seq, route?.color ?? C.primary)
  })

  drawKeyRouteLabels(ctx, points, routes, box)
}

function drawMultiRouteFallback(
  ctx: CanvasRenderingContext2D,
  routes: RouteGroup[],
  box: { x: number; y: number; width: number; height: number },
): void {
  const top = box.y + box.height * 0.2
  const gapY = routes.length > 1 ? box.height * 0.26 : box.height * 0.34
  routes.slice(0, 3).forEach((route, routeIndex) => {
    const items = route.items.slice(0, 6)
    if (items.length === 0) return
    const y = top + routeIndex * gapY
    const left = box.x + 70
    const right = box.x + box.width - 70
    const step = items.length > 1 ? (right - left) / (items.length - 1) : 0
    const pts = items.map((item, i) => ({
      x: left + step * i,
      y: y + (i % 2 === 0 ? -18 : 18),
      item,
    }))
    drawRouteLine(ctx, pts, 'rgba(255,255,255,0.9)', 13)
    drawRouteLine(ctx, pts, route.color, 8)
    pts.forEach((p, i) => {
      drawRouteDot(ctx, p.x, p.y, i + 1, route.color)
    })
  })
}

function spreadRoutePoints(points: MapPoint[], box: { x: number; y: number; width: number; height: number }): MapPoint[] {
  const out = points.map((p) => ({ ...p }))
  const minGap = 56
  const margin = 30
  const maxMove = 88
  for (let iter = 0; iter < 52; iter++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        let dx = b.drawX - a.drawX
        let dy = b.drawY - a.drawY
        let dist = Math.hypot(dx, dy)
        if (dist >= minGap) continue
        if (dist < 0.01) {
          const angle = (i * 2.17 + j * 0.91) % (Math.PI * 2)
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

function drawRouteLeaders(ctx: CanvasRenderingContext2D, points: MapPoint[]): void {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(90,70,50,0.34)'
  ctx.setLineDash([8, 8])
  points.forEach((p) => {
    if (Math.hypot(p.drawX - p.x, p.drawY - p.y) < 12) return
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.drawX, p.drawY)
    ctx.stroke()
  })
  ctx.restore()
}

function drawRouteLine(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  width: number,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.restore()
}

function drawRouteDot(ctx: CanvasRenderingContext2D, x: number, y: number, seq: number, color: string): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 23, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, 17, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${seq >= 10 ? 18 : 22}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(seq), x, y + 1)
  ctx.restore()
}

function drawKeyRouteLabels(
  ctx: CanvasRenderingContext2D,
  points: MapPoint[],
  routes: RouteGroup[],
  box: { x: number; y: number; width: number; height: number },
): void {
  const selected = new Map<string, MapPoint>()
  routes.forEach((_route, routeIndex) => {
    const pts = points.filter((p) => p.routeIndex === routeIndex)
    if (pts.length === 0) return
    selected.set(`${routeIndex}-first`, pts[0])
    selected.set(`${routeIndex}-last`, pts[pts.length - 1])
  })

  const used: Array<{ x: number; y: number; w: number; h: number }> = []
  Array.from(selected.values()).forEach((point) => {
    const route = routes[point.routeIndex]
    drawRouteLabel(ctx, point.stop.name || route?.tag || '', point.drawX, point.drawY, route?.color ?? C.primary, box, used)
  })
}

function drawRouteLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  color: string,
  box: { x: number; y: number; width: number; height: number },
  used: Array<{ x: number; y: number; w: number; h: number }>,
): void {
  ctx.save()
  ctx.font = `bold 22px ${FONT}`
  const text = truncateText(ctx, name, 132)
  const w = ctx.measureText(text).width + 20
  const h = 32
  const preferLeft = x > box.x + box.width * 0.58
  const raw = preferLeft
    ? { x: x - w - 28, y: y - h / 2, w, h }
    : { x: x + 28, y: y - h / 2, w, h }
  const rect = clampRect(raw, box)
  if (used.some((old) => rectsOverlap(rect, old))) {
    ctx.restore()
    return
  }
  used.push(rect)

  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 9)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = C.name
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, rect.x + 10, rect.y + rect.h / 2)
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

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  const gap = 5
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

/** 地图右上角路线图例（小胶囊，右对齐堆叠） */
function drawRouteLegendOverlay(
  ctx: CanvasRenderingContext2D,
  routes: RouteGroup[],
  rightX: number,
  topY: number,
): void {
  const pillH = 40
  const padX = 14
  const gap = 8

  routes.forEach((route, i) => {
    ctx.font = `bold 26px ${FONT}`
    const tw = ctx.measureText(route.tag).width
    const pillW = tw + padX * 2 + 28
    const x = rightX - pillW
    const y = topY + i * (pillH + gap)

    roundRect(ctx, x, y, pillW, pillH, pillH / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fill()
    ctx.strokeStyle = route.color
    ctx.lineWidth = 2.5
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x + padX + 7, y + pillH / 2, 7, 0, Math.PI * 2)
    ctx.fillStyle = route.color
    ctx.fill()

    ctx.fillStyle = C.primaryDark
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(route.tag, x + padX + 20, y + pillH / 2)
  })
}

/** 单条路线区块：彩色标题 + 景点横排 */
function drawRouteBlock(
  ctx: CanvasRenderingContext2D,
  route: RouteGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  roundRect(ctx, x, y, w, h, 24)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = route.color + '66'
  ctx.stroke()

  // 彩色标题条
  const hdrH = 52
  ctx.save()
  roundRect(ctx, x, y, w, hdrH, 24)
  ctx.clip()
  ctx.fillStyle = route.color
  ctx.fillRect(x, y, w, hdrH)
  ctx.restore()

  const dayStr = route.dayNumbers.map((d) => `Day${d}`).join('+')
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 30px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `📍 ${route.tag}  ${dayStr}  ·  ${route.items.length}个景点`,
    x + 22,
    y + hdrH / 2,
  )

  // 景点横排（最多 6 个，多余显示 +N）
  const listX = x + 16
  const listW = w - 32
  const maxVisible = 6
  const visItems = route.items.slice(0, maxVisible)
  const slot = Math.min(170, Math.floor(listW / visItems.length))
  const slotCy = y + hdrH + (h - hdrH) / 2

  visItems.forEach((item, i) => {
    const sx = listX + slot * i
    const dotCy = slotCy - 14
    const dotR = 18

    ctx.beginPath()
    ctx.arc(sx + dotR + 4, dotCy, dotR, 0, Math.PI * 2)
    ctx.fillStyle = route.color
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold 22px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), sx + dotR + 4, dotCy)

    ctx.fillStyle = C.name
    ctx.font = `26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, item.stop.name, slot - 8), sx + slot / 2, slotCy + 6)
  })

  if (route.items.length > maxVisible) {
    const moreX = listX + slot * maxVisible + 8
    ctx.fillStyle = C.note
    ctx.font = `26px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${route.items.length - maxVisible}`, moreX, slotCy)
  }
}
