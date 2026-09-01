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
  /** 问事输入框的占位示例 */
  askPlaceholder: string
  /** 进入问事时的默认分类（不再一刀切「其他」） */
  defaultCategory: FortuneCategory
  /** 该签种可问的分类；缺省 = 全部。月老灵签专问姻缘，只有 ['love']，前端会隐藏分类选择。 */
  categories?: FortuneCategory[]
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
    askPlaceholder: '例如：最近的事情会有好结果吗？',
    defaultCategory: 'luck',
    // 紫竹林观音：签筒/主色取紫竹色，与关帝红、月老粉、答案之书藏青区分
    primary: '#6B5B95',
    primaryDeep: '#4A3F73',
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
    askPlaceholder: '例如：这次事业调动顺利吗？',
    defaultCategory: 'career',
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
    askPlaceholder: '例如：我和 TA 的缘分会走到哪一步？',
    defaultCategory: 'love',
    // 月老专管姻缘：不提供其他分类，问事阶段隐藏分类选择。
    categories: ['love'],
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
    askPlaceholder: '例如：我该接受这个新机会吗？',
    defaultCategory: 'decision',
    primary: '#33477A',
    primaryDeep: '#1D2A52',
    paper: '#F2EEE2',
    accent: '#C9A227',
    ink: '#2E2C26',
  },
}

/** 占位文案去掉「例如：」前缀，作为用户未填问题时的默认问事。 */
export function defaultQuestion(theme: DeckTheme): string {
  return theme.askPlaceholder.replace(/^例如：/, '')
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
  { key: 'luck', label: '运势', icon: '🔮' },
  { key: 'career', label: '事业', icon: '💼' },
  { key: 'wealth', label: '财运', icon: '💰' },
  { key: 'love', label: '姻缘', icon: '❤️' },
  { key: 'health', label: '健康', icon: '🌿' },
  { key: 'study', label: '学业', icon: '📚' },
  { key: 'decision', label: '抉择', icon: '⚖️' },
  { key: 'other', label: '其他', icon: '✨' },
]

/** 该签种可问的分类列表（缺省全部；月老只有姻缘）。 */
export function deckCategories(theme: DeckTheme): typeof FORTUNE_CATEGORIES {
  if (!theme.categories) return FORTUNE_CATEGORIES
  return FORTUNE_CATEGORIES.filter((c) => theme.categories!.includes(c.key))
}

export const GRAIL_COPY: Record<GrailResult, { title: string; desc: string }> = {
  sheng: { title: '圣杯', desc: '一正一反，神明应允——此签灵验，放心参详。' },
  xiao: { title: '笑杯', desc: '两杯皆正，神明笑而不语——不如换个问法，再掷一次？' },
  yin: { title: '阴杯', desc: '两杯皆反，时机未到——此事且缓，改日再问。' },
}

/** 掷杯次数上限：每抽一支签最多掷 3 次（传统讲究「事不过三」）。想调整改这里即可。 */
export const GRAIL_MAX_CASTS = 3

/** 掷一次杯：两瓣杯各自 50% 正反，一正一反为圣杯（1/2），两正笑杯、两反阴杯（各 1/4）。 */
export function throwGrail(): { result: GrailResult; cups: [boolean, boolean] } {
  const a = Math.random() < 0.5
  const b = Math.random() < 0.5
  return { result: a === b ? (a ? 'xiao' : 'yin') : 'sheng', cups: [a, b] }
}
