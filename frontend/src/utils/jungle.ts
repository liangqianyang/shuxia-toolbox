/**
 * 斗兽棋纯逻辑：无 uni API 依赖，Node 单测可直接 import。
 * 与后端 app/Service/Jungle/JungleRule.php 平行实现——后端是权威，
 * 这里只做落点提示（选中动物 → 合法目标格）与触摸坐标换算，冲突以服务端为准。
 */

import type { JungleAnimal, JunglePiece, JungleSide } from '@/types/jungle'

export const ROWS = 9
export const COLS = 7

/** 动物等级：鼠 1 … 象 8 */
export const RANKS: Record<JungleAnimal, number> = {
  rat: 1,
  cat: 2,
  dog: 3,
  wolf: 4,
  leopard: 5,
  tiger: 6,
  lion: 7,
  elephant: 8,
}

/** 渲染用汉字（棋子/托盘/规则链共用）。 */
export const ANIMAL_CN: Record<JungleAnimal, string> = {
  rat: '鼠',
  cat: '猫',
  dog: '狗',
  wolf: '狼',
  leopard: '豹',
  tiger: '虎',
  lion: '狮',
  elephant: '象',
}

/** 等级链（大到小），规则抽屉用。 */
export const RANK_ORDER: JungleAnimal[] = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'rat']

/** 河流格：rows 3-5 × cols {1,2,4,5} */
const RIVER_LOOKUP: boolean[][] = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => r >= 3 && r <= 5 && [1, 2, 4, 5].includes(c)),
)

/** 兽穴 side → [r, c] */
export const DEN_CELLS: Record<JungleSide, [number, number]> = {
  blue: [0, 3],
  red: [8, 3],
}

/** 陷阱 side → 格列表（该方兽穴旁三格，敌方踏入等级归零）。 */
export const TRAP_CELLS: Record<JungleSide, Array<[number, number]>> = {
  blue: [[0, 2], [0, 4], [1, 3]],
  red: [[8, 2], [8, 4], [7, 3]],
}

/** 狮虎跳河的水平列配对：0↔3、3↔6。 */
export const JUMP_COL_PAIRS: Array<[number, number]> = [[0, 3], [3, 6]]

/** 经典初始摆位 16 子：蓝方（上方）+ 红方（180° 镜像）。 */
export function initialPieces(): JunglePiece[] {
  const blue: Array<{ animal: JungleAnimal; r: number; c: number }> = [
    { animal: 'lion', r: 0, c: 0 },
    { animal: 'tiger', r: 0, c: 6 },
    { animal: 'dog', r: 1, c: 1 },
    { animal: 'cat', r: 1, c: 5 },
    { animal: 'rat', r: 2, c: 0 },
    { animal: 'leopard', r: 2, c: 2 },
    { animal: 'wolf', r: 2, c: 4 },
    { animal: 'elephant', r: 2, c: 6 },
  ]
  const pieces: JunglePiece[] = blue.map((p) => ({ side: 'blue' as const, ...p }))
  for (const p of blue) {
    pieces.push({ side: 'red', animal: p.animal, r: ROWS - 1 - p.r, c: COLS - 1 - p.c })
  }
  return pieces
}

export function opponentOf(side: JungleSide): JungleSide {
  return side === 'red' ? 'blue' : 'red'
}

export function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

export function isRiver(r: number, c: number): boolean {
  return RIVER_LOOKUP[r]?.[c] === true
}

export function isDenOf(side: JungleSide, r: number, c: number): boolean {
  const [dr, dc] = DEN_CELLS[side]
  return r === dr && c === dc
}

export function isTrapOf(side: JungleSide, r: number, c: number): boolean {
  return TRAP_CELLS[side].some(([tr, tc]) => tr === r && tc === c)
}

export function pieceAt(pieces: JunglePiece[], r: number, c: number): JunglePiece | null {
  return pieces.find((p) => p.r === r && p.c === c) ?? null
}

/**
 * 攻击方能否吃掉守方：水陆隔离优先；守方踩攻方陷阱 → 等级 0；
 * 鼠吃象（陆对陆）/ 象不能吃鼠（陷阱归零除外）；默认大吃小、同级互吃。
 */
export function canCapture(attacker: JunglePiece, defender: JunglePiece): boolean {
  if (isRiver(attacker.r, attacker.c) !== isRiver(defender.r, defender.c)) return false
  if (isTrapOf(attacker.side, defender.r, defender.c)) return true
  if (attacker.animal === 'rat' && defender.animal === 'elephant') return true
  if (attacker.animal === 'elephant' && defender.animal === 'rat') return false
  return RANKS[attacker.animal] >= RANKS[defender.animal]
}

