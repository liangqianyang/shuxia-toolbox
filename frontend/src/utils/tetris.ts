/**
 * 俄罗斯方块纯逻辑引擎：无 uni/wx/定时器依赖，Node 单测可直接 import（照 gomoku.ts 家法）。
 * 不可变状态 + 纯函数 applyAction(state, action) → newState；被挡/无效动作返回原引用，
 * composable 可据此跳过重绘与特效。时间只从 {t:'tick', dtMs} 进来（引擎不持有定时器），
 * 测试可直接喂 dt，运行时由 composable 用 Date.now() 差值驱动——后台限流也不怕。
 */

export const BOARD_W = 10
export const BOARD_H = 20

/** 落地固化前的宽限；期间成功移动/旋转可重置计时（上限 MAX_LOCK_RESETS 次）。 */
export const LOCK_DELAY_MS = 500
export const MAX_LOCK_RESETS = 15
/** 消行闪烁时长：满行先白闪 CLEAR_FLASH_MS 再塌落（由 tick 驱动，无动画帧）。 */
export const CLEAR_FLASH_MS = 200

/** 消 1/2/3/4 行的基础分（×当前等级），Guideline 计分。 */
export const LINE_SCORES = [0, 100, 300, 500, 800] as const

export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Cell = PieceId | null
/** 200 格行主序：index = y*BOARD_W + x，y 向下增长。 */
export type Board = Cell[]

export interface ActivePiece {
  id: PieceId
  x: number
  y: number
  /** 0..3，SRS 旋转态。 */
  rot: number
}

export type TetrisPhase = 'playing' | 'clearing' | 'over'

export type TetrisEvent =
  | { t: 'moved' }
  | { t: 'rotated' }
  | { t: 'holdBlocked' }
  | { t: 'locked'; piece: PieceId }
  | { t: 'cleared'; rows: number; points: number }
  | { t: 'hardDropped'; cells: number }
  | { t: 'levelUp'; level: number }
  | { t: 'gameOver' }

export interface TetrisState {
  board: Board
  active: ActivePiece | null
  /** 头部 = 下一个出生的块；低于 5 个就从袋里补。 */
  queue: PieceId[]
  /** 当前 7-bag 余量（暴露出来便于单测观测随机性）。 */
  bag: PieceId[]
  hold: PieceId | null
  /** 本块是否已用过 HOLD（锁定/换块后重置）。 */
  holdUsed: boolean
  score: number
  lines: number
  level: number
  startLevel: number
  phase: TetrisPhase
  /** clearing 相位的满行行号。 */
  clearingRows: number[]
  clearTimerMs: number
  /** 距下一次重力下落的累计毫秒。 */
  gravityMs: number
  /** 接地后累计的锁定毫秒。 */
  lockMs: number
  lockResets: number
  /** 上一次 applyAction 产生的事件，特效层（音效/振动/闪烁）消费后即弃。 */
  events: TetrisEvent[]
}

export type GameAction =
  | { t: 'move'; dx: -1 | 1 }
  | { t: 'rotate'; dir: 1 | -1 }
  | { t: 'softDrop' }
  | { t: 'hardDrop' }
  | { t: 'hold' }
  | { t: 'tick'; dtMs: number }

const PIECE_IDS: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

/**
 * 各块四个旋转态的格子偏移（SRS 包围盒内，(列, 行)，行向下）。
 * I 用 4×4 盒，JLSTZ 用 3×3 盒，O 四态同形（旋转恒等，天然无踢墙需求）。
 */
const PIECE_SHAPES: Record<PieceId, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
}

/**
 * SRS 踢墙表（JLSTZ 与 I 各一张），按 `${from}>${to}` 取键、按序试偏移。
 * ⚠️ 发表的 SRS 表是 y 向上坐标；本引擎 y 向下，写入时 dy 已全部取反
 * （经典错源——专有单测锁定，改动前先跑 testTetris）。
 */
const KICKS_JLSTZ: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
}
const KICKS_I: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
}

export function emptyBoard(): Board {
  return new Array<Cell>(BOARD_W * BOARD_H).fill(null)
}

/** 7-bag：7 种块洗成一袋，杜绝"等不到 I 块"的运气死局。 */
export function shuffledBag(rng: () => number = Math.random): PieceId[] {
  const bag = PIECE_IDS.slice()
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = bag[i]
    bag[i] = bag[j]
    bag[j] = tmp
  }
  return bag
}

/** Guideline 重力：每行下落秒数 = (0.8-(lv-1)×0.007)^(lv-1)；lv15≈7ms，lv20+ 实质瞬落。下限钳 1ms 防 0 间隔死循环。 */
export function gravityIntervalMs(level: number): number {
  const lv = Math.max(1, level)
  return Math.max(1, Math.pow(0.8 - (lv - 1) * 0.007, lv - 1) * 1000)
}

/** 等级 = 起始等级 + floor(消行/10)，下限 1。 */
export function levelFrom(startLevel: number, lines: number): number {
  return Math.max(1, startLevel + Math.floor(lines / 10))
}

