import type { Trip, Stop } from '@/types/travel'
import { projectRoute } from '@/utils/routeProject'
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
  drawNumberedDot,
  truncateText,
  modeIcon,
  modeLabel,
  interStopModeIcon,
  interStopModeLabel,
  isVisitStop,
  poiTrustLine,
} from './theme'

/** DAY N 对应色（与 timelineCard 保持一致）*/
const DAY_COLORS = ['#F6A6A1', '#A8D5A2', '#9FC3F0', '#F3C98B', '#C9A8E0']
interface RouteMapPoint {
  stop: Stop
  dayIndex: number
  seq: number
  x: number
  y: number
  drawX: number
  drawY: number
}

interface LabelRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 路线规划图（1080×1440）。
 * variant='real'：腾讯 staticMap 真实底图。
 *   - 有跨城段（出发地→目的地，用户所选方式）：画「出发地→目的地」概览图 + 跨城段面板
 *     （方式/距离/时长），市内细节交给「景点分布图」「行程时间线」。
 *   - 无跨城段：全站 markers + 按天折线 + 下方站点清单。
 * variant='schematic'：routeProject 手绘示意（编号点 + 连线 + 跨城虚线）+ 站点清单。
 * variant='by-day'：按天分色地图（底图 + 编号点按天染色 + 每天区块清单）。
 */
