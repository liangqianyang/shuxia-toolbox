/** 俄罗斯方块成绩接口：基于 requestUserApi（静默 wx.login + 自动带 X-User-Token,401 自动重登重试）。 */

import { requestUserApi } from '@/services/toolbox'

export interface TetrisLeaderboardEntry {
  rank: number
  nickname: string
  avatarUrl: string
  score: number
  lines: number
  level: number
}

export interface TetrisLeaderboard {
  entries: TetrisLeaderboardEntry[]
  mine: { rank: number; score: number; lines: number; level: number } | null
}

export interface TetrisSubmitResult {
  best: number
  isNewBest: boolean
  rank: number
}

export function submitTetrisScore(score: number, lines: number, level: number): Promise<TetrisSubmitResult> {
  return requestUserApi<TetrisSubmitResult>('/api/tetris/score', 'POST', { score, lines, level })
}

export function fetchTetrisLeaderboard(limit = 50): Promise<TetrisLeaderboard> {
  return requestUserApi<TetrisLeaderboard>('/api/tetris/leaderboard', 'GET', { limit })
}
