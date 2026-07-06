import type { Trip, FoodRec } from '@/types/travel'
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

  // 单卡至少 188 才放得下三行不重叠；按可用高度反推最多能画几条
  const minH = 188
  let n = allFoods.length
  let cardH = Math.floor((avail - gap * (n - 1)) / n)
  if (cardH < minH) {
    n = Math.max(1, Math.floor((avail + gap) / (minH + gap)))
    cardH = Math.floor((avail - gap * (n - 1)) / n)
  }

  let y = top
  for (let i = 0; i < n; i++) {
    drawFoodItem(ctx, allFoods[i], i + 1, cardX, y, cardW, cardH)
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
): void {
  // 卡片底 + 水彩描边
  roundRect(ctx, x, y, w, h, 28)
  ctx.fillStyle = C.panel
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = C.banner
  ctx.stroke()

  // 左侧序号圆牌（垂直居中）
  const badgeR = 38
  const bx = x + 34 + badgeR
  const by = y + h / 2
  ctx.beginPath()
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
  ctx.fillStyle = C.accent
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 42px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(num), bx, by)

  // 文本区（圆牌右侧），三行自上而下严格分层不重叠
  const textX = bx + badgeR + 28
  const textR = x + w - 30
  const textW = textR - textX

  // 行 1：菜名（顶部）
  ctx.fillStyle = C.name
  ctx.font = `bold 40px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateText(ctx, f.name, textW), textX, y + 50)

  // 行 2：推荐店 pill + 必点菜（中部，pill 底约 y+109）
  const line2Y = y + 88
  let cursorX = textX
  if (f.shop) {
    const pillW = drawTextPill(ctx, `🏠 ${f.shop}`, cursorX, line2Y, C.panelSoft, C.primaryDark, 26)
    cursorX += pillW + 16
  }
  if (f.dishes && f.dishes.length) {
    const dishText = `必点：${f.dishes.join('、')}`
    ctx.font = `28px ${FONT}`
    ctx.fillStyle = C.note
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    if (cursorX > textX) {
      ctx.fillText(truncateText(ctx, dishText, textR - cursorX), cursorX, line2Y)
    } else {
      ctx.fillText(truncateText(ctx, dishText, textW), textX, line2Y)
    }
  }

  // 行 3：点评（底部，按剩余高度折行，绝不越过卡片下沿）
  if (f.note) {
    ctx.font = `26px ${FONT}`
    ctx.fillStyle = C.note
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const noteTop = y + 120
    const noteLineH = 32
    const maxLines = Math.max(1, Math.floor((y + h - noteTop - 12) / noteLineH))
    wrapText(ctx, f.note, textW)
      .slice(0, maxLines)
      .forEach((ln, li) => ctx.fillText(ln, textX, noteTop + li * noteLineH))
  }
}
