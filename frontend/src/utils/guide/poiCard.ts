import type { Trip, Stop, MapViewport, PoiType } from '@/types/travel'
import { POI_THEME, POI_LABEL, POI_TYPE_ORDER } from '@/types/travel'
import { textColorOn } from '@/utils/color'
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
  drawNumberedDot,
  truncateText,
  poiIcon,
  isVisitStop,
  poiTrustLine,
} from './theme'
import { projectLatLngOnCoveredMap } from './mapProject'

interface PoiMapPoint {
  stop: Stop
  seq: number
  x: number
  y: number
  drawX: number
  drawY: number
}

/**
 * 景点分布图（1080×1440）：真实底图仅打点（无折线），突出空间分布 +
 * 编号↔景点名清单 + 类型图例。无底图时退化为纯清单。
 */
export function renderPoiCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)
  const dest = trip.title || '景点分布'
  const bannerBottom = drawBanner(ctx, '景点分布图', dest, '📍')

  // transit（跨城枢纽）不算景点，不编号不打点
  const allStops = trip.days.flatMap((d) => d.stops).filter(isVisitStop)

  // ---- 地图区 ----
  const mapX = 64
  const mapY = bannerBottom + 32
  const mapW = CARD_W - mapX * 2
  const mapH = 560

  ctx.save()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.clip()
  if (mapImage) {
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
    // 有视口时底图为「无标注地理图」，叠加 canvas 编号点（矢量，2x 导出清晰，且与底图同视口对齐）。
    // 腾讯 staticMap 自带栅格 marker 在 2x 导出会糊；改为前端画。
    const vp = trip.mapViewport
    if (vp) {
      drawPoiMapOverlay(ctx, allStops, vp, mapImage, { x: mapX, y: mapY, width: mapW, height: mapH })
    } else {
      drawPoiMapFallback(ctx, allStops, { x: mapX, y: mapY, width: mapW, height: mapH })
    }
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawPoiMapFallback(ctx, allStops, { x: mapX, y: mapY, width: mapW, height: mapH })
  }
  ctx.restore()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.lineWidth = 4
  ctx.strokeStyle = C.line
  ctx.stroke()

  // ---- 编号↔景点名 两列清单 ----
  let y = mapY + mapH + 40
  const colGap = 40
  const colW = (CARD_W - 80 * 2 - colGap) / 2
  const rowH = 82
  allStops.forEach((s, i) => {
    const col = i % 2
    const x = 80 + col * (colW + colGap)
    const rowY = y + Math.floor(i / 2) * rowH
    if (rowY + rowH > CARD_H - 190) return
    const dotR = 22
    drawNumberedDot(ctx, i + 1, x + dotR, rowY + 26, dotR, s.type)
    ctx.fillStyle = C.name
    ctx.font = `30px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const textX = x + dotR * 2 + 16
    const textW = colW - dotR * 2 - 20
    ctx.fillText(truncateText(ctx, s.name || '未命名', textW), textX, rowY + 24)
    const trust = poiTrustLine(s.poiInfo, { includeOpenHours: true, max: 2, separator: ' / ' })
    if (trust) {
      ctx.fillStyle = C.note
      ctx.font = `22px ${FONT}`
      ctx.textBaseline = 'top'
      ctx.fillText(truncateText(ctx, trust, textW), textX, rowY + 44)
    }
  })
  const rows = Math.ceil(allStops.length / 2)
  y += rows * rowH + 24

  // ---- 类型图例 ----
  drawLegend(ctx, trip, Math.min(y, CARD_H - 130))

  drawFooter(ctx)
}

function drawPoiMapOverlay(
  ctx: CanvasRenderingContext2D,
  stops: Stop[],
  vp: MapViewport,
  mapImage: CanvasImageSource | null,
  box: { x: number; y: number; width: number; height: number },
): void {
  const located: PoiMapPoint[] = []
  const missing: Array<{ stop: Stop; seq: number }> = []

  stops.forEach((stop, index) => {
    const seq = index + 1
    if (stop.lat == null || stop.lng == null) {
      missing.push({ stop, seq })
      return
    }
    const p = projectLatLngOnCoveredMap(stop.lat, stop.lng, vp, box.width, box.height, mapImage)
    const x = box.x + p.x
    const y = box.y + p.y
    located.push({ stop, seq, x, y, drawX: x, drawY: y })
  })

  const points = spreadPoiPoints(located, box)
  drawPoiLeaders(ctx, points)
  points.forEach((point) => drawPoiMapDot(ctx, point))
  if (missing.length > 0) {
    drawMissingPoiPanel(ctx, missing, points, box)
  }
}

function drawPoiMapFallback(
  ctx: CanvasRenderingContext2D,
  stops: Stop[],
  box: { x: number; y: number; width: number; height: number },
): void {
  const points = syntheticPoiPoints(stops, box)
  if (points.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `34px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('（暂无可展示地点）', box.x + box.width / 2, box.y + box.height / 2)
    return
  }
  ctx.fillStyle = 'rgba(255,255,255,0.58)'
  ctx.fillRect(box.x, box.y, box.width, box.height)
  drawPoiMapNote(ctx, '未获取真实底图，以下为编号分布示意', box.x + 26, box.y + 24)
  points.forEach((point) => drawPoiMapDot(ctx, point))
}

