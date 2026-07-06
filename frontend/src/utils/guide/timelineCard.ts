import type { Trip, Day } from '@/types/travel'
import {
  CARD_W,
  CARD_H,
  C,
  FONT,
  roundRect,
  drawBackground,
  drawBanner,
  drawFooter,
  drawNumberedDot,
  truncateText,
  poiIcon,
  modeIcon,
  wrapText,
} from './theme'

/** 每天条带背景色 */
const DAY_COLORS = ['#F6A6A1', '#A8D5A2', '#9FC3F0', '#F3C98B', '#C9A8E0']

/**
 * 行程时间线图（1080×1440）：竖向时间线，每天独立色块。
 * 节点 = 时间点（左）+ 类型图标 + 名称（右）；节点间 = 交通图标。
 * 自动适配天数和站点数，超出范围时优先保证每天至少显示标题行。
 */
export function renderTimelineCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)
  const bannerBottom = drawBanner(ctx, trip.title || '行程时间线', '照着玩就对了', '🗓️')

  const days = trip.days.filter((d) => d.stops.length > 0)
  if (days.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无行程', CARD_W / 2, CARD_H / 2)
    drawFooter(ctx)
    return
  }

  const top = bannerBottom + 36
  const bottom = CARD_H - 90
  const gap = 20

  // 总可用高度按天数均分
  const bandH = Math.min(320, Math.floor((bottom - top - gap * (days.length - 1)) / days.length))

  let y = top
  days.forEach((day, di) => {
    drawDayBand(ctx, day, y, bandH, DAY_COLORS[di % DAY_COLORS.length])
    y += bandH + gap
  })

  drawFooter(ctx)
}

/** 绘制单天横向条带：DAY N 标识 + 竖向时间节点串 */
function drawDayBand(
  ctx: CanvasRenderingContext2D,
  day: Day,
  y: number,
  h: number,
  color: string,
): void {
  const x = 48
  const w = CARD_W - x * 2

  // 条带底 + 彩色描边
  roundRect(ctx, x, y, w, h, 28)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.stroke()

  // ---- 左侧 DAY N 徽标 ----
  const badgeW = 150
  ctx.save()
  roundRect(ctx, x, y, badgeW, h, 28)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(x, y, badgeW, h)
  ctx.restore()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 44px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('DAY', x + badgeW / 2, y + h / 2 - 26)
  ctx.font = `bold 66px ${FONT}`
  ctx.fillText(String(day.index), x + badgeW / 2, y + h / 2 + 26)
  if (day.title) {
    ctx.font = `22px ${FONT}`
    ctx.fillText(truncateText(ctx, day.title, badgeW - 16), x + badgeW / 2, y + h - 22)
  }

  // ---- 右侧横向节点串 ----
  const railX = x + badgeW + 24
  const railR = CARD_W - x - 20
  const railW = railR - railX
  const stops = day.stops
  const n = stops.length
  const slot = railW / n
  const dotY = y + h / 2

  // 连接横线
  ctx.strokeStyle = C.line
  ctx.lineWidth = 3
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(railX + slot / 2, dotY)
  ctx.lineTo(railX + slot * (n - 0.5), dotY)
  ctx.stroke()

  const dotR = Math.min(24, Math.floor(slot * 0.22))

  stops.forEach((s, i) => {
    const cx = railX + slot * (i + 0.5)
    const topMargin = 14

    // ---- 时间（节点上方）----
    const timeStr = s.time ? s.time.split('-')[0]?.trim() || s.time : ''
    if (timeStr) {
      ctx.fillStyle = color === '#F6A6A1' ? '#8B3A3A' : C.primaryDark
      ctx.font = `bold 22px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(truncateText(ctx, timeStr, slot - 6), cx, dotY - dotR - topMargin)
    }

    // ---- 编号点 ----
    // 用天的颜色作为圆点色，区分同天内顺序
    ctx.beginPath()
    ctx.arc(cx, dotY, dotR, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = '#5A3B1E'
    ctx.font = `bold ${Math.round(dotR)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), cx, dotY)

    // ---- 类型图标（点下方第1行）----
    ctx.font = `${Math.min(26, slot * 0.28)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(poiIcon(s.type), cx, dotY + dotR + 6)

    // ---- 地点名称（点下方第2行）----
    ctx.fillStyle = C.note
    ctx.font = `${Math.min(22, slot * 0.24)}px ${FONT}`
    ctx.fillText(truncateText(ctx, s.name || '', slot - 4), cx, dotY + dotR + 34)

    // ---- 站间交通图标（横线中点）----
    if (s.travelToNext && i < n - 1) {
      const midX = cx + slot / 2
      // 小白圈遮住横线
      ctx.beginPath()
      ctx.arc(midX, dotY, 16, 0, Math.PI * 2)
      ctx.fillStyle = C.panel
      ctx.fill()
      ctx.font = `22px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(modeIcon(s.travelToNext.mode), midX, dotY)
    }
  })

  // ---- routeTag 小标签（右上角）----
  if ((day as Day & { routeTag?: string }).routeTag) {
    const tag = (day as Day & { routeTag?: string }).routeTag!
    ctx.font = `24px ${FONT}`
    const tw = ctx.measureText(tag).width
    const tagX = x + w - tw - 28
    const tagY = y + 10
    roundRect(ctx, tagX - 8, tagY, tw + 16, 34, 17)
    ctx.fillStyle = color + 'CC'
    ctx.fill()
    ctx.fillStyle = '#5A3B1E'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(tag, tagX, tagY + 6)
  }
}

export { wrapText }