/** 走子校验：返回 null 表示合法，否则返回错误键（与后端 JungleRule 一致）。 */
export function validateMove(
  pieces: JunglePiece[],
  turn: JungleSide,
  fr: number,
  fc: number,
  tr: number,
  tc: number,
): string | null {
  if (!inBoard(fr, fc) || !inBoard(tr, tc)) return 'out_of_range'
  const piece = pieceAt(pieces, fr, fc)
  if (!piece) return 'no_piece'
  if (piece.side !== turn) return 'not_yours'
  if (isDenOf(turn, tr, tc)) return 'own_den'
  if (isRiver(tr, tc) && piece.animal !== 'rat') return 'into_water'
  const target = pieceAt(pieces, tr, tc)
  if (target && target.side === turn) return 'blocked_own'

  const adjacent = Math.abs(fr - tr) + Math.abs(fc - tc) === 1
  if (!adjacent) {
    if (piece.animal !== 'lion' && piece.animal !== 'tiger') return 'not_adjacent'
    if (fr !== tr || fr < 3 || fr > 5) return 'jump_invalid'
    const paired = JUMP_COL_PAIRS.some(
      ([a, b]) => (fc === a && tc === b) || (fc === b && tc === a),
    )
    if (!paired) return 'jump_invalid'
    const step = fc < tc ? 1 : -1
    for (let c = fc + step; c !== tc; c += step) {
      if (!isRiver(fr, c) || pieceAt(pieces, fr, c)) return 'jump_blocked'
    }
  }

  if (target && !canCapture(piece, target)) return 'cannot_capture'
  return null
}

/** 选中动物的落点提示：capture=红圈目标，jump=跳河路线（河面高亮）。 */
export interface JungleHint {
  r: number
  c: number
  capture: boolean
  jump: boolean
}

export function findLegalMoves(pieces: JunglePiece[], side: JungleSide, fr: number, fc: number): JungleHint[] {
  const piece = pieceAt(pieces, fr, fc)
  if (!piece || piece.side !== side) return []
  const targets: Array<[number, number]> = [
    [fr - 1, fc],
    [fr + 1, fc],
    [fr, fc - 1],
    [fr, fc + 1],
  ]
  if ((piece.animal === 'lion' || piece.animal === 'tiger') && fr >= 3 && fr <= 5) {
    for (const [a, b] of JUMP_COL_PAIRS) {
      if (fc === a) targets.push([fr, b])
      else if (fc === b) targets.push([fr, a])
    }
  }
  const hints: JungleHint[] = []
  for (const [tr, tc] of targets) {
    if (validateMove(pieces, side, fr, fc, tr, tc) !== null) continue
    hints.push({
      r: tr,
      c: tc,
      capture: pieceAt(pieces, tr, tc) !== null,
      jump: Math.abs(fc - tc) === 3,
    })
  }
  return hints
}

/** 走完一步后的即时胜负：入对方兽穴 'den' / 吃光对方 'eliminated'，否则 null。 */
export function findWin(pieces: JunglePiece[], mover: JungleSide, tr: number, tc: number): string | null {
  if (isDenOf(opponentOf(mover), tr, tc)) return 'den'
  return pieces.some((p) => p.side !== mover) ? null : 'eliminated'
}

/** $side 是否还有任何合法着法（困毙判定）。 */
export function hasAnyMove(pieces: JunglePiece[], side: JungleSide): boolean {
  return pieces.some(
    (p) => p.side === side && findLegalMoves(pieces, side, p.r, p.c).length > 0,
  )
}

/** 某方已被吃掉的动物列表（托盘展示，按等级从大到小）。 */
export function capturedOf(pieces: JunglePiece[], side: JungleSide): JungleAnimal[] {
  const alive = new Set(pieces.filter((p) => p.side === side).map((p) => p.animal))
  return RANK_ORDER.filter((animal) => !alive.has(animal))
}

/** 存活数。 */
export function aliveCount(pieces: JunglePiece[], side: JungleSide): number {
  return pieces.filter((p) => p.side === side).length
}

/** 棋盘渲染几何（css px）：格子尺寸取宽高双向约束，居中排布。 */
export interface JungleBoardMetrics {
  width: number
  height: number
  cell: number
  offsetX: number
  offsetY: number
}

export function boardMetrics(width: number, height: number): JungleBoardMetrics {
  const cell = Math.min(width / COLS, height / ROWS)
  return {
    width,
    height,
    cell,
    offsetX: (width - cell * COLS) / 2,
    offsetY: (height - cell * ROWS) / 2,
  }
}

/** 格坐标 → 格左上角画布坐标。 */
export function cellRect(r: number, c: number, metrics: JungleBoardMetrics): { x: number; y: number; size: number } {
  return { x: metrics.offsetX + c * metrics.cell, y: metrics.offsetY + r * metrics.cell, size: metrics.cell }
}

/** 触摸点（画布内 css px）→ 格坐标；落在棋盘边界外返回 null。 */
export function pointToCell(px: number, py: number, metrics: JungleBoardMetrics): { r: number; c: number } | null {
  const c = Math.floor((px - metrics.offsetX) / metrics.cell)
  const r = Math.floor((py - metrics.offsetY) / metrics.cell)
  if (!inBoard(r, c)) return null
  return { r, c }
}