export function renderRouteCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  variant: 'real' | 'schematic' | 'by-day',
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  if (variant === 'by-day') {
    renderByDayCard(ctx, trip, mapImage, bgImage)
    return
  }

  drawBackground(ctx, bgImage)
  // transit（跨城枢纽）不算景点：不编号、不进清单，与后端 staticMap markers 过滤一致
  const allStops = trip.days.flatMap((d) => d.stops).filter(isVisitStop)
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
    // 真实底图：跨城概览保留静态图标注；市内路线用前端叠加清晰编号点和连线。
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
    if (!isOverview) {
      drawGeoRouteOverlay(ctx, trip, { x: mapX, y: mapY, width: mapW, height: mapH }, false, mapImage)
    }
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
    ctx.fillText('抵达后市内景点分布见「景点分布图」，每日行程见「行程时间线」', CARD_W / 2, mapY + mapH + 24)
    drawOverviewTrustList(ctx, allStops, 80, mapY + mapH + 72, CARD_W - 160, CARD_H - 110)
    drawFooter(ctx)
    return
  }

  // ---- 站点清单（两行舒展：编号 + 地点名 + 下一站交通）----
  // 地图上每个点都要能在清单里对上号，故尽量列全；同时严格在落款上方收尾，绝不重叠。
  const listX = 80
  const rowH = 88
  const dotR = 20
  const nameX = listX + dotR * 2 + 18
  const listBottom = CARD_H - 96 // 给底部落款留足空间，避免最后一行压到「枫叶小屋·出行攻略」

  // 图例行：说明市内衔接是综合推荐，避免与跨城方式（如火车）混淆
  ctx.font = `24px ${FONT}`
  ctx.fillStyle = C.note
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('市内景点间综合推荐 🚶步行 / 🚴骑行 / 🚇地铁公交 / 🚕打车', CARD_W / 2, mapY + mapH + 16)

  let y = mapY + mapH + 58
  let shown = 0
  allStops.forEach((s, i) => {
    if (y + rowH > listBottom) return // 本行会越过落款区 → 停止
    const cy = y + 34
    drawNumberedDot(ctx, i + 1, listX + dotR, cy, dotR, s.type)

    // 名称（深色加粗，第一行独占，避免和交通说明互相挤压）
    ctx.fillStyle = C.name
    ctx.font = `bold 32px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, s.name || '未命名', CARD_W - 56 - nameX), nameX, y + 14)

    // 站间交通（第二行展示；「→」表示这是「去往下一站」的衔接段，而非本站属性）
    // 形如「→ 🚇 地铁 · 1号线 · 30分钟」；无自定义 detail 时用距离
    if (s.travelToNext) {
      const t = s.travelToNext
      const detail = t.detail ? t.detail.trim() : ''
      const dist = t.distanceM >= 1000 ? `${(t.distanceM / 1000).toFixed(1)}km` : `${t.distanceM}m`
      const mid = detail || dist
      const phrase = `→ ${interStopModeIcon(t.mode)} ${interStopModeLabel(t.mode)}${mid ? ' · ' + mid : ''} · ${t.durationMin}分钟`
      ctx.font = `24px ${FONT}`
      ctx.fillStyle = C.note
      ctx.fillText(truncateText(ctx, phrase, CARD_W - 56 - nameX), nameX, y + 52)
    } else {
      const trust = poiTrustLine(s.poiInfo, { max: 2, separator: ' / ' })
      if (trust) {
        ctx.font = `23px ${FONT}`
        ctx.fillStyle = C.note
        ctx.fillText(truncateText(ctx, trust, CARD_W - 56 - nameX), nameX, y + 52)
      }
    }
    if (i < allStops.length - 1) {
      ctx.strokeStyle = 'rgba(216,184,146,0.36)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(nameX, y + rowH - 8)
      ctx.lineTo(CARD_W - 72, y + rowH - 8)
      ctx.stroke()
    }
    y += rowH
    shown++
  })

  if (shown < allStops.length) {
    const more = allStops.length - shown
    if (y + 30 < listBottom) {
      ctx.font = `22px ${FONT}`
      ctx.fillStyle = C.note
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`+${more} 个地点见每日攻略海报`, nameX, y + 8)
    }
  }

  drawFooter(ctx)
}

/** 按天分色路线图：底图（或示意底）+ 每天编号点按 DAY_COLORS 染色 + 下方按天分色清单 */
function renderByDayCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null,
): void {
  drawBackground(ctx, bgImage)
  // 仅含有非 transit 站点的天才进分日图（避免某天只剩枢纽）
  const days = trip.days.filter((d) => d.stops.some(isVisitStop))

  const subtitleParts: string[] = []
  days.forEach((d, i) => {
    const tag = d.routeTag || `Day ${d.index}`
    const color = DAY_COLORS[i % DAY_COLORS.length]
    subtitleParts.push(`${tag}`)
    void color // 仅注释用途
  })
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : '按天分区游览'
  const bannerBottom = drawBanner(ctx, trip.title || '分日游览路线', subtitle, '📅')

  // ---- 地图区 ----
  const mapX = 64
  const mapY = bannerBottom + 28
  const mapW = CARD_W - mapX * 2
  const mapH = 480

  ctx.save()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.clip()
  if (mapImage) {
    drawImageCover(ctx, mapImage, mapX, mapY, mapW, mapH)
    // 叠加半透明蒙层，让按天色标注更清晰
    ctx.fillStyle = 'rgba(255, 252, 245, 0.16)'
    ctx.fillRect(mapX, mapY, mapW, mapH)
    drawGeoRouteOverlay(ctx, trip, { x: mapX, y: mapY, width: mapW, height: mapH }, true, mapImage)
  } else {
    ctx.fillStyle = C.panelSoft
    ctx.fillRect(mapX, mapY, mapW, mapH)
    // 示意图：按天分色连线 + 编号点
    drawByDaySchematic(ctx, trip, { x: mapX, y: mapY, width: mapW, height: mapH })
  }
  ctx.restore()
  roundRect(ctx, mapX, mapY, mapW, mapH, 36)
  ctx.lineWidth = 4
  ctx.strokeStyle = C.line
  ctx.stroke()

  // ---- 图例（地图右上角浮层）----
  if (days.length > 1) {
    drawDayLegend(ctx, days, mapX + mapW - 16, mapY + 16)
  }

  // ---- 按天分色清单 ----
  const listTop = mapY + mapH + 28
  const listBottom = CARD_H - 96
  const availH = listBottom - listTop
  const dayBlockH = Math.min(180, Math.floor((availH - (days.length - 1) * 16) / days.length))

  let y = listTop
  days.forEach((day, di) => {
    if (y + dayBlockH > listBottom) return
    const color = DAY_COLORS[di % DAY_COLORS.length]
    drawDayListBlock(ctx, day, di + 1, 64, y, CARD_W - 128, dayBlockH, color)
    y += dayBlockH + 16
  })

  drawFooter(ctx)
}

function drawGeoRouteOverlay(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  box: { x: number; y: number; width: number; height: number },
  byDay: boolean,
  mapImage: CanvasImageSource | null,
): void {
  const vp = trip.mapViewport
  if (!vp) return

  const rawStops: RouteMapPoint[] = []
  let seq = 0
  trip.days.forEach((day, di) => {
    day.stops.forEach((stop) => {
      if (stop.lng == null || stop.lat == null || !isVisitStop(stop)) return
      seq++
      const p = projectLatLngOnCoveredMap(stop.lat, stop.lng, vp, box.width, box.height, mapImage)
      const x = box.x + p.x
      const y = box.y + p.y
      rawStops.push({ stop, dayIndex: di, seq, x, y, drawX: x, drawY: y })
    })
  })
  if (rawStops.length === 0) return
  const allStops = spreadMapPoints(rawStops, box)

  drawMapLeaders(ctx, allStops)

  // 每天独立连线；先画白色描边，再画彩色线，保证压在真实地图上仍清楚。
  trip.days.forEach((day, di) => {
    const pts = allStops.filter((item) => item.dayIndex === di)
    if (pts.length < 2) return
    const color = byDay ? DAY_COLORS[di % DAY_COLORS.length] : '#C8956C'
    const displayPts = pts.map((p) => ({ x: p.drawX, y: p.drawY }))
    drawMapLine(ctx, displayPts, 'rgba(255,255,255,0.92)', 14)
    drawMapLine(ctx, displayPts, color, byDay ? 8 : 7)
  })

  if (byDay) {
    // 天与天之间的衔接用虚线，避免被误读成同一天连续路线。
    for (let i = 0; i < trip.days.length - 1; i++) {
      const cur = allStops.filter((item) => item.dayIndex === i)
      const next = allStops.filter((item) => item.dayIndex === i + 1)
      if (!cur.length || !next.length) continue
      const a = cur[cur.length - 1]
      const b = next[0]
      ctx.save()
      ctx.setLineDash([14, 12])
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(90,70,50,0.5)'
      ctx.beginPath()
      ctx.moveTo(a.drawX, a.drawY)
      ctx.lineTo(b.drawX, b.drawY)
      ctx.stroke()
      ctx.restore()
    }
  }

  allStops.forEach((item) => {
    const color = byDay ? DAY_COLORS[item.dayIndex % DAY_COLORS.length] : '#C8956C'
    drawMapDot(ctx, item.drawX, item.drawY, item.seq, color)
  })

  // 标签最后画。点多时只标关键点，全部名称仍可在下方清单按编号对应，避免地图右侧挤成一团。
  const usedLabels: LabelRect[] = []
  const labelItems = pickMapLabelItems(allStops, byDay, allStops.length > 8 ? 8 : 12)
  labelItems.forEach((item) => {
    const color = byDay ? DAY_COLORS[item.dayIndex % DAY_COLORS.length] : '#C8956C'
    drawMapLabel(ctx, item.stop.name || `地点${item.seq}`, item.drawX, item.drawY, box, color, usedLabels)
  })
}

function pickMapLabelItems(points: RouteMapPoint[], byDay: boolean, maxLabels: number): RouteMapPoint[] {
  if (points.length <= maxLabels) return points

  const selected = new Map<number, RouteMapPoint>()
  const add = (item?: RouteMapPoint) => {
    if (item) selected.set(item.seq, item)
  }

  add(points[0])
  add(points[points.length - 1])

  if (byDay) {
    const groups = new Map<number, RouteMapPoint[]>()
    points.forEach((item) => {
      const group = groups.get(item.dayIndex) ?? []
      group.push(item)
      groups.set(item.dayIndex, group)
    })
    groups.forEach((group) => {
      add(group[0])
      add(group[group.length - 1])
    })
  }

  for (let i = 0; selected.size < maxLabels && i < maxLabels; i++) {
    const idx = Math.round((i * (points.length - 1)) / Math.max(1, maxLabels - 1))
    add(points[idx])
  }

  return Array.from(selected.values())
    .sort((a, b) => a.seq - b.seq)
    .slice(0, maxLabels)
}

function spreadMapPoints(points: RouteMapPoint[], box: { x: number; y: number; width: number; height: number }): RouteMapPoint[] {
  const out = points.map((p) => ({ ...p }))
  const minGap = 68
  const margin = 34
  const maxMove = 118
  for (let iter = 0; iter < 70; iter++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        let dx = b.drawX - a.drawX
        let dy = b.drawY - a.drawY
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= minGap) continue
        if (dist < 0.01) {
          const angle = (i * 2.399 + j * 0.73) % (Math.PI * 2)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }
        const push = (minGap - dist) * 0.5
        const ux = dx / dist
        const uy = dy / dist
        a.drawX -= ux * push
        a.drawY -= uy * push
        b.drawX += ux * push
        b.drawY += uy * push
      }
    }
    out.forEach((p) => {
      limitPointMove(p, maxMove)
      p.drawX = Math.max(box.x + margin, Math.min(box.x + box.width - margin, p.drawX))
      p.drawY = Math.max(box.y + margin, Math.min(box.y + box.height - margin, p.drawY))
    })
  }
  return out
}

function limitPointMove(p: RouteMapPoint, maxMove: number): void {
  const dx = p.drawX - p.x
  const dy = p.drawY - p.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= maxMove || dist < 0.01) return
  const scale = maxMove / dist
  p.drawX = p.x + dx * scale
  p.drawY = p.y + dy * scale
}

function drawMapLeaders(ctx: CanvasRenderingContext2D, points: RouteMapPoint[]): void {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(90,70,50,0.38)'
  ctx.setLineDash([8, 8])
  points.forEach((p) => {
    const dx = p.drawX - p.x
    const dy = p.drawY - p.y
    if (Math.sqrt(dx * dx + dy * dy) < 14) return
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.drawX, p.drawY)
    ctx.stroke()
  })
  ctx.restore()
}

function drawMapLine(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  width: number,
): void {
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

function drawMapDot(ctx: CanvasRenderingContext2D, x: number, y: number, seq: number, color: string): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 28, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, 21, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${seq >= 10 ? 22 : 26}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(seq), x, y + 1)
  ctx.restore()
}

function drawMapLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  box: { x: number; y: number; width: number; height: number },
  color: string,
  used: LabelRect[],
): void {
  ctx.save()
  ctx.font = `bold 23px ${FONT}`
  const text = truncateText(ctx, name, 150)
  const tw = ctx.measureText(text).width
  const w = tw + 22
  const h = 34
  const rect = chooseLabelRect({ x, y, w, h }, box, used)
  used.push(rect)

  const lineEndX = rect.x > x ? rect.x : rect.x + rect.w
  const lineEndY = Math.max(rect.y + 8, Math.min(rect.y + rect.h - 8, y))
  if (Math.abs(lineEndX - x) > 30 || Math.abs(lineEndY - y) > 22) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(lineEndX, lineEndY)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(90,70,50,0.34)'
    ctx.stroke()
  }

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

function chooseLabelRect(
  anchor: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; width: number; height: number },
  used: LabelRect[],
): LabelRect {
  const preferLeft = anchor.x > box.x + box.width * 0.58
  const sideOrder = preferLeft ? ['left', 'right', 'bottom', 'top'] : ['right', 'left', 'bottom', 'top']
  const offsets = [0, -42, 42, -84, 84, -126, 126]
  const candidates: LabelRect[] = []

  sideOrder.forEach((side) => {
    offsets.forEach((offset) => {
      let x = anchor.x + 34
      let y = anchor.y - anchor.h / 2 + offset
      if (side === 'left') {
        x = anchor.x - anchor.w - 34
      } else if (side === 'bottom') {
        x = anchor.x - anchor.w / 2 + offset * 0.45
        y = anchor.y + 38
      } else if (side === 'top') {
        x = anchor.x - anchor.w / 2 + offset * 0.45
        y = anchor.y - anchor.h - 38
      }
      candidates.push(clampLabelRect({ x, y, w: anchor.w, h: anchor.h }, box))
    })
  })

  let best = candidates[0]
  let bestScore = Number.POSITIVE_INFINITY
  candidates.forEach((candidate) => {
    const overlap = used.reduce((sum, old) => sum + rectOverlapArea(candidate, old), 0)
    const cx = candidate.x + candidate.w / 2
    const cy = candidate.y + candidate.h / 2
    const distance = Math.hypot(cx - anchor.x, cy - anchor.y)
    const score = overlap * 80 + distance
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  })
  return best
}

function clampLabelRect(rect: LabelRect, box: { x: number; y: number; width: number; height: number }): LabelRect {
  const pad = 8
  return {
    ...rect,
    x: Math.max(box.x + pad, Math.min(box.x + box.width - rect.w - pad, rect.x)),
    y: Math.max(box.y + pad, Math.min(box.y + box.height - rect.h - pad, rect.y)),
  }
}

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  const gap = 6
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function rectOverlapArea(a: LabelRect, b: LabelRect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return x * y
}

/** 按天分色示意图（无底图兜底）：每天一种颜色，连线 + 编号点 */
function drawByDaySchematic(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  box: { x: number; y: number; width: number; height: number },
): void {
  // 过滤 transit，并同步建立 站点→所属 day 的索引（两者下标必须对齐）
  const allStops: Stop[] = []
  const stopDayIdx: number[] = []
  trip.days.forEach((d, di) => {
    d.stops.forEach((s) => {
      if (isVisitStop(s)) {
        stopDayIdx.push(di)
        allStops.push(s)
      }
    })
  })
  const proj = projectRoute(allStops, box, { padding: 0.12 })

  proj.segments.forEach((seg, si) => {
    const di = stopDayIdx[seg.points[0]?.stopIndex ?? 0] ?? 0
    const color = DAY_COLORS[di % DAY_COLORS.length]
    ctx.lineWidth = 6
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    ctx.beginPath()
    seg.points.forEach((p, pi) => (pi === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    // 天间跨段虚线
    if (si < proj.segments.length - 1) {
      const last = seg.points[seg.points.length - 1]
      const next = proj.segments[si + 1].points[0]
      ctx.setLineDash([14, 12])
      ctx.strokeStyle = C.line
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(next.x, next.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  })

  proj.segments.forEach((seg) => {
    seg.points.forEach((p) => {
      const stop = allStops[p.stopIndex]
      const di = stopDayIdx[p.stopIndex] ?? 0
      const color = DAY_COLORS[di % DAY_COLORS.length]
      // 带颜色圆点
      ctx.beginPath()
      ctx.arc(p.x, p.y, 26, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.fillStyle = '#5A3B1E'
      ctx.font = `bold 26px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.stopIndex + 1), p.x, p.y)
      // 名称标签
      ctx.fillStyle = C.name
      ctx.font = `bold 28px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const label = truncateText(ctx, stop?.name || '', 160)
      ctx.lineWidth = 5
      ctx.strokeStyle = C.panelSoft
      ctx.strokeText(label, p.x + 34, p.y)
      ctx.fillText(label, p.x + 34, p.y)
    })
  })
}

/** 地图右上角图例：Day 1 ● / Day 2 ● 等小胶囊 */
function drawDayLegend(
  ctx: CanvasRenderingContext2D,
  days: Trip['days'],
  rightX: number,
  topY: number,
): void {
  const itemH = 40
  const padX = 16
  const gap = 8

  let y = topY
  days.forEach((day, di) => {
    const color = DAY_COLORS[di % DAY_COLORS.length]
    const tag = day.routeTag || `Day ${day.index}`
    ctx.font = `bold 26px ${FONT}`
    const tw = ctx.measureText(tag).width
    const pillW = tw + padX * 2 + 28 + 8 // 28 = dot space
    const x = rightX - pillW

    roundRect(ctx, x, y, pillW, itemH, itemH / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.stroke()

    // 彩色圆点
    ctx.beginPath()
    ctx.arc(x + padX + 10, y + itemH / 2, 8, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    ctx.fillStyle = C.primaryDark
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(tag, x + padX + 28, y + itemH / 2)

    y += itemH + gap
  })
}

/** 单天清单区块：彩色左侧标识 + 站点行 */
function drawDayListBlock(
  ctx: CanvasRenderingContext2D,
  day: Trip['days'][0],
  di: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  roundRect(ctx, x, y, w, h, 20)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color + '88'
  ctx.stroke()

  // 左侧色块
  const sideW = 100
  ctx.save()
  roundRect(ctx, x, y, sideW, h, 20)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(x, y, sideW, h)
  ctx.restore()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`DAY`, x + sideW / 2, y + h / 2 - 18)
  ctx.font = `bold 52px ${FONT}`
  ctx.fillText(String(di), x + sideW / 2, y + h / 2 + 18)

  // 站点名列表（横排，超出省略）—— transit 枢纽不显示
  const stopsX = x + sideW + 20
  const stopsW = w - sideW - 36
  const allDayStops = day.stops.filter(isVisitStop)
  const stops = allDayStops.slice(0, 5)
  const slot = stops.length > 0 ? Math.min(180, Math.floor(stopsW / stops.length)) : stopsW

  stops.forEach((s, i) => {
    const sx = stopsX + slot * i
    const cy = y + h / 2
    // 彩色编号圆
    ctx.beginPath()
    ctx.arc(sx + 18, cy - 16, 16, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold 20px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), sx + 18, cy - 16)
    // 名称
    ctx.fillStyle = C.name
    ctx.font = `26px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, s.name || '', slot - 8), sx + 4, cy + 4)
    const trust = poiTrustLine(s.poiInfo, { max: 2, separator: ' / ' })
    if (trust) {
      ctx.fillStyle = C.note
      ctx.font = `20px ${FONT}`
      ctx.fillText(truncateText(ctx, trust, slot - 8), sx + 4, cy + 36)
    }
  })
  if (allDayStops.length > 5) {
    const moreX = stopsX + slot * 5
    ctx.fillStyle = C.note
    ctx.font = `26px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${allDayStops.length - 5}`, moreX, y + h / 2)
  }
}

