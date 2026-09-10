/**
 * 象棋纯规则镜像：与后端 app/Service/Xiangqi/XiangqiRule.php 双份同步。
 * 后端是权威（应将/将死/超时代走都以服务端为准），这里只做落点提示与单测锁定。
 * 坐标：交点绝对坐标 c0-8、r0-9；黑上 r0-4、红下 r5-9。规则唯一事实源：docs/xiangqi-rules.md。
 */

import type { XiangqiPiece, XiangqiPieceType, XiangqiSide } from '@/types/xiangqi'

export const ROWS = 10
export const COLS = 9

export const RED: XiangqiSide = 'red'
export const BLACK: XiangqiSide = 'black'

export const PIECE_NAMES: Record<XiangqiSide, Record<XiangqiPieceType, string>> = {
  red: { r: '车', h: '马', c: '炮', e: '相', a: '仕', k: '帅', p: '兵' },
  black: { r: '车', h: '马', c: '炮', e: '象', a: '士', k: '将', p: '卒' },
}

const HORSE_JUMPS: Array<[number, number, number, number]> = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
]

export function opponent(side: XiangqiSide): XiangqiSide {
  return side === RED ? BLACK : RED
}

export function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

export function inPalace(side: XiangqiSide, r: number, c: number): boolean {
  if (c < 3 || c > 5) return false
  return side === BLACK ? r <= 2 : r >= 7
}

export function ownHalf(side: XiangqiSide, r: number): boolean {
  return side === RED ? r >= 5 : r <= 4
}

export function crossedRiver(side: XiangqiSide, r: number): boolean {
  return side === RED ? r <= 4 : r >= 5
}

/** 标准开局 32 子。 */
export function standardPieces(): XiangqiPiece[] {
  const pieces: XiangqiPiece[] = []
  const back: XiangqiPieceType[] = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r']
  back.forEach((piece, c) => {
    pieces.push({ side: BLACK, piece, r: 0, c, alive: true })
    pieces.push({ side: RED, piece, r: 9, c, alive: true })
  })
  for (const [c, r] of [[1, 2], [7, 2]] as Array<[number, number]>) {
    pieces.push({ side: BLACK, piece: 'c', r, c, alive: true })
    pieces.push({ side: RED, piece: 'c', r: 9 - r, c, alive: true })
  }
  for (const c of [0, 2, 4, 6, 8]) {
    pieces.push({ side: BLACK, piece: 'p', r: 3, c, alive: true })
    pieces.push({ side: RED, piece: 'p', r: 6, c, alive: true })
  }
  return pieces
}

export function pieceAt(pieces: XiangqiPiece[], r: number, c: number): XiangqiPiece | null {
  return pieces.find(p => p.alive && p.r === r && p.c === c) ?? null
}

export function kingSquare(pieces: XiangqiPiece[], side: XiangqiSide): [number, number] | null {
  const king = pieces.find(p => p.alive && p.side === side && p.piece === 'k')
  return king ? [king.r, king.c] : null
}

/** 伪合法目标（走法层；目标为己方子排除；应将/对脸过滤在 legalTargets）。 */
export function pseudoTargets(pieces: XiangqiPiece[], fr: number, fc: number): Array<[number, number]> {
  const piece = pieceAt(pieces, fr, fc)
  if (!piece) return []
  const { side, piece: type } = piece
  const out: Array<[number, number]> = []
  const push = (tr: number, tc: number) => {
    if (!inBoard(tr, tc)) return
    const target = pieceAt(pieces, tr, tc)
    if (target && target.side === side) return
    out.push([tr, tc])
  }

  if (type === 'r' || type === 'c') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      let screen = false
      let tr = fr + dr
      let tc = fc + dc
      while (inBoard(tr, tc)) {
        const blocker = pieceAt(pieces, tr, tc)
        if (!blocker) {
          if (!screen) out.push([tr, tc])
        } else {
          if (!screen) {
            if (type === 'r' && blocker.side !== side) out.push([tr, tc])
            screen = true
            if (type === 'r') break
          } else {
            if (type === 'c' && blocker.side !== side) out.push([tr, tc])
            break
          }
        }
        tr += dr
        tc += dc
      }
    }
    return out
  }

  if (type === 'h') {
    for (const [dr, dc, lr, lc] of HORSE_JUMPS) {
      const tr = fr + dr
      const tc = fc + dc
      if (!inBoard(tr, tc) || pieceAt(pieces, fr + lr, fc + lc)) continue
      push(tr, tc)
    }
    return out
  }

  if (type === 'e') {
    for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]] as Array<[number, number]>) {
      const tr = fr + dr
      const tc = fc + dc
      if (!inBoard(tr, tc) || !ownHalf(side, tr)) continue
      if (pieceAt(pieces, fr + dr / 2, fc + dc / 2)) continue
      push(tr, tc)
    }
    return out
  }

  if (type === 'a') {
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as Array<[number, number]>) {
      const tr = fr + dr
      const tc = fc + dc
      if (inPalace(side, tr, tc)) push(tr, tc)
    }
    return out
  }

  if (type === 'k') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      const tr = fr + dr
      const tc = fc + dc
      if (inPalace(side, tr, tc)) push(tr, tc)
    }
    return out
  }

  // 兵/卒：过河前只进；过河后可横；永不后退
  const forward = side === RED ? -1 : 1
  push(fr + forward, fc)
  if (crossedRiver(side, fr)) {
    push(fr, fc - 1)
    push(fr, fc + 1)
  }
  return out
}

