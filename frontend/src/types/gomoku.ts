/** 联机五子棋类型：与后端 GomokuRoomService::serialize() 严格同构。 */

export type GomokuColor = 'black' | 'white'

export type GomokuRole = GomokuColor | 'spectator'

export type GomokuStatus = 'waiting' | 'rps' | 'playing' | 'finished' | 'closed'

export type GomokuWinReason = 'five' | 'forfeit' | 'draw'

export interface GomokuMove {
  x: number
  y: number
}

export interface GomokuPlayer {
  nickname: string
  avatarUrl: string
  online: boolean
}

/** 悔棋状态：remaining 为双方剩余次数，pending 为待同意请求的发起方。 */
export interface GomokuUndo {
  remaining: Record<GomokuColor, number>
  pending: GomokuColor | null
  /** 决策剩余秒数（服务器计算，超时视为拒绝） */
  pendingTtl: number
  /** 是否我发起的待同意请求 */
  pendingMine: boolean
  limit: number
}

/** 猜拳定选边窗口（出拳期只给本人出拳；选边期起双方出拳公开；done=已开局，保留结果供定格）。 */
export interface GomokuRps {
  phase: 'pick' | 'choose' | 'done'
  round: number
  winner: GomokuColor | null
  chosen: GomokuColor | null
  myPick: number | null
  opponentPicked: boolean
  picks: { black: number | null; white: number | null } | null
  /** 平局重出轮的上轮出拳（展示「都是石头」）。 */
  lastPicks: { black: number | null; white: number | null } | null
  myTurn: boolean
  ttl: number
}

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape）。 */
export interface GomokuRoomState {
  code: string
  status: GomokuStatus
  version: number
  myRole: GomokuRole
  turn: GomokuColor | null
  moves: GomokuMove[]
  movesCount: number
  lastMove: GomokuMove | null
  winner: GomokuColor | null
  winLine: Array<[number, number]> | null
  winReason: GomokuWinReason | null
  undo: GomokuUndo
  rps: GomokuRps | null
  black: GomokuPlayer | null
  white: GomokuPlayer | null
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type GomokuStateResponse = ({ changed: false; version: number } | ({ changed: true } & GomokuRoomState))

/** WS 下行帧。 */
export type GomokuWsFrame =
  | { type: 'state'; state: GomokuRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
