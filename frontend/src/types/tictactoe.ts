/** 联机井字棋类型：与后端 TictactoeRoomService::serialize() 严格同构。 */

export type TicTacToeMark = 'x' | 'o'

export type TicTacToeStatus = 'waiting' | 'rps' | 'playing' | 'finished' | 'closed'

export type TicTacToeWinReason = 'line' | 'draw' | 'forfeit'

export interface TicTacToePlayer {
  nickname: string
  avatarUrl: string
  online: boolean
}

export interface TicTacToeChatMessage {
  seq: number
  uid: number
  role: TicTacToeMark
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

export interface TicTacToeRps {
  phase: 'pick' | 'done'
  round: number
  winner: TicTacToeMark | null
  myPick: number | null
  opponentPicked: boolean
  picks: { x: number | null; o: number | null } | null
  lastPicks: { x: number | null; o: number | null } | null
  myTurn: boolean
}

export interface TicTacToeLastEvent {
  seq: number
  type: 'move' | 'rps_win' | 'win' | 'draw' | 'forfeit'
  text: string
}

export type TicTacToeScores = { x: number; o: number; draw: number }

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape；明棋全量可见）。 */
export interface TicTacToeRoomState {
  code: string
  status: TicTacToeStatus
  version: number
  /** 请求者执子（'x'|'o'|null 观战）。 */
  myMark: TicTacToeMark | null
  turn: TicTacToeMark | null
  board: Array<TicTacToeMark | null>
  scores: TicTacToeScores
  winLine: number | null
  ttl: number
  winner: TicTacToeMark | 'draw' | null
  winReason: TicTacToeWinReason | null
  lastEvent: TicTacToeLastEvent | null
  xPlayer: TicTacToePlayer | null
  oPlayer: TicTacToePlayer | null
  rps: TicTacToeRps | null
  chat: TicTacToeChatMessage[]
  chatSeq: number
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type TicTacToeStateResponse = ({ changed: false; version: number } | ({ changed: true } & TicTacToeRoomState))

/** WS 下行帧。 */
export type TicTacToeWsFrame =
  | { type: 'state'; state: TicTacToeRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
