/**
 * 每日灵签主题配置：四套签种的视觉/文案、签级印章色、问事分类。
 * 卡片渲染（cardRenderer）与页面共用这一套配色，保证「所见即所分享」。
 */
import type { DeckKey, FortuneCategory, GrailResult } from '@/types/fortune'

export interface DeckTheme {
  key: DeckKey
  name: string
  /** 签种卡上的一句话定位 */
  tagline: string
  icon: string
  /** 摇签阶段的操作提示 */
  shakeHint: string
  /** 主色（页面主按钮/标题） */
  primary: string
  /** 深色（卡面渐变底、页头渐变） */
  primaryDeep: string
  /** 纸色（签面/卡面底色） */
  paper: string
  /** 印章/点缀色 */
  accent: string
  /** 墨色（签诗文字） */
  ink: string
}

export const DECK_THEMES: Record<DeckKey, DeckTheme> = {
  guanyin: {
    key: 'guanyin',
    name: '观音灵签',
    tagline: '慈悲指引 · 百事可问',
    icon: '🪷',
    shakeHint: '摇一摇手机，或长按签筒',
    primary: '#3E7C59',
    primaryDeep: '#24503A',
    paper: '#F5F1E4',
    accent: '#B03A2E',
    ink: '#33312B',
  },
  guandi: {
    key: 'guandi',
    name: '关帝灵签',
    tagline: '忠义决断 · 事业财运',
    icon: '⚔️',
    shakeHint: '摇一摇手机，或长按签筒',
    primary: '#A03028',
    primaryDeep: '#661B16',
    paper: '#F7F0DE',
    accent: '#8E1F18',
    ink: '#33312B',
  },
  yuelao: {
    key: 'yuelao',
    name: '月老灵签',
    tagline: '红线牵缘 · 专问姻缘',
    icon: '💞',
    shakeHint: '摇一摇手机，或长按签筒',
    primary: '#C0557B',
    primaryDeep: '#86304E',
    paper: '#FBF1EE',
    accent: '#B03A5C',
    ink: '#3A2E30',
  },
  book: {
    key: 'book',
    name: '答案之书',
    tagline: '默念问题 · 一句点醒',
    icon: '📖',
    shakeHint: '长按封面，感受书页翻动',
    primary: '#33477A',
    primaryDeep: '#1D2A52',
    paper: '#F2EEE2',
    accent: '#C9A227',
    ink: '#2E2C26',
  },
}

export const DECK_LIST: DeckTheme[] = [
  DECK_THEMES.guanyin,
  DECK_THEMES.guandi,
  DECK_THEMES.yuelao,
  DECK_THEMES.book,
]

/** 签级印章配色（上上最红，下下最灰）。 */
export const LEVEL_SEALS: Record<string, { color: string; label: string }> = {
  上上: { color: '#B03A2E', label: '上上签' },
  上吉: { color: '#C2501E', label: '上吉签' },
  中吉: { color: '#A67C00', label: '中吉签' },
  中平: { color: '#5D6D7E', label: '中平签' },
  下下: { color: '#4A4A4A', label: '下下签' },
}

export function levelSeal(level: string): { color: string; label: string } {
  return LEVEL_SEALS[level] ?? { color: '#5D6D7E', label: level ? `${level}签` : '' }
}

/** 上上签触发洒金动画与特殊卡面边框。 */
export function isTopStick(level: string | undefined): boolean {
  return level === '上上'
}

export const FORTUNE_CATEGORIES: { key: FortuneCategory; label: string; icon: string }[] = [
  { key: 'career', label: '事业', icon: '💼' },
  { key: 'wealth', label: '财运', icon: '💰' },
  { key: 'love', label: '姻缘', icon: '❤️' },
  { key: 'health', label: '健康', icon: '🌿' },
  { key: 'study', label: '学业', icon: '📚' },
  { key: 'other', label: '其他', icon: '✨' },
]

export const GRAIL_COPY: Record<GrailResult, { title: string; desc: string }> = {
  sheng: { title: '圣杯', desc: '一正一反，神明应允——此签灵验，放心参详。' },
  xiao: { title: '笑杯', desc: '两杯皆正，神明笑而不语——不如换个问法，再掷一次？' },
  yin: { title: '阴杯', desc: '两杯皆反，时机未到——此事且缓，改日再问。' },
}

/** 掷一次杯：两瓣杯各自 50% 正反，一正一反为圣杯（1/2），两正笑杯、两反阴杯（各 1/4）。 */
export function throwGrail(): { result: GrailResult; cups: [boolean, boolean] } {
  const a = Math.random() < 0.5
  const b = Math.random() < 0.5
  return { result: a === b ? (a ? 'xiao' : 'yin') : 'sheng', cups: [a, b] }
}
