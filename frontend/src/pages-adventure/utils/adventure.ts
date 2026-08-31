/**
 * 枫趣冒险常量与展示侧规则助手。
 *
 * 与后端 App\Service\Adventure\{AdventureBoard,AdventureRule} 双份同步
 * （同拼豆色卡/unoChat 的约定）。与飞行棋不同：冒险棋的合法动作全部由服务端
 * 通过 pendingChoice / pendingDuel 下发，客户端不做合法性重算——本文件只提供
 * 常量、文案映射和落点预览这类展示逻辑。规则条文见 docs/adventure-rules.md。
 */

import { segmentOf } from './adventureBoard'

// ---------------------------------------------------------------- 道具

export interface ItemDef {
  name: string
  /** resolve=掷骰后走子前；any=自己回合任意阶段。 */
  when: 'resolve' | 'any'
  target: boolean
  desc: string
  icon: string
}

export const ITEMS: Record<string, ItemDef> = {
  pickaxe: { name: '登山镐', when: 'resolve', target: false, desc: '本回合骰和 +2', icon: '⛏️' },
  skis: { name: '滑雪板', when: 'any', target: false, desc: '免疫下一次滑坡/落石', icon: '🎿' },
  gale: { name: '大风咒', when: 'resolve', target: true, desc: '指定玩家退 4 格', icon: '🌪️' },
  snowball: { name: '雪球', when: 'resolve', target: true, desc: '指定玩家下回合 -3', icon: '❄️' },
  cloak: { name: '换位斗篷', when: 'resolve', target: true, desc: '与任意玩家换位', icon: '🧥' },
  cablecar: { name: '缆车票', when: 'resolve', target: false, desc: '前进到下一缆车站', icon: '🚡' },
  pouch: { name: '枫叶袋', when: 'any', target: false, desc: '+5 枫叶', icon: '🍁' },
  weather: { name: '改天换地', when: 'any', target: false, desc: '弃掉下一张天气牌', icon: '🔮' },
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id
}

// ---------------------------------------------------------------- 天气

export interface WeatherDef {
  name: string
  kind: 'instant' | 'rule'
  desc: string
  icon: string
}

export const WEATHER_CARDS: Record<string, WeatherDef> = {
  tailwind: { name: '顺风', kind: 'instant', desc: '全员前进 2 格', icon: '🍃' },
  galewind: { name: '山风骤起', kind: 'instant', desc: '全员后退 3 格', icon: '💨' },
  landslide: { name: '泥石流', kind: 'instant', desc: '第一名退 5，最后一名进 3', icon: '🪨' },
  leafrain: { name: '枫叶雨', kind: 'instant', desc: '全员 +3 枫叶', icon: '🍂' },
  tornado: { name: '龙卷风', kind: 'instant', desc: '掷骰 ≥4 进、≤3 退', icon: '🌀' },
  storm: { name: '暴风', kind: 'rule', desc: '滑坡/落石距离翻倍', icon: '🌬️' },
  fog: { name: '大雾', kind: 'rule', desc: '本轮禁用道具', icon: '🌫️' },
  cablehalt: { name: '缆车停运', kind: 'rule', desc: '缆车格变普通格', icon: '🚧' },
  sun: { name: '烈日', kind: 'rule', desc: '温泉 +4、补给摸 2', icon: '☀️' },
  huntwind: { name: '猎风', kind: 'rule', desc: '决斗胜者额外 +1', icon: '🦅' },
  pollen: { name: '花粉季', kind: 'rule', desc: '枫叶格 +4', icon: '🌸' },
  summitblizzard: { name: '封顶暴雪', kind: 'rule', desc: '无法进入雪线（截断 81）', icon: '🌨️' },
}

export function weatherName(id: string | null): string {
  if (!id) return '晴'
  return WEATHER_CARDS[id]?.name ?? id
}

export function weatherIcon(id: string | null): string {
  if (!id) return '🌤️'
  return WEATHER_CARDS[id]?.icon ?? '🌤️'
}

export function weatherDesc(id: string | null): string {
  if (!id) return '风平浪静'
  return WEATHER_CARDS[id]?.desc ?? ''
}

// ---------------------------------------------------------------- 决斗

export function duelFormatName(format: string): string {
  return format === 'rps' ? '猜拳' : format === 'bid' ? '暗标枫叶' : '比点数'
}

export function duelFormatHint(format: string): string {
  return format === 'rps' ? '双方暗出拳，胜者前进败者后退' : format === 'bid' ? '双方暗押枫叶，价高者胜且支付所标' : '各掷一骰，点数大者胜'
}

/** 落点所在段的决斗形式（展示侧；权威由服务端判定）。 */
export function duelFormatAt(pos: number): string {
  return segmentOf(pos).duel
}

export const RPS_LABELS: string[] = ['石头', '剪刀', '布']
export const RPS_KEYS: string[] = ['r', 'p', 's']

// ---------------------------------------------------------------- 数值常量（双端同步）

export const TURN_SECONDS = 20
export const RESOLVE_SECONDS = 10
export const CHOICE_SECONDS = 8
export const DUEL_SECONDS = 10
export const HAND_LIMIT = 3
export const SHOP_PRICE = 3
export const AMBUSH_PRICE = 2
export const BET_STAKE = 1