function syntheticPoiPoints(
  stops: Stop[],
  box: { x: number; y: number; width: number; height: number },
): PoiMapPoint[] {
  const count = stops.length
  if (count === 0) return []
  const cols = Math.min(4, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / cols)
  const left = box.x + 96
  const right = box.x + box.width - 96
  const top = box.y + 120
  const bottom = box.y + box.height - 92
  return stops.map((stop, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = cols <= 1 ? box.x + box.width / 2 : left + ((right - left) * col) / (cols - 1)
    const y = rows <= 1 ? box.y + box.height / 2 : top + ((bottom - top) * row) / (rows - 1)
    return { stop, seq: index + 1, x, y, drawX: x, drawY: y }
  })
}

function spreadPoiPoints(
  points: PoiMapPoint[],
  box: { x: number; y: number; width: number; height: number },
): PoiMapPoint[] {
  const out = points.map((point) => ({ ...point }))
  const minGap = 64
  const margin = 34
  const maxMove = 92

  for (let iter = 0; iter < 58; iter++) {
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

function drawPoiLeaders(ctx: CanvasRenderingContext2D, points: PoiMapPoint[]): void {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(90,70,50,0.34)'
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

function drawPoiMapDot(ctx: CanvasRenderingContext2D, point: PoiMapPoint): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(point.drawX, point.drawY, 28, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  drawNumberedDot(ctx, point.seq, point.drawX, point.drawY, 22, point.stop.type)
  ctx.restore()
}

function drawMissingPoiPanel(
  ctx: CanvasRenderingContext2D,
  missing: Array<{ stop: Stop; seq: number }>,
  points: PoiMapPoint[],
  box: { x: number; y: number; width: number; height: number },
): void {
  const maxItems = Math.min(6, missing.length)
  const cols = missing.length > 3 ? 2 : 1
  const rows = Math.ceil(maxItems / cols)
  const colW = 204
  const panelW = Math.min(box.width - 40, cols * colW + 34)
  const panelH = 58 + rows * 38 + (missing.length > maxItems ? 34 : 12)
  const rect = chooseQuietCorner(panelW, panelH, points, box)

  ctx.save()
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(90,70,50,0.24)'
  ctx.stroke()

  ctx.fillStyle = C.primaryDark
  ctx.font = `bold 22px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`待定位 ${missing.length} 个`, rect.x + 18, rect.y + 28)

  missing.slice(0, maxItems).forEach((item, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const itemX = rect.x + 18 + col * colW
    const itemY = rect.y + 58 + row * 38
    drawNumberedDot(ctx, item.seq, itemX + 14, itemY + 14, 14, item.stop.type)
    ctx.fillStyle = C.note
    ctx.font = `20px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateText(ctx, item.stop.name || '未命名', colW - 42), itemX + 36, itemY + 14)
  })

  if (missing.length > maxItems) {
    ctx.fillStyle = C.note
    ctx.font = `20px ${FONT}`
    ctx.fillText(`+${missing.length - maxItems} 个地点见下方清单`, rect.x + 18, rect.y + rect.h - 20)
  }
  ctx.restore()
}

function chooseQuietCorner(
  w: number,
  h: number,
  points: PoiMapPoint[],
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const pad = 20
  const candidates = [
    { x: box.x + pad, y: box.y + pad, w, h },
    { x: box.x + box.width - w - pad, y: box.y + pad, w, h },
    { x: box.x + pad, y: box.y + box.height - h - pad, w, h },
    { x: box.x + box.width - w - pad, y: box.y + box.height - h - pad, w, h },
  ]
  let best = candidates[0]
  let bestScore = Number.NEGATIVE_INFINITY
  candidates.forEach((rect) => {
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const score = points.reduce((sum, point) => sum + Math.min(220, Math.hypot(point.drawX - cx, point.drawY - cy)), 0)
    if (score > bestScore) {
      bestScore = score
      best = rect
    }
  })
  return best
}

function drawPoiMapNote(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.save()
  ctx.font = `24px ${FONT}`
  const w = Math.min(520, ctx.measureText(text).width + 34)
  roundRect(ctx, x, y, w, 42, 21)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.fillStyle = C.note
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 17, y + 21)
  ctx.restore()
}

function usedTypes(trip: Trip): PoiType[] {
  // transit 不在图例显示（已从地图过滤）
  return POI_TYPE_ORDER.filter(
    (t) => t !== 'transit' && trip.days.some((d) => d.stops.some((s) => s.type === t)),
  )
}

function drawLegend(ctx: CanvasRenderingContext2D, trip: Trip, y: number): void {
  const types = usedTypes(trip)
  if (types.length === 0) return
  const itemW = 190
  const totalW = types.length * itemW
  let x = (CARD_W - totalW) / 2
  types.forEach((t) => {
    const h = 52
    const w = itemW - 20
    roundRect(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = POI_THEME[t].hex
    ctx.fill()
    ctx.fillStyle = textColorOn(POI_THEME[t].rgb)
    ctx.font = `28px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${poiIcon(t)} ${POI_LABEL[t]}`, x + 22, y + h / 2)
    x += itemW
  })
}
