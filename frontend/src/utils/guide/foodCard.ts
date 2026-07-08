import type { Trip, FoodRec, PoiInfo, Stop } from '@/types/travel'
import {
  CARD_W,
  CARD_H,
  C,
  FONT,
  roundRect,
  drawBackground,
  drawBanner,
  drawFooter,
  drawTextPill,
  poiTrustLine,
  truncateText,
  wrapText,
} from './theme'

/**
 * 美食推荐图（1080×1440）：单列美食卡（序号圆牌 + 菜名 + 推荐店 pill + 必点菜 + 点评）。
 * 数据源 trip.food（AI 生成）。空则提示。
 * 每条卡片内部三行（菜名 / 店+菜 / 点评）垂直排布严格不重叠；条数多时按可用高度自适应，
 * 放不下就少画几条，绝不把文字挤出卡片重叠到下一条。
 */
export function renderFoodCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)
  const dest = trip.title || '美食推荐'
  const bannerBottom = drawBanner(ctx, '必吃美食', dest, '🍜')

  const allFoods = (trip.food ?? []).slice(0, 8)
  if (allFoods.length === 0) {
    ctx.fillStyle = C.note
    ctx.font = `36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('本次行程暂无美食推荐', CARD_W / 2, CARD_H / 2)
    drawFooter(ctx)
    return
  }

  const cardX = 64
  const cardW = CARD_W - cardX * 2
  const gap = 24
  const top = bannerBottom + 36
  const bottom = CARD_H - 100 // 底部落款留白
  const avail = bottom - top

  // 单卡最小 112（菜名+店/必点菜两行；note 在更小高度下自动省略）。
  // 旧值 188 导致 6 条美食只画得下 5 条；压缩后 6~8 条都能完整展示。
  const minH = 132
  let n = allFoods.length
  let cardH = Math.floor((avail - gap * (n - 1)) / n)
  if (cardH < minH) {
    n = Math.max(1, Math.floor((avail + gap) / (minH + gap)))
    cardH = Math.floor((avail - gap * (n - 1)) / n)
  }

  const foodStops = trip.days.flatMap((day) => day.stops).filter((stop) => stop.type === 'food')
  let y = top
  for (let i = 0; i < n; i++) {
    drawFoodItem(ctx, allFoods[i], i + 1, cardX, y, cardW, cardH, foodStops)
    y += cardH + gap
  }

  drawFooter(ctx)
}

function drawFoodItem(
  ctx: CanvasRenderingContext2D,
  f: FoodRec,
  num: number,
  x: number,
  y: number,
  w: number,
  h: number,
  foodStops: Stop[],
): void {
  // 卡片底 + 水彩描边
  roundRect(ctx, x, y, w, h, 24)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = C.banner
  ctx.stroke()

  // 左侧序号圆牌（垂直居中）
  const badgeR = 30
  const bx = x + 30 + badgeR
  const by = y + h / 2
  ctx.beginPath()
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
  ctx.fillStyle = C.accent
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 34px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(num), bx, by)

  // 文本区（圆牌右侧），三行紧凑排布；note 按剩余高度自适应，放不下则省略
  const textX = bx + badgeR + 22
  const textR = x + w - 28
  const textW = textR - textX

  // 行 1：菜名（顶部）
  ctx.fillStyle = C.name
  ctx.font = `bold 36px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateText(ctx, f.name, textW), textX, y + 40)

  // 行 2：推荐店 pill + 必点菜（同一行，超宽截断）
  const line2Y = y + 68
  let cursorX = textX
  if (f.shop) {
    const pillW = drawTextPill(ctx, `🏠 ${f.shop}`, cursorX, line2Y, C.panelSoft, C.primaryDark, 22)
    cursorX += pillW + 14
  }
  if (f.dishes && f.dishes.length) {
    const dishText = `必点：${f.dishes.join('、')}`
    ctx.font = `24px ${FONT}`
    ctx.fillStyle = C.note
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateText(ctx, dishText, textR - cursorX), Math.max(cursorX, textX), line2Y)
  }

  const trust = poiTrustLine(foodTrustInfo(f, foodStops), { includeOpenHours: true, max: 3, separator: ' / ' })
  if (trust) {
    ctx.font = `22px ${FONT}`
    ctx.fillStyle = C.primaryDark
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateText(ctx, trust, textW), textX, y + 88)
  }

  // 行 3：点评（按剩余高度折行；高度不足时 maxLines=0 自动省略，绝不越过卡片下沿）
  if (f.note) {
    const noteTop = y + (trust ? 116 : 96)
    const noteLineH = 28
    const maxLines = Math.max(0, Math.floor((y + h - noteTop - 10) / noteLineH))
    if (maxLines > 0) {
      ctx.font = `24px ${FONT}`
      ctx.fillStyle = C.note
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      wrapText(ctx, f.note, textW)
        .slice(0, maxLines)
        .forEach((ln, li) => ctx.fillText(ln, textX, noteTop + li * noteLineH))
    }
  }
}

function hasTrust(info: PoiInfo | undefined): boolean {
  return !!info && Boolean(info.openHours || info.reservation || info.ticket || info.duration)
}

function compactText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function foodTrustInfo(food: FoodRec, foodStops: Stop[]): PoiInfo | undefined {
  if (hasTrust(food.poiInfo)) return food.poiInfo
  const name = compactText(food.name || '')
  const shop = compactText(food.shop || '')
  const target = [shop, name].filter(Boolean)
  if (target.length === 0) return undefined

  const matched = foodStops.find((stop) => {
    if (!hasTrust(stop.poiInfo)) return false
    const stopName = compactText(stop.name || '')
    const stopNote = compactText(stop.note || '')
    return target.some((part) => part && ((stopName && (stopName.includes(part) || part.includes(stopName))) || stopNote.includes(part)))
  })
  return matched?.poiInfo
}
