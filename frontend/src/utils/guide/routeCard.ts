import type { Trip } from '@/types/travel'
import { projectRoute } from '@/utils/routeProject'
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
  modeIcon,
  modeLabel,
} from './theme'

/**
 * 路线规划图（1080×1440）。
 * variant='real'：腾讯 staticMap 真实底图。
 *   - 有跨城段（出发地→目的地，用户所选方式）：画「出发地→目的地」概览图 + 跨城段面板
 *     （方式/距离/时长），市内细节交给「景点分布图」「行程时间线」。
 *   - 无跨城段：全站 markers + 按天折线 + 下方站点清单。
 * variant='schematic'：routeProject 手绘示意（编号点 + 连线 + 跨城虚线）+ 站点清单。
 */
export function renderRouteCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  variant: 'real' | 'schematic',
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)
  const allStops = trip.days.flatMap((d) => d.stops)
  const intercity = trip.intercity ?? null
  const isOverview = variant === 'real' && intercity !== null
  const subtitle = intercity
    ? `${intercity.from} → ${intercity.to}`
    : trip.origin
      ? `${trip.origin} 出发 · 不走回头路`
      : '经典路线 · 不走回头路'
  const bannerBottom = drawBanner(ctx, trip.title || '路线规划', subtitle, intercity ? modeIcon(intercity.mode) : '🗺️')

  let cursorY = bannerBottom + 28

  // 跨城段面板（仅真实图 + 有跨城信息）
  if (isOverview) {
    cursorY = drawIntercityPanel(ctx, intercity, 64, cursorY, CARD_W - 128)
  }

  // ---- 地图区 ----
  const mapX = 64
  const mapY = cursorY
  const mapW = CARD_W - mapX * 2
  const mapH = isOverview ? 560 : 480

  ctx.save()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.clip()
  if (mapImage) {
    // 真实底图：真实图/概览图/市内路线图（编号点+连线均由腾讯 staticmap 画好，无需叠加）
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
  } else {
    // 无底图兜底：示意底 + routeProject 投影（编号点 + 连线 + 名称）
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawSchematic(ctx, allStops, { x: mapX, y: mapY, width: mapW, height: mapH })
  }
  ctx.restore()
  // 地图区描边框
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.lineWidth = 4
  ctx.strokeStyle = C.line
  ctx.stroke()

  // 概览卡：市内细节交给其它卡片，这里只给一句提示后收尾
  if (isOverview) {
    ctx.fillStyle = C.note
    ctx.font = `28px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('抵达后市内景点分布见「景点分布图」，每日行程见「行程时间线」', CARD_W / 2, mapY + mapH + 28)
    drawFooter(ctx)
    return
  }

  // ---- 站点清单（紧凑单行：编号 + 名称 + 站间交通）----
  // 地图上每个点都要能在清单里对上号，故尽量列全；同时严格在落款上方收尾，绝不重叠。
  const listX = 80
  const rowH = 48
  const dotR = 20
  const nameX = listX + dotR * 2 + 18
  const listBottom = CARD_H - 96 // 给底部落款留足空间，避免最后一行压到「枫叶小屋·出行攻略」
  let y = mapY + mapH + 34
  allStops.forEach((s, i) => {
    if (y + rowH > listBottom) return // 本行会越过落款区 → 停止
    const cy = y + rowH / 2
    drawNumberedDot(ctx, i + 1, listX + dotR, cy, dotR, s.type)

    // 名称（深色加粗，优先保证可读，限宽 ~60%）
    ctx.fillStyle = C.name
    ctx.font = `bold 34px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const name = truncateText(ctx, s.name || '未命名', (CARD_W - nameX - 56) * 0.62)
    ctx.fillText(name, nameX, cy)
    // ⚠️ 必须在还是 34px 时量名称宽度，否则换小字后会量窄、把交通文案画到名称上
    const nameW = ctx.measureText(name).width

    // 站间交通（浅色小字，紧接名称后；「→」表示这是「去往下一站」的衔接段，而非本站属性）
    if (s.travelToNext) {
      const t = s.travelToNext
      const dist = t.distanceM >= 1000 ? `${(t.distanceM / 1000).toFixed(1)}km` : `${t.distanceM}m`
      const phrase = `→ ${modeIcon(t.mode)} ${t.durationMin}分钟·${dist}`
      ctx.font = `26px ${FONT}`
      ctx.fillStyle = C.note
      const cx = nameX + nameW + 12
      ctx.fillText(truncateText(ctx, phrase, CARD_W - 56 - cx), cx, cy)
    }
    y += rowH
  })

  drawFooter(ctx)
}

