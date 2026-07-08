import type { GuideStyle, PoiInfo, PoiType } from '@/types/travel'
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

/**
 * 是否为「要去游览/消费」的目的地站点。
 * transit（火车站/机场/汽车站等）只是跨城出入节点，不算景点——
 * 它已在路线规划图的跨城段体现，不应再作为编号景点出现在市内地图/清单上。
 * 市内地图类卡片（景点分布/游玩顺序/分日/多路线/地铁）据此过滤；
 * 时间线类卡片不过滤（枢纽是日程流的一部分）。
 */
export function isVisitStop(s: { type: string }): boolean {
  return s.type !== 'transit'
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

const STYLE_THEMES: Record<GuideStyle, {
  bgTop: string
  bgBottom: string
  banner: string
  bannerSoft: string
  bannerText: string
  accent: string
  decor: [string, string, string, string]
}> = {
  handbook: {
    bgTop: '#FFF9F2',
    bgBottom: '#FDF1E2',
    banner: '#F6C89A',
    bannerSoft: '#FFF3E2',
    bannerText: '#5A3B1E',
    accent: '#C8956C',
    decor: ['🌸', '🍃', '🌿', '🌼'],
  },
  minimal: {
    bgTop: '#F8FAF8',
    bgBottom: '#EEF3F0',
    banner: '#D9E6DE',
    bannerSoft: '#FFFFFF',
    bannerText: '#243A32',
    accent: '#4E7568',
    decor: ['□', '＋', '—', '○'],
  },
  family: {
    bgTop: '#FFF7D7',
    bgBottom: '#EAF6FF',
    banner: '#FFD879',
    bannerSoft: '#FFFDF2',
    bannerText: '#5C4A12',
    accent: '#4B85C5',
    decor: ['☀️', '🎈', '⭐', '🧃'],
  },
  couple: {
    bgTop: '#FFF4F7',
    bgBottom: '#F6ECFF',
    banner: '#F6B6C8',
    bannerSoft: '#FFF7FA',
    bannerText: '#683246',
    accent: '#C66D8B',
    decor: ['♡', '✦', '♡', '✧'],
  },
  weekend: {
    bgTop: '#F4F8FF',
    bgBottom: '#FFF5E7',
    banner: '#AFC7F2',
    bannerSoft: '#FFFFFF',
    bannerText: '#263C66',
    accent: '#E29A54',
    decor: ['↗', '○', '▱', '↘'],
  },
}

let currentGuideStyle: GuideStyle = 'handbook'

export function setGuideStyle(style: GuideStyle | undefined): void {
  currentGuideStyle = style && STYLE_THEMES[style] ? style : 'handbook'
}

function activeStyle() {
  return STYLE_THEMES[currentGuideStyle]
}

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
  // 腾讯 staticMap 源图封顶 ~928px，2x 导出时会被放大；用高质量插值让放大更平滑、少锯齿。
  const a = img as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number }
  const iw = a.width || a.naturalWidth || 0
  const ih = a.height || a.naturalHeight || 0
  if (!iw || !ih) return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
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

function cleanTrustValue(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function withTrustPrefix(prefix: string, value: string): string {
  return value.startsWith(prefix) ? value : `${prefix}${value}`
}

export function poiTrustParts(
  info: PoiInfo | undefined,
  options: { includeOpenHours?: boolean; max?: number } = {},
): string[] {
  if (!info) return []
  const parts: string[] = []
  if (options.includeOpenHours) {
    const openHours = cleanTrustValue(info.openHours)
    if (openHours) parts.push(withTrustPrefix('开放 ', openHours))
  }
  const reservation = cleanTrustValue(info.reservation)
  if (reservation) parts.push(reservation)
  const ticket = cleanTrustValue(info.ticket)
  if (ticket) parts.push(ticket)
  const duration = cleanTrustValue(info.duration)
  if (duration) parts.push(/^建议/.test(duration) ? duration : `建议${duration}`)

  const deduped = [...new Set(parts)]
  return deduped.slice(0, options.max ?? 3)
}

export function poiTrustLine(
  info: PoiInfo | undefined,
  options: { includeOpenHours?: boolean; max?: number; separator?: string } = {},
): string {
  return poiTrustParts(info, options).join(options.separator ?? ' · ')
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
  const style = activeStyle()
  g.addColorStop(0, style.bgTop)
  g.addColorStop(1, style.bgBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 边角点缀 emoji（花/叶），大号半透明，营造小红书手账感
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.font = `72px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(style.decor[0], 24, 20)
  ctx.textAlign = 'right'
  ctx.fillText(style.decor[1], CARD_W - 24, 20)
  ctx.textBaseline = 'bottom'
  ctx.fillText(style.decor[2], CARD_W - 24, CARD_H - 16)
  ctx.textAlign = 'left'
  ctx.fillText(style.decor[3], 24, CARD_H - 16)
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
  const style = activeStyle()
  roundRect(ctx, x, top, w, h, 40)
  ctx.fillStyle = style.banner
  ctx.fill()
  roundRect(ctx, x + 8, top + 8, w - 16, h - 16, 32)
  ctx.fillStyle = style.bannerSoft
  ctx.fill()

  const blockTop = top + padTop
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = style.bannerText
  ctx.font = `bold 62px ${FONT}`
  lines.forEach((ln, i) => ctx.fillText(ln, CARD_W / 2, blockTop + i * titleLineH + 6))

  if (hasSub) {
    ctx.font = `34px ${FONT}`
    ctx.fillStyle = style.accent
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
  taxi: '🚕',
  metro: '🚇',
  bus: '🚌',
  transit: '🚌',
  train: '🚆',
  ferry: '🛳️',
  cablecar: '🚠',
}
const MODE_LABEL: Record<string, string> = {
  walking: '步行',
  cycling: '骑行',
  driving: '自驾',
  taxi: '打车',
  metro: '地铁',
  bus: '公交',
  transit: '公交',
  train: '火车',
  ferry: '轮渡',
  cablecar: '缆车',
}
export function modeIcon(mode: string): string {
  return USE_EMOJI_ON_CANVAS ? (MODE_ICON_EMOJI[mode] ?? '🚶') : (MODE_LABEL[mode] ?? '步行')
}
export function modeLabel(mode: string): string {
  return MODE_LABEL[mode] ?? '步行'
}

/** 站间「到下一站」可选出行方式（编辑器 chips 用）。后端自动：<1.5km 步行、更远 taxi（打车） */
export const LEG_MODE_ORDER = ['walking', 'metro', 'bus', 'taxi', 'driving', 'cycling', 'ferry', 'cablecar'] as const
export type LegMode = (typeof LEG_MODE_ORDER)[number]

/**
 * 市内景点间衔接（travelToNext）的展示图标/标签。
 * 后端自动段远距用 taxi（打车）呈现；driving 仅当用户显式选「自驾」时出现。
 * 直接走 modeIcon/modeLabel，保留此函数仅作语义命名（调用方无需改）。
 */
export function interStopModeIcon(mode: string): string {
  return modeIcon(mode)
}
export function interStopModeLabel(mode: string): string {
  return modeLabel(mode)
}

/** 站间交通短语：如「步行 12 分钟 · 0.8km」 */
export function travelPhrase(travel: { mode: string; distanceM: number; durationMin: number }): string {
  const dist =
    travel.distanceM >= 1000 ? `${(travel.distanceM / 1000).toFixed(1)}km` : `${travel.distanceM}m`
  return `${modeLabel(travel.mode)} ${travel.durationMin} 分钟 · ${dist}`
}
