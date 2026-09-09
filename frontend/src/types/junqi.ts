/** 联机军棋（两人暗棋）类型：与后端 MountainChessRoomService::serialize() 严格同构。 */

export type JunqiSide = 'red' | 'blue'

export type JunqiRole = JunqiSide | 'spectator'

export type JunqiStatus = 'waiting' | 'layout' | 'rps' | 'playing' | 'finished' | 'closed'

export type JunqiWinReason = 'flag' | 'eliminated' | 'stuck' | 'forfeit'

/** 棋子类型：si司令 jun军长 shi师长 lv旅长 tuan团长 ying营长 lian连长 pai排长 gong工兵 zha炸弹 lei地雷 qi军旗 */
export type JunqiRank
  = 'si' | 'jun' | 'shi' | 'lv' | 'tuan' | 'ying' | 'lian' | 'pai' | 'gong' | 'zha' | 'lei' | 'qi'

/** 棋子快照。暗棋裁剪：对方存活且未暴露的子不带 rank（前端按背面渲染）；阵亡子恒带 rank。 */
export interface JunqiPiece {
  side: JunqiSide
  rank?: JunqiRank
  r: number
  c: number
  alive: boolean
  revealed?: boolean
}

/** 布阵条目（客户端提交用）：己方半场绝对坐标。 */
export interface JunqiLayoutPiece {
  rank: JunqiRank
  r: number
  c: number
}

export interface JunqiLastMove {
  fr: number
  fc: number
  tr: number
  tc: number
  result: 'move' | 'win' | 'lose' | 'both' | 'flag'
  captured: JunqiRank | null
}

/** 最近事件（播报条 + 音效）：seq 单调递增，前端按 seq 差分弹卡。 */
export interface JunqiLastEvent {
  seq: number
  type: 'layout_ready' | 'layout_auto' | 'rps_win' | 'move' | 'battle' | 'reveal' | 'win' | 'forfeit'
  text: string
}

export interface JunqiPlayer {
  nickname: string
  avatarUrl: string
  online: boolean
}

/** 房间聊天消息（环形 50 条；role = 发送者座位色，旁观者不能发）。 */
export interface JunqiChatMessage {
  seq: number
  uid: number
  role: JunqiSide
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

/** 猜拳定先手窗口（出拳期只给本人出拳；分出胜负瞬间亮双方；胜者先行、不换座）。 */
export interface JunqiRps {
  phase: 'pick' | 'done'
  round: number
  winner: JunqiSide | null
  myPick: number | null
  opponentPicked: boolean
  picks: { red: number | null; blue: number | null } | null
  /** 平局重出轮的上轮出拳（展示「都是石头」）。 */
  lastPicks: { red: number | null; blue: number | null } | null
  myTurn: boolean
}

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape）。 */
export interface JunqiRoomState {
  code: string
  status: JunqiStatus
  version: number
  myRole: JunqiRole
  turn: JunqiSide | null
  pieces: JunqiPiece[]
  /** 布阵就绪标（仅 layout 阶段非 null）。 */
  ready: { red: boolean; blue: boolean } | null
  /** 双方阵亡名单（按军衔降序），公示。 */
  trays: { red: JunqiRank[]; blue: JunqiRank[] }
  lastMove: JunqiLastMove | null
  lastEvent: JunqiLastEvent | null
  ply: number
  /** 当前窗口剩余秒数（布阵 300 / 出拳 10 / 走子 45），服务端序列化时刻的值。 */
  ttl: number
  winner: JunqiSide | null
  winReason: JunqiWinReason | null
  red: JunqiPlayer | null
  blue: JunqiPlayer | null
  rps: JunqiRps | null
  chat: JunqiChatMessage[]
  chatSeq: number
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type JunqiStateResponse = ({ changed: false; version: number } | ({ changed: true } & JunqiRoomState))

/** WS 下行帧。 */
export type JunqiWsFrame =
  | { type: 'state'; state: JunqiRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
