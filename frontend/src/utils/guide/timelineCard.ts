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
} from './theme'

/**
 * 行程时间线图（1080×1440）：每天一条横向时间线（DAY N 徽标 + 节点串）。
 * 节点 = 时间 + 类型图标 + 名称；节点间 = 交通图标（travelToNext.mode）。
 * 对标参考图「杭州毕业旅行3日路线」的横向条带样式，适配竖版多天堆叠。
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
  const gap = 28
  const bandH = Math.min(360, Math.floor((bottom - top - gap * (days.length - 1)) / days.length))

  let y = top
  const dayColors = ['#F6A6A1', '#A8D5A2', '#9Fc3F0', '#F3C98B', '#C9A8E0']
  days.forEach((day, di) => {
    drawDayBand(ctx, day, y, bandH, dayColors[di % dayColors.length])
    y += bandH + gap
  })

  drawFooter(ctx)
}

function drawDayBand(
  ctx: CanvasRenderingContext2D,
  day: Day,
  y: number,
  h: number,
  color: string,
): void {
  const x = 48
  const w = CARD_W - x * 2

  // 条带底
  roundRect(ctx, x, y, w, h, 28)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.stroke()

  // 左侧 DAY 徽标区
  const badgeW = 150
  roundRect(ctx, x, y, badgeW, h, 28)
  ctx.save()
  roundRect(ctx, x, y, badgeW, h, 28)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(x, y, badgeW, h)
  ctx.restore()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 52px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`DAY`, x + badgeW / 2, y + h / 2 - 28)
  ctx.font = `bold 72px ${FONT}`
  ctx.fillText(String(day.index), x + badgeW / 2, y + h / 2 + 30)
  if (day.title) {
    ctx.font = `24px ${FONT}`
    ctx.fillText(truncateText(ctx, day.title, badgeW - 16), x + badgeW / 2, y + h - 26)
  }

  // 右侧节点串（横向排布，超出则截断）
  const railX = x + badgeW + 30
  const railR = CARD_W - x - 24
  const railW = railR - railX
  const stops = day.stops
  const n = stops.length
  const slot = railW / n
  const dotY = y + h / 2 - 6
  const dotR = 26

  // 连接横线
  ctx.strokeStyle = C.line
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(railX + slot / 2, dotY)
  ctx.lineTo(railX + slot * (n - 0.5), dotY)
  ctx.stroke()

  stops.forEach((s, i) => {
    const cx = railX + slot * (i + 0.5)
    // 时间（点上方）
    if (s.time) {
      ctx.fillStyle = C.primaryDark
      ctx.font = `22px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(truncateText(ctx, s.time.split('-')[0] || s.time, slot - 8), cx, dotY - dotR - 8)
    }
    // 编号点
    drawNumberedDot(ctx, i + 1, cx, dotY, dotR, s.type)
    // 类型图标 + 名称（点下方，两行）
    ctx.textAlign = 'center'
    ctx.fillStyle = C.name
    ctx.font = `26px ${FONT}`
    ctx.textBaseline = 'top'
    ctx.fillText(poiIcon(s.type), cx, dotY + dotR + 8)
    ctx.font = `24px ${FONT}`
    ctx.fillStyle = C.note
    ctx.fillText(truncateText(ctx, s.name || '', slot - 6), cx, dotY + dotR + 44)

    // 站间交通图标（放在下一节点之间的横线中点上）
    if (s.travelToNext && i < n - 1) {
      const midX = cx + slot / 2
      ctx.font = `26px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // 图标底白圈避免压线
      ctx.beginPath()
      ctx.arc(midX, dotY, 18, 0, Math.PI * 2)
      ctx.fillStyle = C.panel
      ctx.fill()
      ctx.fillText(modeIcon(s.travelToNext.mode), midX, dotY)
    }
  })
}
