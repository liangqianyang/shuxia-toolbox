/** 联机斗兽棋类型：与后端 JungleRoomService::serialize() 严格同构。 */

export type JungleSide = 'red' | 'blue'

export type JungleRole = JungleSide | 'spectator'

export type JungleStatus = 'waiting' | 'rps' | 'playing' | 'finished' | 'closed'

export type JungleWinReason = 'den' | 'eliminated' | 'stuck' | 'forfeit'

export type JungleAnimal = 'rat' | 'cat' | 'dog' | 'wolf' | 'leopard' | 'tiger' | 'lion' | 'elephant'

export interface JunglePiece {
  side: JungleSide
  animal: JungleAnimal
  r: number
  c: number
}

export interface JungleLastMove {
  fr: number
  fc: number
  tr: number
  tc: number
  captured: JunglePiece | null
}

export interface JunglePlayer {
  nickname: string
  avatarUrl: string
  online: boolean
}

/** 房间聊天消息（环形 50 条；role = 发送者座位色，旁观者不能发）。 */
export interface JungleChatMessage {
  seq: number
  uid: number
  role: JungleSide
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

/** 猜拳定选边窗口（出拳期只给本人出拳；选边期起双方出拳公开；done=已开局，保留结果供定格）。 */
export interface JungleRps {
  phase: 'pick' | 'choose' | 'done'
  round: number
  winner: JungleSide | null
  chosen: JungleSide | null
  myPick: number | null
  opponentPicked: boolean
  picks: { red: number | null; blue: number | null } | null
  /** 平局重出轮的上轮出拳（展示「都是石头」）。 */
  lastPicks: { red: number | null; blue: number | null } | null
  myTurn: boolean
  ttl: number
}

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape）。 */
export interface JungleRoomState {
  code: string
  status: JungleStatus
  version: number
  myRole: JungleRole
  turn: JungleSide | null
  pieces: JunglePiece[]
  lastMove: JungleLastMove | null
  /** 总手数（红先，每走一步 +1）；「回合数」展示 ceil(ply/2)。 */
  ply: number
  winner: JungleSide | null
  winReason: JungleWinReason | null
  rps: JungleRps | null
  chat: JungleChatMessage[]
  chatSeq: number
  red: JunglePlayer | null
  blue: JunglePlayer | null
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type JungleStateResponse = ({ changed: false; version: number } | ({ changed: true } & JungleRoomState))

/** WS 下行帧。 */
export type JungleWsFrame =
  | { type: 'state'; state: JungleRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
