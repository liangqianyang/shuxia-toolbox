import type { Trip, PoiType } from '@/types/travel'
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
import { projectLatLng } from './mapProject'

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
      let idx = 0
      for (const day of trip.days) {
        for (const s of day.stops) {
          if (s.lng == null || s.lat == null || !isVisitStop(s)) continue
          idx++
          const p = projectLatLng(s.lat, s.lng, vp, mapW, mapH)
          drawNumberedDot(ctx, idx, mapX + p.x, mapY + p.y, 22, s.type)
        }
      }
    }
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    ctx.fillStyle = C.note
    ctx.font = `34px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('（未获取坐标，仅显示清单）', CARD_W / 2, mapY + mapH / 2)
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
