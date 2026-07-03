import type { PoiType } from '@/types/travel'
import { POI_THEME, POI_LABEL } from '@/types/travel'
import { textColorOn } from '@/utils/color'
import { wrapText } from '@/utils/textLayout'
export { wrapText } from '@/utils/textLayout'

/**
 * 攻略卡片共享绘制层。
 * 所有卡片固定输出小红书竖版 1080×1440（3:4），字号/坐标直接用像素。
 * 「内置素材」风格由 Canvas 程序化绘制（渐变底、水彩感横幅、边角点缀、类型 pill），
 * 中文全部由 Canvas 绘制保证清晰，不依赖外部 PNG、不联网、即时且风格统一。
 * 只接收原生 CanvasRenderingContext2D，平台无关（MP / H5 同一份代码）。
 */

export const CARD_W = 1080
export const CARD_H = 1440

// ---- emoji 退路开关：真机验证后若 canvas 上 emoji 异常则改 false 用汉字 ----
export const USE_EMOJI_ON_CANVAS = true
const POI_ICON_FALLBACK: Record<PoiType, string> = {
  sight: '景',
  food: '食',
  stay: '住',
  shop: '购',
  transit: '交',
}
const POI_ICON_EMOJI: Record<PoiType, string> = {
  sight: '📸',
  food: '🍜',
  stay: '🏨',
  shop: '🛍️',
  transit: '🚉',
}
export function poiIcon(type: PoiType): string {
  return USE_EMOJI_ON_CANVAS ? POI_ICON_EMOJI[type] : POI_ICON_FALLBACK[type]
}

// ---- 主题色板 ----
export const C = {
  bgTop: '#FFF9F2',
  bgBottom: '#FDF1E2',
  panel: '#FFFFFF',
  panelSoft: '#FBF4EA',
  primary: '#C8956C',
  primaryDark: '#5A4632',
  banner: '#F6C89A',
  bannerText: '#5A3B1E',
  title: '#3A2E22',
  name: '#3A2E22',
  note: '#7A6552',
  line: '#D8B892',
  accent: '#E8945A',
}

export const FONT = 'sans-serif'

/** 圆角矩形路径（不 fill/stroke，调用方自行填充） */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** aspectFill(cover)：把图片填满 (dx,dy,dw×dh) 居中裁切；调用方负责 clip 形状 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const a = img as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number }
  const iw = a.width || a.naturalWidth || 0
  const ih = a.height || a.naturalHeight || 0
  if (!iw || !ih) return
  const scale = Math.max(dw / iw, dh / ih)
  const sw = iw * scale
  const sh = ih * scale
  ctx.drawImage(img, dx + (dw - sw) / 2, dy + (dh - sh) / 2, sw, sh)
}

/** 超宽文本截断加省略号（调用前需先设好 font）；maxWidth 过小时至少保留 1 字 */
export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

/**
 * 卡片背景。bgImage 为用户自定义底图时：全幅铺满 + 半透明暖白蒙层（保证文字清晰、底图作水印质感）；
 * 否则用内置竖向渐变 + 四角 emoji 点缀。
 */
