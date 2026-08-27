/** 每日灵签类型定义。 */

export type DeckKey = 'guanyin' | 'guandi' | 'yuelao' | 'book'

export type FortuneCategory = 'luck' | 'career' | 'wealth' | 'love' | 'health' | 'study' | 'decision' | 'other'

/** 签文（灵签类有 level/title/verse/gist/interpretation；答案之书只有 no/answer）。 */
export interface FortuneStick {
  no: number
  level?: string
  title?: string
  verse?: string[]
  gist?: string
  interpretation?: string
  answer?: string
}

export interface FortuneQuota {
  limit: number
  used: number
  remaining: number
  /** 今日还可通过分享获得的次数 */
  bonusLeft: number
  /** 配额重置时间（明日 0 点） */
  resetAt: string
}

/** AI 解签四段式结果。 */
export interface FortuneReading {
  meaning: string
  forYou: string
  action: string
  luckyHint: string
}

export interface FortuneDrawResult {
  drawId: number
  deck: DeckKey
  stick: FortuneStick
  quota: FortuneQuota
}

export interface FortuneHistoryItem {
  drawId: number
  deck: DeckKey
  deckName: string
  category: string
  categoryName: string
  question: string | null
  stick: FortuneStick
  reading: FortuneReading | null
  createdAt: string
}

/** 掷杯结果：圣杯（一正一反）/ 笑杯（两正）/ 阴杯（两反）。 */
export type GrailResult = 'sheng' | 'xiao' | 'yin'
