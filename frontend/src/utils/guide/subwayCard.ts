import type { Trip } from '@/types/travel'
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
  poiIcon,
} from './theme'

/**
 * 地铁线路图卡片（1080×1440）。
 *
 * 设计哲学：
 * 不依赖真实地铁数据库，而是把行程的路线主题（routeTag / Day N）直接映射为「地铁线路」，
 * 用地铁图的视觉语言（彩色横线、圆形站点、换乘大圆、线路号徽标、站名斜排）
 * 直观展示"哪天在哪里玩"的空间关系，让人一眼看出行程的线路格局。
 *
 * 布局：
 *  - 顶部横幅
 *  - 中部地铁图区（每条线路一行，横向站点串）
 *  - 底部贴士条（trip.tips 前 3 条）
 *
 * 换乘站：同一景点名出现在多条线路时，标记为双环换乘站，视觉上模拟地铁换乘节点。
 */
export function renderSubwayCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  _mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
): void {
  // 地铁图使用浅灰暖白背景，营造地铁图纸质感
  if (bgImage) {
    drawBackground(ctx, bgImage)
  } else {
    drawSubwayBackground(ctx)
  }

  const bannerBottom = drawBanner(ctx, trip.title || '地铁游览线路图', '坐地铁 玩转全城', '🚇')

  const lines = buildSubwayLines(trip)
  if (lines.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无行程', CARD_W / 2, CARD_H / 2)
    drawFooter(ctx)
    return
  }

  const transferNames = detectTransfers(lines)

  // ---- 布局分区 ----
  const diagramTop = bannerBottom + 32
  const tipsH = trip.tips && trip.tips.length > 0 ? 160 : 0
  const footerH = 80
  const diagramBottom = CARD_H - footerH - tipsH - 20
  const diagramH = diagramBottom - diagramTop

  // 每条线路占用等高槽位
  const slotH = Math.floor(diagramH / lines.length)

  // ---- 绘制每条线路 ----
  lines.forEach((line, li) => {
    const slotTop = diagramTop + li * slotH
    drawSubwayLine(ctx, line, li, slotTop, slotH, transferNames)
  })

  // ---- 底部贴士条 ----
  if (tipsH > 0) {
    drawTipsBar(ctx, trip.tips ?? [], CARD_H - footerH - tipsH - 10, CARD_W, tipsH)
  }

  drawFooter(ctx)
}

// ────────────────────────────────────────────────────────────────────────────
// 数据结构
// ────────────────────────────────────────────────────────────────────────────

const LINE_COLORS = [
  '#E13333', // 1号线 红
  '#2F80D2', // 2号线 蓝
  '#4DB848', // 3号线 绿
  '#F5A623', // 4号线 橙
  '#9B59B6', // 5号线 紫
  '#1BBC9B', // 6号线 青
  '#D4AC0D', // 7号线 金
]

interface SubwayLine {
  number: number    // 线路编号（1-based）
  tag: string       // 显示名（routeTag 或 "Day N"）
  color: string
  stops: StopEntry[]
  dayNumbers: number[]
}

interface StopEntry {
  name: string
  type: Trip['days'][0]['stops'][0]['type']
  time: string
  note: string
}

function buildSubwayLines(trip: Trip): SubwayLine[] {
  const map = new Map<string, SubwayLine>()
  let lineNum = 1

  trip.days.forEach((day) => {
    const tag = day.routeTag?.trim() || `Day ${day.index}`
    if (!map.has(tag)) {
      map.set(tag, {
        number: lineNum++,
        tag,
        color: LINE_COLORS[(map.size) % LINE_COLORS.length],
        stops: [],
        dayNumbers: [],
      })
    }
    const line = map.get(tag)!
    if (!line.dayNumbers.includes(day.index)) line.dayNumbers.push(day.index)
    day.stops.forEach((s) => {
      // 同线路内去重（同名站只保留第一次）
      if (!line.stops.some((e) => e.name === s.name)) {
        line.stops.push({ name: s.name, type: s.type, time: s.time, note: s.note })
      }
    })
  })

  return Array.from(map.values())
}

/** 找出多条线路共享同名景点（换乘站） */
function detectTransfers(lines: SubwayLine[]): Set<string> {
  const count = new Map<string, number>()
  lines.forEach((l) => l.stops.forEach((s) => count.set(s.name, (count.get(s.name) ?? 0) + 1)))
  const transfers = new Set<string>()
  count.forEach((n, name) => { if (n > 1) transfers.add(name) })
  return transfers
}

// ────────────────────────────────────────────────────────────────────────────
// 绘制函数
// ────────────────────────────────────────────────────────────────────────────

/** 地铁图专属背景：浅暖白 + 淡网格线（营造地图纸质感） */
function drawSubwayBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#FAF7F2'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // 浅网格
  ctx.strokeStyle = 'rgba(200,180,160,0.18)'
  ctx.lineWidth = 1
  const step = 60
  for (let x = 0; x < CARD_W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CARD_H); ctx.stroke()
  }
  for (let y = 0; y < CARD_H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CARD_W, y); ctx.stroke()
  }
}