export function drawBackground(ctx: CanvasRenderingContext2D, bgImage: CanvasImageSource | null = null): void {
  if (bgImage) {
    drawImageCover(ctx, bgImage, 0, 0, CARD_W, CARD_H)
    ctx.fillStyle = 'rgba(255, 250, 245, 0.84)'
    ctx.fillRect(0, 0, CARD_W, CARD_H)
    return
  }

  const g = ctx.createLinearGradient(0, 0, 0, CARD_H)
  g.addColorStop(0, C.bgTop)
  g.addColorStop(1, C.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 边角点缀 emoji（花/叶），大号半透明，营造小红书手账感
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.font = `72px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('🌸', 24, 20)
  ctx.textAlign = 'right'
  ctx.fillText('🍃', CARD_W - 24, 20)
  ctx.textBaseline = 'bottom'
  ctx.fillText('🌿', CARD_W - 24, CARD_H - 16)
  ctx.textAlign = 'left'
  ctx.fillText('🌼', 24, CARD_H - 16)
  ctx.restore()
}

/**
 * 顶部水彩感标题横幅：圆角胶囊底 + 主标题 + 副标题 + 前置 emoji。
 * 标题过长自动折行（最多 2 行，第 2 行仍超宽则截断加省略号），横幅高度随之自适应，
 * 避免长标题（如「杭州2日步行漫游：西湖、灵隐、市井烟火」）溢出胶囊。
 * 返回横幅底部 y（内容从此往下排）。
 */
export function drawBanner(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  emoji = '✨',
): number {
  const top = 56
  const x = 64
  const w = CARD_W - x * 2
  const innerW = w - 110 // 标题文本左右留白，防止贴边

  ctx.font = `bold 62px ${FONT}`
  let lines = wrapText(ctx, `${emoji} ${title}`, innerW)
  if (lines.length > 2) {
    // 超过 2 行：合并剩余行并在第 2 行末尾省略
    lines = [lines[0], truncateText(ctx, lines.slice(1).join(''), innerW)]
  }
  lines = lines.slice(0, 2)

  const titleLineH = 76
  const titleBlockH = lines.length * titleLineH
  const hasSub = !!subtitle
  const subtitleH = 44
  const padTop = 30
  const padBottom = hasSub ? 26 : 30
  const h = padTop + titleBlockH + (hasSub ? 10 + subtitleH : 0) + padBottom

  // 胶囊底（双层，模拟水彩描边）
  roundRect(ctx, x, top, w, h, 40)
  ctx.fillStyle = C.banner
  ctx.fill()
  roundRect(ctx, x + 8, top + 8, w - 16, h - 16, 32)
  ctx.fillStyle = '#FFF3E2'
  ctx.fill()

  const blockTop = top + padTop
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.bannerText
  ctx.font = `bold 62px ${FONT}`
  lines.forEach((ln, i) => ctx.fillText(ln, CARD_W / 2, blockTop + i * titleLineH + 6))

  if (hasSub) {
    ctx.font = `34px ${FONT}`
    ctx.fillStyle = C.primary
    ctx.fillText(subtitle, CARD_W / 2, blockTop + titleBlockH + 10)
  }

  return top + h
}

/** 底部品牌落款（所有卡统一） */
export function drawFooter(ctx: CanvasRenderingContext2D, text = '枫叶小屋 · 出行攻略'): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.font = `28px ${FONT}`
  ctx.fillStyle = C.note
  ctx.fillText(text, CARD_W / 2, CARD_H - 40)
}

/** 类型标签 pill（类型色底 + 中文标签），返回 pill 宽度 */
export function drawTypePill(
  ctx: CanvasRenderingContext2D,
  type: PoiType,
  xLeft: number,
  centerY: number,
  fontPx = 30,
): number {
  const text = POI_LABEL[type]
  ctx.font = `${fontPx}px ${FONT}`
  const tw = ctx.measureText(text).width
  const padX = fontPx * 0.55
  const pillH = fontPx * 1.7
  const pillW = tw + padX * 2
  roundRect(ctx, xLeft, centerY - pillH / 2, pillW, pillH, pillH / 2)
  ctx.fillStyle = POI_THEME[type].hex
  ctx.fill()
  ctx.fillStyle = textColorOn(POI_THEME[type].rgb)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, xLeft + padX, centerY)
  return pillW
}

/** 通用文字胶囊 pill（自定义底色/字色），返回 pill 宽度 */
export function drawTextPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  xLeft: number,
  centerY: number,
  bg: string,
  fg: string,
  fontPx = 28,
): number {
  ctx.font = `${fontPx}px ${FONT}`
  const tw = ctx.measureText(text).width
  const padX = fontPx * 0.5
  const pillH = fontPx * 1.6
  const pillW = tw + padX * 2
  roundRect(ctx, xLeft, centerY - pillH / 2, pillW, pillH, pillH / 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, xLeft + padX, centerY)
  return pillW
}

/** 实心编号圆（类型色底 + 白字序号） */
export function drawNumberedDot(
  ctx: CanvasRenderingContext2D,
  num: number,
  cx: number,
  cy: number,
  r: number,
  type: PoiType,
): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = POI_THEME[type].hex
  ctx.fill()
  ctx.fillStyle = textColorOn(POI_THEME[type].rgb)
  ctx.font = `bold ${Math.round(r * 1.1)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(num), cx, cy)
}

/** 交通方式 → 卡片衔接图标（emoji 退路：文字标签） */
const MODE_ICON_EMOJI: Record<string, string> = {
  walking: '🚶',
  cycling: '🚴',
  driving: '🚗',
  transit: '🚌',
  train: '🚆',
}
const MODE_LABEL: Record<string, string> = {
  walking: '步行',
  cycling: '骑行',
  driving: '驾车',
  transit: '公交',
  train: '火车',
}
export function modeIcon(mode: string): string {
  return USE_EMOJI_ON_CANVAS ? (MODE_ICON_EMOJI[mode] ?? '🚶') : (MODE_LABEL[mode] ?? '步行')
}
export function modeLabel(mode: string): string {
  return MODE_LABEL[mode] ?? '步行'
}

/** 站间交通短语：如「步行 12 分钟 · 0.8km」 */
export function travelPhrase(travel: { mode: string; distanceM: number; durationMin: number }): string {
  const dist =
    travel.distanceM >= 1000 ? `${(travel.distanceM / 1000).toFixed(1)}km` : `${travel.distanceM}m`
  return `${modeLabel(travel.mode)} ${travel.durationMin} 分钟 · ${dist}`
}
