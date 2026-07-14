import type {
  LotteryOption,
  LotteryPrize,
  LotterySpecialGift,
  PrizePoolItem,
  SpecialGiftValidation,
} from '@/types/lottery'

export type RandomSource = () => number

export function parseLotteryLines(value: string): string[] {
  const seen = new Set<string>()
  const entries: string[] = []
  for (const raw of value.split(/\r?\n/)) {
    const label = raw.trim()
    if (!label) continue
    const key = label.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(label)
  }
  return entries
}

export function findDuplicateLotteryLines(value: string): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []
  const duplicateKeys = new Set<string>()

  for (const raw of value.split(/\r?\n/)) {
    const label = raw.trim()
    if (!label) continue
    const key = label.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      continue
    }
    if (!duplicateKeys.has(key)) {
      duplicates.push(label)
      duplicateKeys.add(key)
    }
  }
  return duplicates
}

export function validateSpecialGifts(
  prizes: LotteryPrize[],
  gifts: LotterySpecialGift[],
  options: { requireRecipient?: boolean } = {},
): SpecialGiftValidation {
  const requireRecipient = options.requireRecipient ?? true
  const prizeMap = new Map(prizes.map((prize) => [prize.id, prize]))
  const reservedByPrize: Record<string, number> = {}
  const errors: string[] = []

  for (const gift of gifts) {
    const prize = prizeMap.get(gift.prizeId)
    if (!prize) {
      errors.push('有特别赠礼没有选择有效奖品')
      continue
    }
    if (requireRecipient && !gift.recipient.trim()) errors.push(`${prize.name || '奖品'}缺少获赠人`)
    if (!Number.isInteger(gift.quantity) || gift.quantity < 1) {
      errors.push(`${prize.name || '奖品'}的赠礼数量无效`)
      continue
    }
    reservedByPrize[prize.id] = (reservedByPrize[prize.id] ?? 0) + gift.quantity
  }

  for (const prize of prizes) {
    const reserved = reservedByPrize[prize.id] ?? 0
    if (reserved > prize.quantity) {
      errors.push(`${prize.name || '未命名奖品'}预留 ${reserved} 份，超过库存 ${prize.quantity} 份`)
    }
  }

  return { valid: errors.length === 0, errors, reservedByPrize }
}

export function calculatePrizePool(
  prizes: LotteryPrize[],
  gifts: LotterySpecialGift[],
  awardedByPrize: Record<string, number> = {},
): PrizePoolItem[] {
  const { reservedByPrize } = validateSpecialGifts(prizes, gifts, { requireRecipient: false })
  const items = prizes.map((prize) => {
    const reserved = reservedByPrize[prize.id] ?? 0
    const awarded = awardedByPrize[prize.id] ?? 0
    const remaining = Math.max(0, prize.quantity - reserved - awarded)
    const effectiveWeight = remaining * Math.max(0, prize.weight)
    return { prizeId: prize.id, remaining, effectiveWeight, probability: 0 }
  })
  const totalWeight = items.reduce((sum, item) => sum + item.effectiveWeight, 0)
  return items.map((item) => ({
    ...item,
    probability: totalWeight > 0 ? item.effectiveWeight / totalWeight : 0,
  }))
}

export function pickWeighted<T>(
  items: T[],
  getWeight: (item: T) => number,
  random: RandomSource = Math.random,
): T | null {
  const weighted = items
    .map((item) => ({ item, weight: Math.max(0, getWeight(item)) }))
    .filter((entry) => entry.weight > 0)
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return null

  let cursor = Math.min(0.999999999999, Math.max(0, random())) * total
  for (const entry of weighted) {
    if (cursor < entry.weight) return entry.item
    cursor -= entry.weight
  }
  return weighted[weighted.length - 1]?.item ?? null
}

export function pickRandom<T>(items: T[], random: RandomSource = Math.random): T | null {
  if (!items.length) return null
  const index = Math.min(items.length - 1, Math.floor(Math.max(0, random()) * items.length))
  return items[index] ?? null
}

export function drawWeightedOptions(
  options: LotteryOption[],
  count: number,
  excludedIds: Set<string> = new Set(),
  allowRepeat = false,
  random: RandomSource = Math.random,
): LotteryOption[] {
  const available = options.filter((option) => !excludedIds.has(option.id) && option.weight > 0)
  const result: LotteryOption[] = []
  const targetCount = Math.max(0, Math.floor(count))

  for (let index = 0; index < targetCount; index++) {
    const pool = allowRepeat ? available : available.filter((option) => !result.some((item) => item.id === option.id))
    const selected = pickWeighted(pool, (option) => option.weight, random)
    if (!selected) break
    result.push(selected)
  }
  return result
}

export function createBalancedGroups<T>(
  items: T[],
  groupCount: number,
  random: RandomSource = Math.random,
): T[][] {
  if (!items.length) return []
  const safeCount = Math.max(1, Math.min(items.length, Math.floor(groupCount)))
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.min(index, Math.floor(Math.max(0, random()) * (index + 1)))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  const groups = Array.from({ length: safeCount }, () => [] as T[])
  shuffled.forEach((item, index) => groups[index % safeCount].push(item))
  return groups
}
