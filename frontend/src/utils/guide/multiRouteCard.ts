import type { Trip } from '@/types/travel'
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
} from './theme'

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
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    ctx.fillStyle = C.note
    ctx.font = `32px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('（地图需生成后加载）', CARD_W / 2, mapY + mapH / 2)
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
    day.stops.forEach((stop) => g.items.push({ stop, dayIndex: day.index }))
  })

  return Array.from(map.values())
}

// ---- 绘制子函数 ----

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
