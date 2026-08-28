/**
 * 飞行棋纯规则镜像（与后端 app/Service/Ludo/LudoRule.php 平行实现，常量两边同步——
 * 同拼豆色卡/unoChat 的既有约定）：仅用于即时 UI 反馈与 Node 单测，冲突以 PHP 为准。
 *
 * 几何模型（玩家相对距离 d）：
 * - 主道 52 格闭环，颜色每 4 格循环，各色起飞格相距 13；
 * - d=0 己方起飞格（星标），d=1..50 主道（己色格 = d≡0 mod 4），d=51..55 己方跑道（私有），d=56 终点；
 * - 每机 4 架，pos = -1（机场）或 0..56。
 *
 * 本文件不 import 任何 uni API（Node 可测）。
 */

/** 每人飞机数。 */
export const PLANES = 4

/** 全程：0 起飞格 … 50 主道末格，51-55 跑道，56 终点。 */
export const JOURNEY = 56

/** 主道格数。 */
export const MAIN_CELLS = 52

/** 起飞所需点数（掷 6 起飞并再掷一次）。 */
export const TAKEOFF_ROLL = 6

/** 飞行格（相对距离）：飞行【取代】跳跃；跳跃落上它同样触发飞行。 */
export const FLY_FROM = 16

export const FLY_TO = 28

/** 飞行弧正下方的碾压格（相对距离）。 */
export const CRUSH_CELL = 22

/** 星标保护格（相对距离 = 四个起飞格）：不可击落、可共存。 */
export const STAR_CELLS = [0, 13, 26, 39] as const

/** 座位数 → 座位颜色映射（0红/1黄/2蓝/3绿）。2 人取对角（飞线穿越对手区）。 */
export const SEAT_COLORS: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }

export const HANGAR = -1

export const COLOR_NAMES = ['红', '黄', '蓝', '绿'] as const

/** 规则引擎需要的最小状态（完整房间状态是其超集）。 */
export interface LudoCoreState {
  planes: number[][]
  colors: number[]
  leftSeats: number[]
  finishedOrder: number[]
  leftProgress?: Record<string, number[]>
}

/** 移动效果（fx 序列，前端据此播音效/播报；v = 被击落 [seat, planeIdx] 列表）。 */
export interface LudoFx {
  t: 'takeoff' | 'jump' | 'fly' | 'crush' | 'capture' | 'finish'
  d?: number
  from?: number
  to?: number
  p?: number
  v?: number[][]
}

/** 一次完整走法：航点（arc=飞行弧段）+ 效果序列 + 终点。 */
export interface LudoMove {
  p: number
  from: number
  to: number
  wp: Array<{ d: number, arc?: boolean }>
  fx: LudoFx[]
  finish: boolean
}

/** 某色起飞格的绝对格（红 0 / 黄 13 / 蓝 26 / 绿 39）。 */
export function colorStart(color: number): number {
  return color * 13
}

/** 相对距离 d（≤50）的绝对格。 */
export function absoluteCell(color: number, d: number): number {
  return (colorStart(color) + d) % MAIN_CELLS
}

/** $cell（相对距离 ≤50）上的敌机（星标格除外）：被击落/碾压的 [seat, planeIdx] 列表。 */
export function victimsAt(state: LudoCoreState, seat: number, color: number, cell: number): number[][] {
  const abs = absoluteCell(color, cell)
  if ((STAR_CELLS as readonly number[]).includes(abs)) return []
  const victims: number[][] = []
  for (let s = 0; s < state.planes.length; s++) {
    if (s === seat || state.leftSeats.includes(s)) continue
    for (let p = 0; p < state.planes[s].length; p++) {
      const their = state.planes[s][p]
      if (their >= 0 && their <= 50 && absoluteCell(state.colors[s], their) === abs) {
        victims.push([s, p])
      }
    }
  }
  return victims
}