function drawOverviewTrustList(
  ctx: CanvasRenderingContext2D,
  stops: Stop[],
  x: number,
  y: number,
  w: number,
  bottomY: number,
): void {
  const rows = stops
    .map((stop, index) => ({ stop, index, trust: poiTrustLine(stop.poiInfo, { max: 3 }) }))
    .filter((item) => item.trust)
    .slice(0, 4)
  if (rows.length === 0 || y + 48 > bottomY) return

  ctx.fillStyle = C.primaryDark
  ctx.font = `bold 28px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('市内关键提醒', x, y)

  let rowY = y + 42
  const rowH = 48
  for (const item of rows) {
    if (rowY + rowH > bottomY) return
    drawNumberedDot(ctx, item.index + 1, x + 20, rowY + 22, 18, item.stop.type)
    ctx.font = `bold 26px ${FONT}`
    ctx.fillStyle = C.name
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const nameX = x + 52
    const name = truncateText(ctx, item.stop.name || '未命名', w * 0.34)
    ctx.fillText(name, nameX, rowY + 22)
    const nameW = ctx.measureText(name).width
    ctx.font = `24px ${FONT}`
    ctx.fillStyle = C.note
    const trustX = nameX + nameW + 18
    const trustW = x + w - trustX
    if (trustW > 20) {
      ctx.fillText(truncateText(ctx, item.trust, trustW), trustX, rowY + 22)
    }
    rowY += rowH
  }
}

/**
 * 跨城段面板：大字「出发地 → 目的地」+ 副行「方式 · 约距离 · 约时长」。
 * 返回面板底部 y（含下间距），供后续内容接着排。
 */
function drawIntercityPanel(
  ctx: CanvasRenderingContext2D,
  ic: { from: string; to: string; mode: string; distanceM: number; durationMin: number; roundTrip: boolean; note?: string },
  x: number,
  y: number,
  w: number,
): number {
  const note = ic.note ? ic.note.trim() : ''
  const h = note ? 172 : 128
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

  // AI/手动备注（如「建议合肥南出发，提前购票」），有才画，面板高度随之自适应
  if (note) {
    ctx.font = `24px ${FONT}`
    ctx.fillStyle = C.note
    ctx.fillText(truncateText(ctx, note, w - 56), x + w / 2, y + 128)
  }

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