/** 单条线路：线路号徽标 + 横轨 + 站点节点 + 站名 */
function drawSubwayLine(
  ctx: CanvasRenderingContext2D,
  line: SubwayLine,
  _li: number,
  slotTop: number,
  slotH: number,
  transferNames: Set<string>,
): void {
  const railY = slotTop + slotH * 0.42       // 轨道中心线
  const badgeR = 32                           // 线路号圆圈半径
  const badgeX = 56 + badgeR                 // 圆心 x
  const railStartX = badgeX + badgeR + 20    // 轨道起始
  const railEndX = CARD_W - 56              // 轨道终止

  // ---- 横轨 ----
  ctx.strokeStyle = line.color
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(railStartX, railY)
  ctx.lineTo(railEndX, railY)
  ctx.stroke()

  // ---- 线路号徽标（圆） ----
  ctx.beginPath()
  ctx.arc(badgeX, railY, badgeR, 0, Math.PI * 2)
  ctx.fillStyle = line.color
  ctx.fill()
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(line.number), badgeX, railY - 2)

  // 线路名（徽标下方）
  ctx.fillStyle = line.color
  ctx.font = `bold 22px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const shortTag = line.tag.length > 5 ? line.tag.slice(0, 5) + '…' : line.tag
  ctx.fillText(shortTag, badgeX, railY + badgeR + 6)

  // ---- 站点 ----
  const n = line.stops.length
  if (n === 0) return

  const stationSpan = railEndX - railStartX
  const stationGap = Math.floor(stationSpan / Math.max(n - 1, 1))
  const dotR = 20
  const transferR = 28

  line.stops.forEach((stop, i) => {
    const sx = n === 1 ? (railStartX + railEndX) / 2 : railStartX + i * stationGap
    const isTransfer = transferNames.has(stop.name)
    const r = isTransfer ? transferR : dotR

    // 站点圆（白芯 + 线路色描边，换乘站更大 + 双环）
    ctx.beginPath()
    ctx.arc(sx, railY, r, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = line.color
    ctx.lineWidth = isTransfer ? 6 : 4
    ctx.stroke()

    if (isTransfer) {
      // 换乘站：外层细环
      ctx.beginPath()
      ctx.arc(sx, railY, r + 7, 0, Math.PI * 2)
      ctx.strokeStyle = line.color + '55'
      ctx.lineWidth = 3
      ctx.stroke()
      // 换乘标记文字
      ctx.fillStyle = line.color
      ctx.font = `bold 18px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('换', sx, railY)
    } else {
      // 普通站：POI 类型 emoji
      ctx.font = `22px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(poiIcon(stop.type), sx, railY)
    }

    // 站名（奇偶交替上下显示，避免密集叠字）
    const nameAbove = i % 2 === 0
    const nameY = nameAbove ? railY - r - 10 : railY + r + 10
    const nameAnchor = nameAbove ? 'bottom' : 'top'

    ctx.fillStyle = '#2C1E0F'
    ctx.font = `bold 24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = nameAnchor as CanvasTextBaseline

    // 最大宽度：相邻站间距 - 4px 余量
    const maxNameW = Math.max(60, stationGap - 4)
    ctx.fillText(truncateText(ctx, stop.name, maxNameW), sx, nameY)

    // 时间小字（站名下一行，仅有时间时显示）
    if (stop.time) {
      const timeAnchor = nameAbove ? 'bottom' : 'top'
      const lineH = 28
      const timeY = nameAbove ? nameY - lineH : nameY + lineH
      ctx.fillStyle = line.color
      ctx.font = `20px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = timeAnchor as CanvasTextBaseline
      ctx.fillText(stop.time.split('-')[0]?.trim() || stop.time, sx, timeY)
    }
  })

  // ---- 首尾站端盖（半圆收尾，模拟真实线路图起终点）----
  if (n >= 1) {
    const firstX = n === 1 ? (railStartX + railEndX) / 2 : railStartX
    const lastX = n === 1 ? (railStartX + railEndX) / 2 : railStartX + (n - 1) * stationGap
    // 起点端盖
    ctx.beginPath()
    ctx.arc(firstX, railY, 6, Math.PI / 2, (Math.PI * 3) / 2)
    ctx.fillStyle = line.color
    ctx.fill()
    // 终点端盖
    ctx.beginPath()
    ctx.arc(lastX, railY, 6, -Math.PI / 2, Math.PI / 2)
    ctx.fillStyle = line.color
    ctx.fill()
  }

  // ---- 线路副标签（显示覆盖的天，如 Day1+Day2）----
  const dayStr = line.dayNumbers.map((d) => `Day${d}`).join('+')
  const tagX = badgeX
  const tagY = railY - badgeR - 24
  if (tagY > slotTop + 8) {
    ctx.fillStyle = '#8B7355'
    ctx.font = `22px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(dayStr, tagX, tagY)
  }
}

/** 底部贴士条：淡色圆角面板 + 最多 3 条贴士 */
function drawTipsBar(
  ctx: CanvasRenderingContext2D,
  tips: string[],
  y: number,
  w: number,
  h: number,
): void {
  const padX = 56
  const panelX = padX
  const panelW = w - padX * 2

  roundRect(ctx, panelX, y, panelW, h, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.stroke()

  // 标题行
  ctx.fillStyle = C.primary
  ctx.font = `bold 28px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('💡 出行小贴士', panelX + 20, y + 14)

  // 贴士列表（最多 3 条，按面板高度裁）
  const visCount = Math.min(3, tips.length)
  const itemH = Math.floor((h - 56) / Math.max(visCount, 1))
  for (let i = 0; i < visCount; i++) {
    const ty = y + 50 + i * itemH
    ctx.fillStyle = C.note
    ctx.font = `24px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(
      truncateText(ctx, `· ${tips[i]}`, panelW - 40),
      panelX + 20,
      ty,
    )
  }
}
