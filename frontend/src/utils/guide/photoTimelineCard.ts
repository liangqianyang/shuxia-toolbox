import type { Trip } from '@/types/travel'
import { POI_THEME } from '@/types/travel'
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
  drawTextPill,
  truncateText,
  poiIcon,
  modeIcon,
  modeLabel,
  interStopModeIcon,
  interStopModeLabel,
  wrapText,
} from './theme'

/**
 * 景点照片时间线（1080×1440）：竖向时间轴，每站展示真实照片缩略图（或 POI 色块占位）。
 * stopPhotos 由 useTravelImages 在渲染前通过 canvas.createImage 预加载（stop.id → CanvasImageSource）。
 * 无照片时退化为类型色块 + emoji，仍保持完整排版，可直接分享。
 * 最多显示 7 个站点，超出提示 "+N 个景点"。
 */
export function renderPhotoTimelineCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  _mapImage: CanvasImageSource | null,
  bgImage: CanvasImageSource | null = null,
  stopPhotos?: Map<string, CanvasImageSource>,
): void {
  drawBackground(ctx, bgImage)
  const bannerBottom = drawBanner(ctx, trip.title || '行程相册', '每一站都是风景', '📷')

  const allStops = trip.days.flatMap((d) =>
    d.stops.map((s) => ({ stop: s, dayIndex: d.index, dayTitle: d.title })),
  )

  if (allStops.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('暂无行程', CARD_W / 2, CARD_H / 2)
    drawFooter(ctx)
    return
  }

  // ---- 布局常量 ----
  const timelineX = 132     // 时间轴竖线 x
  const photoX = timelineX + 24   // 照片左边缘
  const photoW = 190
  const photoH = 130
  const textX = photoX + photoW + 20
  const textW = CARD_W - textX - 56

  const rowH = photoH + 10            // 站点核心区高度
  const connectorH = 44               // 站间交通连接行高度
  const fullRowH = rowH + connectorH  // 含连接行（最后一站无连接行）

  const top = bannerBottom + 32
  const bottom = CARD_H - 86

  // 计算最多能显示几站
  const maxStops = Math.min(
    allStops.length,
    Math.max(1, Math.floor((bottom - top + connectorH) / fullRowH)),
  )
  const visStops = allStops.slice(0, maxStops)

  // ---- 绘制竖向时间轴线 ----
  const lineTop = top + rowH / 2
  const lineBottom = top + (maxStops - 1) * fullRowH + rowH / 2
  ctx.strokeStyle = C.line
  ctx.lineWidth = 3
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(timelineX, lineTop)
  ctx.lineTo(timelineX, lineBottom)
  ctx.stroke()
  ctx.setLineDash([])

  // ---- 逐站绘制 ----
  visStops.forEach((item, i) => {
    const rowTop = top + i * fullRowH
    const rowCy = rowTop + rowH / 2
    const s = item.stop

    // -- 时间标签（左侧，右对齐到时间轴） --
    const timeStr = s.time ? s.time.split('-')[0]?.trim() || s.time : ''
    if (timeStr) {
      ctx.fillStyle = C.primaryDark
      ctx.font = `bold 26px ${FONT}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(timeStr, timelineX - 14, rowCy)
    }

    // -- 时间轴圆点 --
    const dotR = 16
    ctx.beginPath()
    ctx.arc(timelineX, rowCy, dotR, 0, Math.PI * 2)
    ctx.fillStyle = POI_THEME[s.type]?.hex ?? C.accent
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()

    // -- 照片区（含圆角 clip）--
    ctx.save()
    roundRect(ctx, photoX, rowTop, photoW, photoH, 18)
    ctx.clip()
    const photo = stopPhotos?.get(s.id)
    if (photo) {
      drawImageCover(ctx, photo, photoX, rowTop, photoW, photoH)
    } else {
      // POI 色块占位
      const rgb = POI_THEME[s.type]?.rgb ?? [200, 149, 108]
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.22)`
      ctx.fillRect(photoX, rowTop, photoW, photoH)
      ctx.font = `54px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`
      ctx.fillText(poiIcon(s.type), photoX + photoW / 2, rowTop + photoH / 2)
    }
    ctx.restore()
    // 照片边框
    roundRect(ctx, photoX, rowTop, photoW, photoH, 18)
    ctx.lineWidth = 3
    // 有类型色用 hex+66（带透明），否则回退 C.line；旧写法 `hex + '66' ?? C.line` 因左操作数恒为字符串而永不触发
    const frameHex = POI_THEME[s.type]?.hex
    ctx.strokeStyle = frameHex ? frameHex + '66' : C.line
    ctx.stroke()

    // -- 文字区 --
    // 行1: 站点名称（粗体大字）
    ctx.fillStyle = C.name
    ctx.font = `bold 36px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, s.name, textW), textX, rowTop + 4)

    // 行2: 类型 pill + Day N 标签
    const pillY = rowTop + 52
    const pillW = drawTextPill(ctx, poiIcon(s.type) + ' ' + s.type, textX, pillY + 16, C.panelSoft, C.primaryDark, 24)
    if (item.dayTitle || item.dayIndex) {
      const dayStr = item.dayTitle ? `Day${item.dayIndex} ${item.dayTitle}` : `Day${item.dayIndex}`
      drawTextPill(ctx, dayStr, textX + pillW + 10, pillY + 16, C.banner, C.bannerText, 24)
    }

    // 行3: 备注文字（最多 2 行）
    if (s.note) {
      ctx.fillStyle = C.note
      ctx.font = `26px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const noteTop = rowTop + 88
      wrapText(ctx, s.note, textW)
        .slice(0, 2)
        .forEach((ln, li) => ctx.fillText(ln, textX, noteTop + li * 32))
    }

    // -- 站间交通连接行 --
    if (s.travelToNext && i < visStops.length - 1) {
      const connY = rowTop + rowH + connectorH / 2
      const dist =
        s.travelToNext.distanceM >= 1000
          ? `${(s.travelToNext.distanceM / 1000).toFixed(1)}km`
          : `${s.travelToNext.distanceM}m`
      const phrase = `${interStopModeIcon(s.travelToNext.mode)} ${interStopModeLabel(s.travelToNext.mode)}  ${s.travelToNext.durationMin}分钟 · ${dist}`

      ctx.fillStyle = C.note
      ctx.font = `26px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(phrase, timelineX + 20, connY)
    }
  })

  // 超出提示
  if (allStops.length > maxStops) {
    const more = allStops.length - maxStops
    const msgY = top + maxStops * fullRowH - connectorH + 10
    ctx.fillStyle = C.note
    ctx.font = `28px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`… 还有 ${more} 个景点`, CARD_W / 2, msgY)
  }

  drawFooter(ctx)
}
