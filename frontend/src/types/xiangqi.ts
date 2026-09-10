/** 联机象棋类型：与后端 XiangqiRoomService::serialize() 严格同构。 */

export type XiangqiSide = 'red' | 'black'

export type XiangqiRole = XiangqiSide | 'spectator'

export type XiangqiStatus = 'waiting' | 'rps' | 'playing' | 'finished' | 'closed'

export type XiangqiWinReason = 'checkmate' | 'stalemate' | 'forfeit'

/** 棋子类型码（双方共用，显示名按阵营：红 车马炮相仕帅兵 / 黑 车马炮象士将卒）。 */
export type XiangqiPieceType = 'r' | 'h' | 'c' | 'e' | 'a' | 'k' | 'p'

export interface XiangqiPiece {
  side: XiangqiSide
  piece: XiangqiPieceType
  r: number
  c: number
  alive: boolean
}

export interface XiangqiLastMove {
  fr: number
  fc: number
  tr: number
  tc: number
  captured: XiangqiPieceType | null
}

export interface XiangqiLastEvent {
  seq: number
  type: 'move' | 'capture' | 'check' | 'rps_win' | 'win' | 'forfeit'
  text: string
}

export interface XiangqiPlayer {
  nickname: string
  avatarUrl: string
  online: boolean
}

/** 房间聊天消息（环形 50 条；role = 发送者座位色）。 */
export interface XiangqiChatMessage {
  seq: number
  uid: number
  role: XiangqiSide
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

/** 猜拳定红黑窗口（出拳期只给本人出拳；分出胜负瞬间亮双方；胜者执红先行）。 */
export interface XiangqiRps {
  phase: 'pick' | 'done'
  round: number
  winner: XiangqiSide | null
  myPick: number | null
  opponentPicked: boolean
  picks: { red: number | null; black: number | null } | null
  lastPicks: { red: number | null; black: number | null } | null
  myTurn: boolean
}

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape；明棋全量可见）。 */
export interface XiangqiRoomState {
  code: string
  status: XiangqiStatus
  version: number
  myRole: XiangqiRole
  turn: XiangqiSide | null
  pieces: XiangqiPiece[]
  trays: { red: XiangqiPieceType[]; black: XiangqiPieceType[] }
  lastMove: XiangqiLastMove | null
  lastEvent: XiangqiLastEvent | null
  ply: number
  ttl: number
  winner: XiangqiSide | null
  winReason: XiangqiWinReason | null
  red: XiangqiPlayer | null
  black: XiangqiPlayer | null
  rps: XiangqiRps | null
  chat: XiangqiChatMessage[]
  chatSeq: number
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type XiangqiStateResponse = ({ changed: false; version: number } | ({ changed: true } & XiangqiRoomState))

/** WS 下行帧。 */
export type XiangqiWsFrame =
  | { type: 'state'; state: XiangqiRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
