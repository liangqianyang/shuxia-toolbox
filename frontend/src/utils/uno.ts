/** UNO 纯规则镜像：与后端 App\Service\Uno\UnoRule 平行实现。
 *  仅用于即时 UI 反馈（手牌置灰/高亮）与单测；权威判定以后端为准。
 *  不 import uni 任何 API，Node 测试可直接引用。
 */

import type { UnoColor } from '@/types/uno'

export const UNO_COLORS: UnoColor[] = ['r', 'g', 'b', 'y']

/** 四季主题色：Q版糖果色系（与 unoCards.ts 渲染一致）。 */
export const COLOR_META: Record<UnoColor, { name: string; season: string; color: string; deep: string }> = {
  g: { name: '绿', season: '春', color: '#83cc90', deep: '#5aa568' },
  r: { name: '红', season: '夏', color: '#f4735f', deep: '#d05240' },
  y: { name: '黄', season: '秋', color: '#ffc95e', deep: '#e2a437' },
  b: { name: '蓝', season: '冬', color: '#7ab5e3', deep: '#5a93c4' },
}

export function cardColor(card: string): string {
  return card[0] ?? ''
}

export function cardValue(card: string): string {
  return card[1] ?? ''
}

export function isWild(card: string): boolean {
  return cardColor(card) === 'w'
}

export function isValidCard(card: string): boolean {
  const color = cardColor(card)
  const value = cardValue(card)
  if (color === 'w') return value === 'W' || value === 'F'
  if (!(UNO_COLORS as string[]).includes(color)) return false
  return (value >= '0' && value <= '9') || value === 'S' || value === 'R' || value === 'D'
}

/** 能否出在某顶牌上（wild/wild4 恒可出——合法性靠质疑，官方允许 bluff）。 */
export function canPlay(card: string, topCard: string, currentColor: string): boolean {
  if (isWild(card)) return true
  if (cardColor(card) === currentColor) return true
  return cardValue(card) === cardValue(topCard)
}

/** 一张牌的分值：数字按面值，功能牌 20，百搭 50。 */
export function scoreCard(card: string): number {
  const value = cardValue(card)
  if (isWild(card)) return 50
  if (value >= '0' && value <= '9') return Number(value)
  return 20
}

export function scoreHand(hand: string[]): number {
  return hand.reduce((sum, card) => sum + scoreCard(card), 0)
}

/** 理牌序：颜色按四季 春绿→夏红→秋黄→冬蓝，百搭压轴；色内数字 0-9，其后 S/R/D，百搭 变色牌→+4。 */
const HAND_COLOR_ORDER: Record<string, number> = { g: 0, r: 1, y: 2, b: 3, w: 4 }
const HAND_VALUE_ORDER: Record<string, number> = { S: 11, R: 12, D: 13, W: 14, F: 15 }

/** 手牌自动理牌：同色归堆，摸到的牌直接落进同色区。返回新数组（后端手牌顺序与展示解耦，出牌按牌码提交）。 */
export function sortHand(cards: string[]): string[] {
  const rank = (card: string): number => {
    const color = HAND_COLOR_ORDER[cardColor(card)] ?? 9
    const value = cardValue(card)
    const valueRank = value >= '0' && value <= '9' ? Number(value) : (HAND_VALUE_ORDER[value] ?? 99)
    return color * 100 + valueRank
  }
  return [...cards].sort((a, b) => rank(a) - rank(b))
}

/** 牌的展示名（提示/日志用）。 */
export function cardLabel(card: string): string {
  const value = cardValue(card)
  if (isWild(card)) return value === 'F' ? '王牌+4' : '变色牌'
  const season = COLOR_META[cardColor(card) as UnoColor]?.season ?? ''
  if (value === 'S') return `${season}·跳过`
  if (value === 'R') return `${season}·反转`
  if (value === 'D') return `${season}·+2`
  return `${season}·${value}`
}