/**
 * 核心求解：座位 $seat 的 $planeIdx 号机掷 $roll 的完整走法（与 PHP resolveMove 逐行对应）。
 * 判定顺序：每次到格先结算击落（星标除外），再触发移动效果；跳后不再跳、但跳上飞行格要飞。
 */
export function resolveMove(state: LudoCoreState, seat: number, planeIdx: number, roll: number): LudoMove | null {
  if (planeIdx < 0 || planeIdx >= PLANES) return null
  const pos = state.planes[seat][planeIdx]
  const color = state.colors[seat]

  if (pos === HANGAR) {
    if (roll !== TAKEOFF_ROLL) return null
    // 起飞落 d=0 星标格：无击落无效果（与敌机共存）
    return { p: planeIdx, from: pos, to: 0, wp: [{ d: 0 }], fx: [{ t: 'takeoff', p: planeIdx }], finish: false }
  }
  if (pos === JOURNEY) return null // 已到终点的飞机不能再动（防反弹步把完成机拉回来）

  // 骰步：主道上掷任何点数都不会越过 56；仅跑道内会反弹（newD = 112 − pos − roll）
  const target = pos + roll
  const overshoot = target > JOURNEY
  const newD = overshoot ? 2 * JOURNEY - target : target
  const wp: LudoMove['wp'] = overshoot ? [{ d: JOURNEY }, { d: newD }] : [{ d: newD }]
  const fx: LudoFx[] = []

  let cur = newD
  let mechanism: 'dice' | 'jump' | 'fly' = 'dice'
  for (let hop = 0; hop < 4; hop++) {
    const onMain = cur <= 50
    if (onMain) {
      const victims = victimsAt(state, seat, color, cur)
      if (victims.length) fx.push({ t: 'capture', d: cur, v: victims })
    }
    if (!onMain || cur % 4 !== 0 || cur < 4 || cur > 48) break // 非己色格 / 起飞格 / 48 死格 / 跑道
    if (cur === FLY_FROM && mechanism !== 'fly') {
      // 飞行（取代跳跃；飞落 28 后的接跳走下一轮 hop）
      fx.push({ t: 'fly', from: FLY_FROM, to: FLY_TO })
      const crush = victimsAt(state, seat, color, CRUSH_CELL)
      if (crush.length) fx.push({ t: 'crush', d: CRUSH_CELL, v: crush })
      wp.push({ d: FLY_TO, arc: true })
      cur = FLY_TO
      mechanism = 'fly'
      continue
    }
    if ((mechanism === 'dice' || mechanism === 'fly') && cur <= 44) {
      // 48 不跳（目标 52 已入跑道）
      fx.push({ t: 'jump', from: cur, to: cur + 4 })
      wp.push({ d: cur + 4 })
      cur += 4
      mechanism = 'jump'
      continue
    }
    break // 跳后不再跳（落点是己色也不再跳）
  }

  return { p: planeIdx, from: pos, to: cur, wp, fx, finish: cur === JOURNEY }
}

/** 掷骰后的合法走法菜单（每架可走的机一条）。 */
export function legalMoves(state: LudoCoreState, seat: number, roll: number): LudoMove[] {
  const moves: LudoMove[] = []
  for (let p = 0; p < PLANES; p++) {
    const move = resolveMove(state, seat, p, roll)
    if (move) moves.push(move)
  }
  return moves
}

/** 应用走法：更新飞机坐标、结算击落/碾压、记录完成（Service 层负责事件入环与回合推进）。 */
export function applyMove(state: LudoCoreState, seat: number, planeIdx: number, roll: number): LudoFx[] {
  const outcome = resolveMove(state, seat, planeIdx, roll)
  if (!outcome) return []
  for (const item of outcome.fx) {
    if (item.t === 'capture' || item.t === 'crush') {
      for (const [s, p] of item.v ?? []) state.planes[s][p] = HANGAR
    }
  }
  state.planes[seat][planeIdx] = outcome.to
  const events: LudoFx[] = [...outcome.fx]
  if (outcome.finish) {
    events.push({ t: 'finish', p: planeIdx })
    if (seatFinished(state, seat) && !state.finishedOrder.includes(seat)) state.finishedOrder.push(seat)
  }
  return events
}

