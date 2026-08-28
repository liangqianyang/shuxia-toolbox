/** UNO 联机类型：与后端 UnoRoomService::serialize() 严格同构。 */

export type UnoColor = 'r' | 'g' | 'b' | 'y'

export type UnoStatus = 'waiting' | 'playing' | 'finished' | 'closed'

export type UnoWinReason = 'cards' | 'forfeit' | 'last_man'

export interface UnoPlayer {
  seat: number
  userId: number
  nickname: string
  avatarUrl: string
  online: boolean
  /** 对局中途离开（多人局） */
  left: boolean
  handCount: number
  /** 剩 1 张且已喊 UNO（展示徽章） */
  unoDeclared: boolean
  /** 连续超时进入挂机（自动摸牌） */
  idle: boolean
}

/** +4 质疑窗口：仅 toSeat 玩家可发起质疑。 */
export interface UnoChallenge {
  fromSeat: number
  toSeat: number
  /** 剩余秒数（服务器计算，超时视为放弃质疑） */
  ttl: number
  /** 是否我是被 +4 的人 */
  mine: boolean
}

/** 未喊 UNO 的可举报窗口：selfWindowTtl>0 时仅本人可补喊，归零后他人可举报。 */
export interface UnoVulnerable {
  seat: number
  selfWindowTtl: number
  mine: boolean
}

/** 最近一次的桌面事件（动画/提示钩子）。 */
export interface UnoEvent {
  type: string
  seat?: number
  card?: string
  color?: UnoColor
  [key: string]: unknown
}

/** 房间聊天消息（公开信息，不做视角裁剪）；seq 单调递增，客户端按 seq 增量出气泡。 */
export interface UnoChatMessage {
  seq: number
  userId: number
  seat: number
  kind: 'phrase' | 'emoji' | 'text'
  text: string
  ts: number
}

/** 房间完整状态（HTTP 接口与 WS 推送同一 shape）；手牌仅本人可见。 */
export interface UnoRoomState {
  code: string
  status: UnoStatus
  version: number
  /** 'dealerDraw' = 抽牌比大小定庄家阶段（首局）；其余对局时间为 'playing' */
  phase: 'dealerDraw' | 'playing' | null
  /** 庄家（先手）座位 */
  dealerSeat: number | null
  /** 抽牌定庄家的各人抽到的牌（公开信息，seat 为键） */
  dealerDraws: Record<string, string> | null
  /** 我的座位号；旁观为 null */
  mySeat: number | null
  ownerSeat: number
  players: UnoPlayer[]
  currentSeat: number | null
  /** 1 顺时针 / -1 逆时针 */
  direction: 1 | -1
  /** 当前回合剩余秒数（服务器计算） */
  turnTtl: number
  topCard: string | null
  currentColor: UnoColor | ''
  deckCount: number
  discardCount: number
  /** 仅本人可见；未入座/未开局为 null */
  myHand: string[] | null
  /** 摸牌后仅可出的那张（仅本人可见） */
  drawnCard: string | null
  challenge: UnoChallenge | null
  /** 首张翻出变色牌：等待首位玩家选择开局颜色 */
  colorPick: { seat: number; mine: boolean } | null
  /** 加牌叠加（村规）：count 为累计要摸的牌数；only4=true 表示叠过 +4，之后只能再叠 +4 */
  drawStack: { count: number; only4?: boolean } | null
  uno: UnoVulnerable | null
  lastEvent: UnoEvent | null
  /** 房间聊天（环形数组，最近 50 条，服务端透传） */
  chat: UnoChatMessage[]
  winnerUserId: number | null
  winReason: UnoWinReason | null
  /** 房间累计分 {userId: score} */
  scores: Record<string, number>
  /** 上局得分（结算面板用） */
  roundScores: Record<string, number> | null
  /** 上局各人手牌分值（结算面板用） */
  handValues: Record<string, number> | null
  sharePath: string
  updatedAt: string
}

/** state 轮询响应：changed=false 时只带版本号。 */
export type UnoStateResponse = ({ changed: false; version: number } | ({ changed: true } & UnoRoomState))

/** WS 下行帧。 */
export type UnoWsFrame =
  | { type: 'state'; state: UnoRoomState; userId?: number }
  | { type: 'pong' }
  | { type: 'error'; message: string }
