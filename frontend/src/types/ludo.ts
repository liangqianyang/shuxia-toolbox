/** 飞行棋房间状态：与后端 LudoRoomService::serialize() 同构（无隐藏信息，人人同款）。 */

export type LudoStatus = 'waiting' | 'playing' | 'finished' | 'closed'

export type LudoPhase = 'roll' | 'move'

/** 0红/1黄/2蓝/3绿。 */
export type LudoColor = 0 | 1 | 2 | 3

export interface LudoPlayer {
  seat: number
  userId: number
  nickname: string
  avatarUrl: string
  online: boolean
  left: boolean
  color: LudoColor | null
  finished: boolean
  finishedCount: number
  auto: boolean
  idle: boolean
  place: number | null
}

/** 走法航点（arc = 飞行弧段）。 */
export interface LudoWaypoint {
  d: number
  arc?: boolean
}

/** 走法效果（v = 被击落 [seat, planeIdx] 列表）。 */
export interface LudoFxItem {
  t: 'takeoff' | 'jump' | 'fly' | 'crush' | 'capture' | 'finish'
  d?: number
  from?: number
  to?: number
  p?: number
  v?: number[][]
}

export interface LudoMoveItem {
  p: number
  from: number
  to: number
  wp: LudoWaypoint[]
  fx: LudoFxItem[]
  finish: boolean
}

/** 事件环条目（events 保留最近 16 条）。 */
export interface LudoEvent {
  seq: number
  ts: number
  t: string
  seat?: number | null
  v?: number
  p?: number
  from?: number
  to?: number
  d?: number
  reason?: string
  auto?: boolean
}

export interface LudoRoomState {
  code: string
  status: LudoStatus
  version: number
  phase: LudoPhase | null
  mySeat: number | null
  ownerSeat: number
  players: LudoPlayer[]
  currentSeat: number | null
  roll: number | null
  planes: number[][]
  colors: LudoColor[]
  legalMoves: LudoMoveItem[] | null
  finishedOrder: number[]
  places: Record<string, number> | null
  turnTtl: number
  events: LudoEvent[]
  lastEvent: LudoEvent | null
  winnerUserId: number | null
  winReason: string | null
  scores: Record<string, number>
  sharePath: string
  updatedAt: string
}

export interface LudoStateResponse {
  changed: boolean
  version?: number
}

export interface LudoWsFrame {
  type: 'state' | 'error' | 'pong'
  state?: LudoRoomState
  userId?: number
  message?: string
}
