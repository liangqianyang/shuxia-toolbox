/**
 * 井字棋纯规则镜像：与后端 app/Service/Tictactoe/TictactoeRule.php 双份同步。
 * 规则唯一事实源：docs/tictactoe-rules.md。冲突以后端为准。
 */

import type { TicTacToeMark } from '@/types/tictactoe'

/** 8 条胜利线（行优先格索引 0-8）。 */
export const LINES: Array<[number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export type TicTacToeBoard = Array<TicTacToeMark | null>

/** 落子后检测胜利线；返回 [执子方, 线下标] 或 null。 */
export function findWin(board: TicTacToeBoard, mark: TicTacToeMark): [TicTacToeMark, number] | null {
  for (let i = 0; i < LINES.length; i++) {
    const [a, b, c] = LINES[i]
    if (board[a] === mark && board[b] === mark && board[c] === mark) return [mark, i]
  }
  return null
}

export function isFull(board: TicTacToeBoard): boolean {
  return board.every(cell => cell === 'x' || cell === 'o')
}

export function emptyCells(board: TicTacToeBoard): number[] {
  const out: number[] = []
  board.forEach((cell, i) => {
    if (cell !== 'x' && cell !== 'o') out.push(i)
  })
  return out
}

export function other(mark: TicTacToeMark): TicTacToeMark {
  return mark === 'x' ? 'o' : 'x'
}
