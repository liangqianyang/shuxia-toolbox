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
} from './theme'

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

  const allStops = trip.days.flatMap((d) => d.stops)

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
  const rowH = 62
  allStops.forEach((s, i) => {
    const col = i % 2
    const x = 80 + col * (colW + colGap)
    const rowY = y + Math.floor(i / 2) * rowH
    if (rowY > CARD_H - 200) return
    const dotR = 22
    drawNumberedDot(ctx, i + 1, x + dotR, rowY + dotR, dotR, s.type)
    ctx.fillStyle = C.name
    ctx.font = `32px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateText(ctx, s.name || '未命名', colW - dotR * 2 - 20), x + dotR * 2 + 16, rowY + dotR)
  })
  const rows = Math.ceil(allStops.length / 2)
  y += rows * rowH + 24

  // ---- 类型图例 ----
  drawLegend(ctx, trip, Math.min(y, CARD_H - 130))

  drawFooter(ctx)
}

function usedTypes(trip: Trip): PoiType[] {
  return POI_TYPE_ORDER.filter((t) => trip.days.some((d) => d.stops.some((s) => s.type === t)))
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
