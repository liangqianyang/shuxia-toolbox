export type LotteryMode = 'prize' | 'random' | 'team'

export type LotteryNature = 'public' | 'internal'

export interface LotteryPrize {
  id: string
  name: string
  quantity: number
  weight: number
}

export interface LotterySpecialGift {
  id: string
  prizeId: string
  quantity: number
  recipient: string
}

export interface LotteryOption {
  id: string
  label: string
  weight: number
}

export interface LotteryAward {
  id: string
  source: 'random' | 'special'
  recipient: string
  prizeId: string
  prizeName: string
  quantity: number
  specialGiftId?: string
  createdAt: number
}

export interface LotteryOptionResult {
  id: string
  optionId: string
  label: string
  createdAt: number
}

export interface LotteryTeamResult {
  id: string
  name: string
  members: string[]
}

export interface LotteryHistoryItem {
  id: string
  name: string
  mode: LotteryMode
  completedAt: number
  summary: string
  rules: string
  resultText: string
}

export interface PrizePoolItem {
  prizeId: string
  remaining: number
  effectiveWeight: number
  probability: number
}

export interface SpecialGiftValidation {
  valid: boolean
  errors: string[]
  reservedByPrize: Record<string, number>
}
