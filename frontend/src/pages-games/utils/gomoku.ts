/**
 * 五子棋纯逻辑：无 uni API 依赖，Node 单测可直接 import。
 * 与后端 app/Service/Gomoku/GomokuRule.php 平行实现——后端是权威，
 * 这里只做即时 UI 反馈（本地乐观落子/胜利高亮）与触摸坐标换算，冲突以服务端为准。
 */

import type { GomokuColor, GomokuMove } from '@/types/gomoku'

export const BOARD_SIZE = 15
export const WIN_COUNT = 5

/** 0 空 / 1 黑 / 2 白 */
export const CELL_EMPTY = 0
export const CELL_BLACK = 1
export const CELL_WHITE = 2

export type GomokuBoard = number[][]

/** 星位（0-based）：四角星 + 天元 */
export const STAR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [3, 3],
  [11, 3],
  [3, 11],
  [11, 11],
  [7, 7],
]

export function createBoard(): GomokuBoard {
  return Array.from({ length: BOARD_SIZE }, () => new Array<number>(BOARD_SIZE).fill(CELL_EMPTY))
}

/** 第 i 手（0-based）落子的颜色：黑先，奇偶交替。 */
export function colorOfMoveIndex(index: number): GomokuColor {
  return index % 2 === 0 ? 'black' : 'white'
}

export function cellOfColor(color: GomokuColor): number {
  return color === 'black' ? CELL_BLACK : CELL_WHITE
}

/** 由有序落子序列还原棋盘。 */
export function boardFromMoves(moves: GomokuMove[]): GomokuBoard {
  const board = createBoard()
  moves.forEach((move, i) => {
    if (move.x < 0 || move.x >= BOARD_SIZE || move.y < 0 || move.y >= BOARD_SIZE) return
    board[move.y][move.x] = cellOfColor(colorOfMoveIndex(i))
  })
  return board
}

export function isLegalMove(board: GomokuBoard, x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && board[y][x] === CELL_EMPTY
}

/**
 * 从最后一手向 4 个方向数连续同色子，≥5 返回整条连线坐标，否则 null。
 * 休闲规则：长连（6+）也算赢。
 */
export function findWinLine(board: GomokuBoard, x: number, y: number, color: number): Array<[number, number]> | null {
  const directions: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (const [dx, dy] of directions) {
    const line: Array<[number, number]> = [[x, y]]
    for (const sign of [1, -1] as const) {
      let cx = x + dx * sign
      let cy = y + dy * sign
      while (cx >= 0 && cx < BOARD_SIZE && cy >= 0 && cy < BOARD_SIZE && board[cy][cx] === color) {
        if (sign === 1) line.push([cx, cy])
        else line.unshift([cx, cy])
        cx += dx * sign
        cy += dy * sign
      }
    }
    if (line.length >= WIN_COUNT) return line
  }
  return null
}

/** 棋盘渲染几何参数（css px）。 */
export interface BoardMetrics {
  /** 画布边长 */
  size: number
  /** 棋盘边缘到最外圈交叉点的距离 */
  padding: number
  /** 相邻交叉点间距 */
  cell: number
}

export function boardMetrics(size: number): BoardMetrics {
  const padding = size / (BOARD_SIZE + 1)
  const cell = (size - padding * 2) / (BOARD_SIZE - 1)
  return { size, padding, cell }
}

/** 交叉点坐标 → 画布坐标。 */
export function intersectionToPoint(x: number, y: number, metrics: BoardMetrics): { px: number; py: number } {
  return { px: metrics.padding + x * metrics.cell, py: metrics.padding + y * metrics.cell }
}

/** 触摸点（画布内 css px）→ 最近交叉点；容差 0.45 格，出界/太远返回 null。 */
export function pointToIntersection(px: number, py: number, metrics: BoardMetrics): GomokuMove | null {
  const fx = (px - metrics.padding) / metrics.cell
  const fy = (py - metrics.padding) / metrics.cell
  const x = Math.round(fx)
  const y = Math.round(fy)
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null
  if (Math.abs(fx - x) > 0.45 || Math.abs(fy - y) > 0.45) return null
  return { x, y }
}
