/** 枫趣冒险房间状态：与后端 AdventureRoomService::serialize() 同构（有隐藏信息，视角裁剪：
 *  myItems 只给本人、埋伏只给数量、决斗暗出只给自己；其余全场公开）。 */

export type AdventureStatus = 'waiting' | 'playing' | 'saved' | 'finished' | 'closed'

export type AdventurePhase = 'opening' | 'act' | 'resolve'

export type ChoiceKind = 'fork' | 'ambush' | 'shop' | 'shrine' | 'arena'

export type DuelFormat = 'rps' | 'bid' | 'dice'

export interface AdventurePlayer {
  seat: number
  userId: number
  nickname: string
  avatarUrl: string
  online: boolean
  left: boolean
  finished: boolean
  auto: boolean
  idle: boolean
  place: number | null
  /** 0=山脚未上山，1..100。 */
  pos: number
  /** 已存档的最近营地（回退下限）。 */
  camp: number
  leaves: number
  itemCount: number
  /** 滑雪板护盾（展示角标）。 */
  shield: boolean
  /** 下回合减速（雪球）。 */
  slow: number
  /** 被埋伏跳过标记。 */
  skip: boolean
}

export interface AdventureForkOption {
  key: string
  label: string
  to: number | null
}

/** 定先手掷骰仪式（点数公开，无隐藏信息）。 */
export interface AdventureOpening {
  round: number
  tieSeats: number[]
  rolls: Record<string, [number, number]>
  pending: number[]
  mine: boolean
}

export interface AdventurePendingChoice {
  kind: ChoiceKind
  seat: number
  cell: number
  mine: boolean
  options?: AdventureForkOption[]
  candidates?: number[]
}

export interface AdventureBet {
  uid: number
  seat: number
  on: number
}

export interface AdventurePendingDuel {
  a: number
  b: number | null
  phase: 'pick' | 'act'
  format: DuelFormat
  round: number
  arena: boolean
  win: number
  lose: number
  mine: boolean
  myPick: number | null
  bets: AdventureBet[]
  candidates?: number[]
}

/** 事件环条目（保留最近 16 条，seq 单调增，重连按 seq 补播）。 */
export interface AdventureEvent {
  seq: number
  ts: number
  t: string
  seat?: number | null
  v?: unknown
  from?: number
  to?: number
  owner?: number | null
  winner?: number
  loser?: number
  win?: number
  lose?: number
  a?: number
  b?: number | null
  format?: string
  target?: number | null
  reason?: string
  auto?: boolean
  cell?: number
  on?: number
  by?: number
  with?: number
  cost?: number
}

export interface AdventureChatMessage {
  seq: number
  uid: number
  seat: number
  kind: 'phrase' | 'emoji' | 'sticker' | 'text'
  text: string
  ts: number
}

export interface AdventureRoomState {
  code: string
  status: AdventureStatus
  version: number
  phase: AdventurePhase | null
  mySeat: number | null
  ownerSeat: number
  players: AdventurePlayer[]
  currentSeat: number | null
  /** 定先手阶段（全员掷双骰点大者先手；null=已定/未开局）。 */
  opening: AdventureOpening | null
  roll: [number, number] | null
  myItems: string[]
  trapCount: number
  pendingChoice: AdventurePendingChoice | null
  pendingDuel: AdventurePendingDuel | null
  weather: { current: string | null; next: string }
  /** 登顶格（房主设定，40/60/80/100，默认 100；短局时之后的区域云雾封锁）。 */
  goal: number
  finishedOrder: number[]
  places: Record<string, number> | null
  turnTtl: number
  events: AdventureEvent[]
  lastEvent: AdventureEvent | null
  winnerUserId: number | null
  winReason: string | null
  scores: Record<string, number>
  chat: AdventureChatMessage[]
  chatSeq: number
  sharePath: string
  updatedAt: string
}

export interface AdventureStateResponse {
  changed: boolean
  version?: number
}

export interface AdventureWsFrame {
  type: 'state' | 'error' | 'pong'
  state?: AdventureRoomState
  userId?: number
  message?: string
}

/** 我的对局列表条目（重连/续局入口）。 */
export interface AdventureMyRoom {
  code: string
  status: AdventureStatus
  playerCount: number
  updatedAt: string
}