/** 在副本上模拟走子（被吃子 alive=false）。 */
export function simulateMove(pieces: XiangqiPiece[], fr: number, fc: number, tr: number, tc: number): XiangqiPiece[] {
  return pieces.map((p) => {
    if (p.alive && p.r === fr && p.c === fc) return { ...p, r: tr, c: tc }
    if (p.alive && p.r === tr && p.c === tc) return { ...p, alive: false }
    return p
  })
}

export function kingsFacing(pieces: XiangqiPiece[]): boolean {
  const red = kingSquare(pieces, RED)
  const black = kingSquare(pieces, BLACK)
  if (!red || !black || red[1] !== black[1]) return false
  const top = Math.min(red[0], black[0])
  const bottom = Math.max(red[0], black[0])
  for (let r = top + 1; r < bottom; r++) {
    if (pieceAt(pieces, r, red[1])) return false
  }
  return true
}

/** (kr,kc) 是否被对方攻击（炮含隔架、兵含横攻）。 */
export function isSquareAttacked(pieces: XiangqiPiece[], side: XiangqiSide, kr: number, kc: number): boolean {
  const enemy = opponent(side)
  return pieces.some((p) => {
    if (!p.alive || p.side !== enemy) return false
    return pseudoTargets(pieces, p.r, p.c).some(([tr, tc]) => tr === kr && tc === kc)
  })
}

export function inCheck(pieces: XiangqiPiece[], side: XiangqiSide): boolean {
  const king = kingSquare(pieces, side)
  if (!king) return true
  return isSquareAttacked(pieces, side, king[0], king[1])
}

/** 合法目标 = 伪合法目标中，走子后不被将军、不与对方将帅对脸者。 */
export function legalTargets(pieces: XiangqiPiece[], side: XiangqiSide, fr: number, fc: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [tr, tc] of pseudoTargets(pieces, fr, fc)) {
    const simulated = simulateMove(pieces, fr, fc, tr, tc)
    const king = kingSquare(simulated, side)
    if (!king) continue
    if (isSquareAttacked(simulated, side, king[0], king[1])) continue
    if (kingsFacing(simulated)) continue
    out.push([tr, tc])
  }
  return out
}

/** 走子是否合法；返回 null 表示合法，否则返回错误键（与后端一字不差）。 */
export function validateMove(pieces: XiangqiPiece[], turn: XiangqiSide, fr: number, fc: number, tr: number, tc: number): string | null {
  if (!inBoard(fr, fc) || !inBoard(tr, tc)) return 'out_of_range'
  const piece = pieceAt(pieces, fr, fc)
  if (!piece) return 'no_piece'
  if (piece.side !== turn) return 'not_yours'
  const target = pieceAt(pieces, tr, tc)
  if (target && target.side === turn) return 'blocked_own'
  if (!legalTargets(pieces, turn, fr, fc).some(([hr, hc]) => hr === tr && hc === tc)) return 'illegal_move'
  return null
}

/** 在快照副本上执行走子（被吃子保留原位 alive=false 供阵亡托盘）。 */
export function applyMove(
  pieces: XiangqiPiece[],
  fr: number,
  fc: number,
  tr: number,
  tc: number,
): { pieces: XiangqiPiece[]; captured: XiangqiPieceType | null } {
  const next: XiangqiPiece[] = []
  let captured: XiangqiPieceType | null = null
  for (const p of pieces) {
    if (p.alive && p.r === fr && p.c === fc) next.push({ ...p, r: tr, c: tc })
    else if (p.alive && p.r === tr && p.c === tc) {
      captured = p.piece
      next.push({ ...p, alive: false })
    } else next.push(p)
  }
  return { pieces: next, captured }
}

export function hasAnyLegalMove(pieces: XiangqiPiece[], side: XiangqiSide): boolean {
  return pieces.some((p) => {
    if (p.side !== side || !p.alive) return false
    return legalTargets(pieces, side, p.r, p.c).length > 0
  })
}
