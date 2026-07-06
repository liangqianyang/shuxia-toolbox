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
  wrapText,
} from './theme'

/**
 * 出行清单卡片（1080×1440）：两栏式清单（必带物品 / 注意事项）。
 * 数据源 trip.packingTips（AI 生成，12-15 条目）。
 * 前半段作「必带物品」，后半段作「注意事项」，均以 ✓ 打勾风格呈现。
 * 空 packingTips 时退化为通用出行建议。
 */
export function renderPackingCard(
  ctx: CanvasRenderingContext2D,
  trip: Trip,
  bgImage: CanvasImageSource | null = null,
): void {
  drawBackground(ctx, bgImage)
  const bannerBottom = drawBanner(ctx, '出行清单', trip.title || '必备物品 · 少踩坑', '🎒')

  const tips = trip.packingTips && trip.packingTips.length > 0 ? trip.packingTips : FALLBACK_TIPS

  // 将清单对半分：前半 = 必带物品，后半 = 注意事项
  const half = Math.ceil(tips.length / 2)
  const leftItems = tips.slice(0, half)
  const rightItems = tips.slice(half)

  const padX = 56
  const colGap = 32
  const colW = (CARD_W - padX * 2 - colGap) / 2
  const top = bannerBottom + 36
  const bottom = CARD_H - 96

  // 左栏
  drawColumn(ctx, '必带物品', '📦', leftItems, padX, top, colW, bottom, C.accent, '#FFF4EE')
  // 右栏
  drawColumn(
    ctx,
    '注意事项',
    '📝',
    rightItems,
    padX + colW + colGap,
    top,
    colW,
    bottom,
    '#5B8DEF',
    '#EEF4FF',
  )

  drawFooter(ctx)
}

/** 绘制单列清单面板。返回实际用掉的底部 y。 */
function drawColumn(
  ctx: CanvasRenderingContext2D,
  heading: string,
  headingIcon: string,
  items: string[],
  x: number,
  y: number,
  w: number,
  maxBottom: number,
  accentHex: string,
  bgHex: string,
): void {
  // ---- 列标题 ----
  const headerH = 80
  roundRect(ctx, x, y, w, headerH, 24)
  ctx.fillStyle = accentHex
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 38px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${headingIcon} ${heading}`, x + w / 2, y + headerH / 2)

  // ---- 清单区背景 ----
  const listTop = y + headerH + 12
  const listH = maxBottom - listTop
  roundRect(ctx, x, listTop, w, listH, 24)
  ctx.fillStyle = bgHex
  ctx.fill()
  roundRect(ctx, x, listTop, w, listH, 24)
  ctx.lineWidth = 3
  ctx.strokeStyle = accentHex + '55'
  ctx.stroke()

  // ---- 列表条目 ----
  const itemPadX = 20
  const checkR = 16
  const textX = x + itemPadX + checkR * 2 + 12
  const textW = w - itemPadX - checkR * 2 - 12 - 16
  const lineH = 38
  const minItemH = lineH + 8

  // 按可用高度自适应条数
  const availH = listH - 20
  const maxItems = Math.floor(availH / minItemH)
  const visItems = items.slice(0, maxItems)

  let curY = listTop + 14
  visItems.forEach((item) => {
    // 自动折行（最多 2 行）
    ctx.font = `30px ${FONT}`
    const lines = wrapText(ctx, item, textW).slice(0, 2)
    const itemH = lines.length * lineH + 4

    // ✓ 勾形圆
    const ckCy = curY + itemH / 2
    ctx.beginPath()
    ctx.arc(x + itemPadX + checkR, ckCy, checkR, 0, Math.PI * 2)
    ctx.fillStyle = accentHex
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold 22px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✓', x + itemPadX + checkR, ckCy)

    // 条目文本
    ctx.fillStyle = C.name
    ctx.font = `30px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((ln, li) => {
      ctx.fillText(truncateText(ctx, ln, textW), textX, curY + li * lineH)
    })

    // 分隔线（最后一条不画）
    curY += itemH + 8
    if (curY < listTop + listH - 10) {
      ctx.beginPath()
      ctx.moveTo(x + itemPadX, curY - 4)
      ctx.lineTo(x + w - itemPadX, curY - 4)
      ctx.strokeStyle = accentHex + '33'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  })
}

/** packingTips 为空时的通用兜底清单 */
const FALLBACK_TIPS: string[] = [
  '身份证 / 学生证',
  '充电宝 & 充电线',
  '防晒霜 / 遮阳帽',
  '舒适运动鞋',
  '薄外套（早晚温差）',
  '雨伞 / 防水装备',
  '自拍杆 / 相机',
  '纸巾 / 湿巾',
  '常备小药包',
  '提前看预约要求',
  '高峰期避开吃饭',
  '看当日天气再出行',
  '返程留足缓冲时间',
]