/** 座位是否 4 机全部到终点。 */
export function seatFinished(state: LudoCoreState, seat: number): boolean {
  return state.planes[seat].every((pos) => pos === JOURNEY)
}

/** 活跃（未离开未完成）座位里从 fromSeat 顺时针下一个。 */
export function nextSeat(state: LudoCoreState, seatCount: number, fromSeat: number): number {
  for (let i = 1; i <= seatCount; i++) {
    const s = (fromSeat + i) % seatCount
    if (!state.leftSeats.includes(s) && !state.finishedOrder.includes(s)) return s
  }
  return fromSeat
}

/** 终局判定：活跃未完成座位 ≤ 1。 */
export function isGameOver(state: LudoCoreState, seatCount: number): boolean {
  let found = -1
  for (let s = 0; s < seatCount; s++) {
    if (state.leftSeats.includes(s) || state.finishedOrder.includes(s)) continue
    if (found === -1) found = s
    else return false
  }
  return true
}

/**
 * 终局排名（seat → 1-based 名次），三组依次：完成顺序、活跃未完成（到终机数/进度和/座位号）、
 * 离开者（同规则、用 leftProgress 快照）——中途退出永不排在存活者之前。
 */
export function computePlaces(state: LudoCoreState, seatCount: number): Record<number, number> {
  const ranked = [...state.finishedOrder]
  const entryOf = (s: number) => {
    const planes = state.leftSeats.includes(s) ? (state.leftProgress?.[String(s)] ?? []) : state.planes[s]
    let done = 0
    let progress = 0
    for (const pos of planes) {
      if (pos === JOURNEY) done++
      if (pos > 0) progress += pos
    }
    return { seat: s, done, progress }
  }
  const cmp = (a: { seat: number, done: number, progress: number }, b: { seat: number, done: number, progress: number }) =>
    b.done - a.done || b.progress - a.progress || a.seat - b.seat
  const activeTail: ReturnType<typeof entryOf>[] = []
  const leftTail: ReturnType<typeof entryOf>[] = []
  for (let s = 0; s < seatCount; s++) {
    if (ranked.includes(s)) continue
    ;(state.leftSeats.includes(s) ? leftTail : activeTail).push(entryOf(s))
  }
  activeTail.sort(cmp)
  leftTail.sort(cmp)
  for (const item of [...activeTail, ...leftTail]) ranked.push(item.seat)
  const places: Record<number, number> = {}
  ranked.forEach((s, i) => {
    places[s] = i + 1
  })
  return places
}

/** 超时/托管自动选机（确定性）：能终局 > 击落数（含碾压）> 前进量，平局取最小机号。
 * 注意前进量可为负（终点反弹 to<from），初值必须取 -Infinity——否则唯一走法是反弹时会误返回 null。 */
export function pickAuto(moves: LudoMove[]): number | null {
  let best: number | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const move of moves) {
    let victims = 0
    for (const item of move.fx) {
      if (item.t === 'capture' || item.t === 'crush') victims += (item.v ?? []).length
    }
    const score = (move.finish ? 1000 : 0) + 100 * victims + (move.to - move.from)
    if (score > bestScore) {
      bestScore = score
      best = move.p
    }
  }
  return best
}

/** 初始状态（纯函数，随机先手由调用方注入）。 */
export function initialState(seatCount: number, firstSeat: number): LudoCoreState {
  return {
    planes: Array.from({ length: seatCount }, () => Array<number>(PLANES).fill(HANGAR)),
    colors: [...SEAT_COLORS[seatCount]],
    leftSeats: [],
    finishedOrder: [],
    leftProgress: {},
  }
}