export function pieceCells(id: PieceId, rot: number): ReadonlyArray<readonly [number, number]> {
  return PIECE_SHAPES[id][((rot % 4) + 4) % 4]
}

/**
 * 碰撞检测：出左右墙/穿底/撞已占格为碰撞。by<0（越出场顶，踢墙可能把块顶上去）不算碰撞。
 */
export function collides(board: Board, id: PieceId, x: number, y: number, rot: number): boolean {
  for (const [cx, cy] of pieceCells(id, rot)) {
    const bx = x + cx
    const by = y + cy
    if (bx < 0 || bx >= BOARD_W || by >= BOARD_H) return true
    if (by >= 0 && board[by * BOARD_W + bx] !== null) return true
  }
  return false
}

/** 硬降落点：从当前位置一路试探到底的 y。 */
export function ghostY(state: TetrisState): number {
  const { board, active } = state
  if (!active) return 0
  let { y } = active
  while (!collides(board, active.id, active.x, y + 1, active.rot)) y++
  return y
}

function refillQueue(queue: PieceId[], bag: PieceId[], rng: () => number): { queue: PieceId[]; bag: PieceId[] } {
  const nextQueue = queue.slice()
  let nextBag = bag.slice()
  while (nextQueue.length < 5) {
    if (nextBag.length === 0) nextBag = shuffledBag(rng)
    nextQueue.push(nextBag.shift() as PieceId)
  }
  return { queue: nextQueue, bag: nextBag }
}

export function createGame(startLevel: number, rng: () => number = Math.random): TetrisState {
  const level = Math.max(1, Math.floor(startLevel))
  const filled = refillQueue([], [], rng)
  const state: TetrisState = {
    board: emptyBoard(),
    active: null,
    queue: filled.queue,
    bag: filled.bag,
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level,
    startLevel: level,
    phase: 'playing',
    clearingRows: [],
    clearTimerMs: 0,
    gravityMs: 0,
    lockMs: 0,
    lockResets: 0,
    events: [],
  }
  return spawnNext(state, [])
}

/** 接地成功的移动/旋转重置锁定计时（有次数上限）——INF 屏蔽按住不锁的无限拖延。 */
function withLockReset(state: TetrisState, moved: boolean): TetrisState {
  if (!moved || !state.active) return state
  const { board, active } = state
  if (!collides(board, active.id, active.x, active.y + 1, active.rot)) return state
  if (state.lockResets >= MAX_LOCK_RESETS) return state
  return { ...state, lockMs: 0, lockResets: state.lockResets + 1 }
}

/** 从队列出生下一块；出生即碰撞 = 顶出，游戏结束。 */
function spawnNext(state: TetrisState, events: TetrisEvent[]): TetrisState {
  const [id, ...restQueue] = state.queue
  const refilled = refillQueue(restQueue, state.bag, Math.random)
  const spawn = { id, x: 3, y: 0, rot: 0 }
  if (collides(state.board, id, spawn.x, spawn.y, spawn.rot)) {
    return {
      ...state,
      active: null,
      queue: refilled.queue,
      bag: refilled.bag,
      phase: 'over',
      events: [...events, { t: 'gameOver' }],
    }
  }
  return {
    ...state,
    active: spawn,
    queue: refilled.queue,
    bag: refilled.bag,
    holdUsed: false,
    gravityMs: 0,
    lockMs: 0,
    lockResets: 0,
    phase: 'playing',
    events,
  }
}

/**
 * 锁定：盖章 → 查满行。有满行 → 计分/消行数/升级，转 clearing 相位白闪；
 * 无满行 → 直接出生下一块。整块锁在场顶之上也判结束（顶出兜底）。
 */
function lockPiece(state: TetrisState, events: TetrisEvent[]): TetrisState {
  const { active } = state
  if (!active) return { ...state, events }
  const board = state.board.slice()
  let allAboveField = true
  for (const [cx, cy] of pieceCells(active.id, active.rot)) {
    const bx = active.x + cx
    const by = active.y + cy
    if (by >= 0) {
      board[by * BOARD_W + bx] = active.id
      allAboveField = false
    }
  }
  const lockedEvents: TetrisEvent[] = [...events, { t: 'locked', piece: active.id }]
  if (allAboveField) {
    return { ...state, board, active: null, phase: 'over', events: [...lockedEvents, { t: 'gameOver' }] }
  }

  const clearingRows: number[] = []
  for (let y = 0; y < BOARD_H; y++) {
    let full = true
    for (let x = 0; x < BOARD_W; x++) {
      if (board[y * BOARD_W + x] === null) {
        full = false
        break
      }
    }
    if (full) clearingRows.push(y)
  }

  if (clearingRows.length === 0) {
    return spawnNext({ ...state, board, active: null }, lockedEvents)
  }

  const points = LINE_SCORES[clearingRows.length] * state.level
  const lines = state.lines + clearingRows.length
  const level = levelFrom(state.startLevel, lines)
  const clearEvents: TetrisEvent[] = [...lockedEvents, { t: 'cleared', rows: clearingRows.length, points }]
  const finalEvents: TetrisEvent[] = level > state.level ? [...clearEvents, { t: 'levelUp', level }] : clearEvents
  return {
    ...state,
    board,
    active: null,
    score: state.score + points,
    lines,
    level,
    phase: 'clearing',
    clearingRows,
    clearTimerMs: CLEAR_FLASH_MS,
    events: finalEvents,
  }
}