/**
 * 跨城段面板：大字「出发地 → 目的地」+ 副行「方式 · 约距离 · 约时长」。
 * 返回面板底部 y（含下间距），供后续内容接着排。
 */
function drawIntercityPanel(
  ctx: CanvasRenderingContext2D,
  ic: { from: string; to: string; mode: string; distanceM: number; durationMin: number; roundTrip: boolean },
  x: number,
  y: number,
  w: number,
): number {
  const h = 128
  roundRect(ctx, x, y, w, h, 28)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = C.banner
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.name
  ctx.font = `bold 46px ${FONT}`
  ctx.fillText(`${ic.from}  ${ic.roundTrip ? '⇄' : '→'}  ${ic.to}`, x + w / 2, y + 20)

  const dist = ic.distanceM >= 1000 ? `${Math.round(ic.distanceM / 1000)} 公里` : `${ic.distanceM} 米`
  const dur =
    ic.durationMin >= 60
      ? `${Math.floor(ic.durationMin / 60)} 小时${ic.durationMin % 60 ? (ic.durationMin % 60) + ' 分' : ''}`
      : `${ic.durationMin} 分钟`
  ctx.font = `30px ${FONT}`
  ctx.fillStyle = C.primary
  // 往返时强调是「单程」时长，避免被当成全程
  const durLabel = ic.roundTrip ? `单程约 ${dur}` : `约 ${dur}`
  ctx.fillText(`${modeIcon(ic.mode)} ${modeLabel(ic.mode)} · 约 ${dist} · ${durLabel}`, x + w / 2, y + 80)

  return y + h + 24
}

/** 示意投影：连线 + 编号点，复用 routeProject（含跨城分段/降级） */
function drawSchematic(
  ctx: CanvasRenderingContext2D,
  stops: {
    id: string
    name: string
    lng: number | null
    lat: number | null
    type: import('@/types/travel').PoiType
  }[],
  box: { x: number; y: number; width: number; height: number },
): void {
  const proj = projectRoute(stops, box, { padding: 0.12 })

  ctx.lineWidth = 6
  ctx.strokeStyle = C.line
  ctx.lineCap = 'round'
  proj.segments.forEach((seg, si) => {
    ctx.setLineDash([])
    ctx.beginPath()
    seg.points.forEach((p, pi) => (pi === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    if (si < proj.segments.length - 1) {
      const last = seg.points[seg.points.length - 1]
      const next = proj.segments[si + 1].points[0]
      ctx.setLineDash([14, 12])
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(next.x, next.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  })

  const allPts = proj.segments.flatMap((s) => s.points)
  proj.segments.forEach((seg) => {
    seg.points.forEach((p) => {
      const stop = stops[p.stopIndex]
      drawNumberedDot(ctx, p.stopIndex + 1, p.x, p.y, 28, stop.type)
      // 标签宽度按「到最近点的水平距离」收口（留 30px 间隔），避免相邻点名称互相重叠
      let minDx = Infinity
      for (const q of allPts) {
        if (q !== p) {
          const dx = Math.abs(q.x - p.x)
          if (dx < minDx) minDx = dx
        }
      }
      const maxLabelW = Math.min(200, Math.max(36, minDx - 30))
      ctx.fillStyle = C.name
      ctx.font = `bold 30px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const label = truncateText(ctx, stop.name || '', maxLabelW)
      // 白描边保证压在示意底上可读
      ctx.lineWidth = 5
      ctx.strokeStyle = C.panelSoft
      ctx.strokeText(label, p.x + 36, p.y)
      ctx.fillText(label, p.x + 36, p.y)
    })
  })
}
