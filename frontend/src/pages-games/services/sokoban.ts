/** 推箱子成绩接口（game_scores 复用,game_key='sokoban'）：基于 requestUserApi（静默 wx.login
 *  + 自动带 X-User-Token,401 自动重登重试）。score=总星数,levels=通关关数。
 */

import { requestUserApi } from '@/services/toolbox'

export interface SokobanLeaderboardEntry {
  rank: number
  nickname: string
  avatarUrl: string
  score: number
  levels: number
}

export interface SokobanLeaderboard {
  entries: SokobanLeaderboardEntry[]
  mine: { rank: number; score: number; levels: number } | null
}

export interface SokobanSubmitResult {
  best: number
  isNewBest: boolean
  rank: number
}

/** 每关进度明细 {关卡id: {stars, bestSteps}}——云端存档,本机存储被清后恢复。 */
export type SokobanProgressMap = Record<string, { stars: number; bestSteps: number }>

export function submitSokobanScore(score: number, levels: number, progress?: SokobanProgressMap): Promise<SokobanSubmitResult> {
  return requestUserApi<SokobanSubmitResult>('/api/sokoban/score', 'POST', { score, levels, progress })
}

/** 我的每关进度明细（登录态,静默失败由本地进度兜底）。 */
export function fetchSokobanProgress(): Promise<SokobanProgressMap> {
  return requestUserApi<SokobanProgressMap>('/api/sokoban/progress', 'GET')
}

export function fetchSokobanLeaderboard(limit = 50): Promise<SokobanLeaderboard> {
  return requestUserApi<SokobanLeaderboard>('/api/sokoban/leaderboard', 'GET', { limit })
}