/** clearing 相位结束：删掉满行、顶部补空行（其余行整体下移）。 */
function collapseRows(state: TetrisState, events: TetrisEvent[]): TetrisState {
  const board = emptyBoard()
  let targetY = BOARD_H - 1
  for (let y = BOARD_H - 1; y >= 0; y--) {
    if (state.clearingRows.includes(y)) continue
    for (let x = 0; x < BOARD_W; x++) {
      board[targetY * BOARD_W + x] = state.board[y * BOARD_W + x]
    }
    targetY--
  }
  return spawnNext({ ...state, board, clearingRows: [], clearTimerMs: 0 }, events)
}

export function applyAction(state: TetrisState, action: GameAction): TetrisState {
  switch (action.t) {
    case 'move': {
      if (state.phase !== 'playing' || !state.active) return state
      const { active } = state
      if (collides(state.board, active.id, active.x + action.dx, active.y, active.rot)) return state
      return withLockReset(
        { ...state, active: { ...active, x: active.x + action.dx }, events: [{ t: 'moved' }] },
        true,
      )
    }
    case 'rotate': {
      if (state.phase !== 'playing' || !state.active) return state
      const { active } = state
      const toRot = ((active.rot + action.dir) % 4 + 4) % 4
      const kicks = active.id === 'I' ? KICKS_I : KICKS_JLSTZ
      const table = kicks[`${active.rot}>${toRot}`]
      for (const [dx, dy] of table) {
        if (!collides(state.board, active.id, active.x + dx, active.y + dy, toRot)) {
          return withLockReset(
            {
              ...state,
              active: { ...active, x: active.x + dx, y: active.y + dy, rot: toRot },
              events: [{ t: 'rotated' }],
            },
            true,
          )
        }
      }
      return state
    }
    case 'softDrop': {
      if (state.phase !== 'playing' || !state.active) return state
      const { active } = state
      if (collides(state.board, active.id, active.x, active.y + 1, active.rot)) return state
      return {
        ...state,
        active: { ...active, y: active.y + 1 },
        score: state.score + 1,
        gravityMs: 0,
        events: [],
      }
    }
    case 'hardDrop': {
      if (state.phase !== 'playing' || !state.active) return state
      const targetY = ghostY(state)
      const cells = targetY - state.active.y
      const dropped: TetrisState = {
        ...state,
        active: { ...state.active, y: targetY },
        score: state.score + cells * 2,
        events: [{ t: 'hardDropped', cells }],
      }
      return lockPiece(dropped, dropped.events)
    }
    case 'hold': {
      if (state.phase !== 'playing' || !state.active) return state
      if (state.holdUsed) return { ...state, events: [{ t: 'holdBlocked' }] }
      const currentId = state.active.id
      if (state.hold === null) {
        // 首次暂存：当前块入仓、出生下一块；新块同样受“每块一次”限制（spawnNext 会重置 holdUsed，这里再置回）。
        const spawned = spawnNext({ ...state, hold: currentId, active: null }, [])
        return { ...spawned, holdUsed: true }
      }
      const swapped: ActivePiece = { id: state.hold, x: 3, y: 0, rot: 0 }
      if (collides(state.board, swapped.id, swapped.x, swapped.y, swapped.rot)) {
        return {
          ...state,
          hold: currentId,
          active: null,
          holdUsed: true,
          phase: 'over',
          events: [{ t: 'gameOver' }],
        }
      }
      return {
        ...state,
        hold: currentId,
        active: swapped,
        holdUsed: true,
        gravityMs: 0,
        lockMs: 0,
        lockResets: 0,
        events: [],
      }
    }
    case 'tick': {
      const dtMs = Math.max(0, action.dtMs)
      if (state.phase === 'over') return state
      if (state.phase === 'clearing') {
        const clearTimerMs = state.clearTimerMs - dtMs
        if (clearTimerMs > 0) return { ...state, clearTimerMs, events: [] }
        return collapseRows(state, [])
      }
      if (!state.active) return state
      const { active } = state
      if (collides(state.board, active.id, active.x, active.y + 1, active.rot)) {
        // 接地：攒锁定计时，满 500ms 固化。
        const lockMs = state.lockMs + dtMs
        if (lockMs >= LOCK_DELAY_MS) return lockPiece(state, [])
        return { ...state, lockMs, events: [] }
      }
      // 空中：攒重力计时，够一个间隔就落一格（重力白落不计分，软降才 +1）。
      let gravityMs = state.gravityMs + dtMs
      let y = active.y
      const interval = gravityIntervalMs(state.level)
      while (gravityMs >= interval) {
        gravityMs -= interval
        if (collides(state.board, active.id, active.x, y + 1, active.rot)) {
          gravityMs = 0
          break
        }
        y++
      }
      if (y === active.y) return { ...state, gravityMs, events: [] }
      return { ...state, active: { ...active, y }, gravityMs, events: [] }
    }
  }
}
