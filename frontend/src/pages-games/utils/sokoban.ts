/**
 * 推箱子纯逻辑引擎：无 uni/wx/定时器依赖，Node 单测可直接 import（照 tetris.ts 家法）。
 * 不可变状态 + 纯函数 applyAction(state, action) → newState；被挡/无效动作返回原引用，
 * composable 据此跳过重绘与特效。回合制无时间概念，状态只随玩家输入变化。
 *
 * 棋盘坐标：index = y*w + x，y 向下。方向 dir：0上 1右 2下 3左。
 */

/** 方向位移 (dx, dy)：上/右/下/左。 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]
/** 提示文案用的方向名。 */
export const DIR_NAMES = ['上', '右', '下', '左'] as const

export interface SokobanLevelDef {
  id: number
  chapter: number
  /** XSB 行：`#`墙 `@`人 `+`人在点 `$`箱 `*`箱在点 `.`点，空格/- 为地板。 */
  xsb: string[]
  /** 三星门槛（≤ 此步数得 3 星），由离线求解器预算写死。 */
  threeStar: number
  /** 二星门槛（≤ 此步数得 2 星）。 */
  twoStar: number
}

export interface SokobanLevel {
  id: number
  chapter: number
  w: number
  h: number
  /** w*h，true = 墙。 */
  walls: boolean[]
  /** w*h，从玩家出生点可达的地板（外部空隙不算，渲染与可行走判定共用）。 */
  floor: boolean[]
  /** w*h，落叶点。 */
  targets: boolean[]
  playerStart: number
  /** 升序箱子格。 */
  boxesStart: number[]
  threeStar: number
  twoStar: number
}

export type SokobanPhase = 'playing' | 'won'

export type SokobanEvent =
  | { t: 'walked' }
  | { t: 'pushed'; from: number; to: number; placed: boolean }
  | { t: 'deadlock'; box: number }
  | { t: 'won' }
  | { t: 'undid' }

/** 撤销快照：只存最小可变集（关卡本身不变）。 */
interface SokobanSnapshot {
  boxes: number[]
  player: number
  steps: number
  pushes: number
}

export interface SokobanState {
  level: SokobanLevel
  /** 升序箱子格。 */
  boxes: number[]
  player: number
  steps: number
  pushes: number
  phase: SokobanPhase
  /** 提示标记（金圈+箭头），下一步动作即清除。 */
  hint: { box: number; dir: number } | null
  /** 死局标记（红圈），撤销/重开清除。 */
  stuckBox: number | null
  history: SokobanSnapshot[]
  /** 上一次 applyAction 产生的事件，特效层（音效/浮层）消费后即弃。 */
  events: SokobanEvent[]
}

export type SokobanAction =
  | { t: 'move'; dir: number }
  | { t: 'undo' }
  | { t: 'hint'; box: number; dir: number }
  | { t: 'unstick' }

/** 解析并校验一关：箱子数=目标数、恰好一个小人、小人所在连通域含全部箱与点。 */
export function parseLevel(def: SokobanLevelDef): SokobanLevel {
  const w = Math.max(...def.xsb.map((r) => r.length))
  const h = def.xsb.length
  const walls = new Array<boolean>(w * h).fill(false)
  const targets = new Array<boolean>(w * h).fill(false)
  let playerStart = -1
  const boxes: number[] = []
  def.xsb.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ' '
      const idx = y * w + x
      switch (ch) {
        case '#': walls[idx] = true; break
        case '.': targets[idx] = true; break
        case '@': playerStart = idx; break
        case '+': playerStart = idx; targets[idx] = true; break
        case '$': boxes.push(idx); break
        case '*': boxes.push(idx); targets[idx] = true; break
      }
    }
  })
  const label = `关卡 ${def.id}`
  if (playerStart < 0) throw new Error(`${label}：没有小人 @`)
  if (boxes.length === 0) throw new Error(`${label}：没有箱子 $`)
  if (boxes.length !== targets.filter(Boolean).length) {
    throw new Error(`${label}：箱子 ${boxes.length} ≠ 目标 ${targets.filter(Boolean).length}`)
  }

  // 从小人洪泛出可达地板（墙阻断）——渲染底板与移动合法性都以此为准。
  const floor = new Array<boolean>(w * h).fill(false)
  const queue = [playerStart]
  floor[playerStart] = true
  while (queue.length) {
    const cur = queue.pop() as number
    const cx = cur % w
    const cy = (cur / w) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const next = ny * w + nx
      if (walls[next] || floor[next]) continue
      floor[next] = true
      queue.push(next)
    }
  }
  for (const b of boxes) if (!floor[b]) throw new Error(`${label}：箱子在不可达格`)
  for (let i = 0; i < targets.length; i++) if (targets[i] && !floor[i]) throw new Error(`${label}：目标点在不可达格`)

  boxes.sort((a, b) => a - b)
  return { id: def.id, chapter: def.chapter, w, h, walls, floor, targets, playerStart, boxesStart: boxes, threeStar: def.threeStar, twoStar: def.twoStar }
}

export function createGame(level: SokobanLevel): SokobanState {
  return {
    level,
    boxes: level.boxesStart.slice(),
    player: level.playerStart,
    steps: 0,
    pushes: 0,
    phase: 'playing',
    hint: null,
    stuckBox: null,
    history: [],
    events: [],
  }
}

export function isSolved(state: SokobanState): boolean {
  return state.boxes.every((b) => state.level.targets[b])
}

/**
 * 死局启发（只对刚推到的箱子跑，非穷尽；漏报交给提示求解器兜底，**不允许误报**）：
 * 1) 角死：不在点上且两正交邻侧皆墙；
 * 2) 沿墙死：贴墙排（横/竖）整段无点也无开口（有开口就能推出该排）；
 * 3) 2×2 冻结：含本箱的任意 2×2 全为箱/墙且本箱不在点上（整块永远动不了）。
 */
export function isDeadCell(level: SokobanLevel, boxes: readonly number[], cell: number): boolean {
  const { w, h, walls, targets, floor } = level
  if (targets[cell]) return false
  const boxSet = new Set(boxes)
  const x = cell % w
  const y = (cell / w) | 0
  const isBlocked = (nx: number, ny: number) => nx < 0 || nx >= w || ny < 0 || ny >= h || walls[ny * w + nx] || !floor[ny * w + nx]

  if ((isBlocked(x, y - 1) || isBlocked(x, y + 1)) && (isBlocked(x - 1, y) || isBlocked(x + 1, y))) return true

  // 沿墙死：贴上/下墙查横排，贴左/右墙查竖排；走到「墙或离开该墙」为止，途中有点即活。
  // 开口（旁边那格不是墙）也判活——玩家能站进开口把箱子推出该排（floor 单连通域，开口必可达）。
  for (const wallSide of [-1, 1]) {
    if (isBlocked(x, y + wallSide)) {
      let alive = false
      for (const step of [-1, 1]) {
        let cx = x
        for (;;) {
          cx += step
          if (cx < 0 || cx >= w || walls[y * w + cx]) break
          if (targets[y * w + cx]) { alive = true; break }
          if (!isBlocked(cx, y + wallSide)) { alive = true; break }
        }
        if (alive) break
      }
      if (!alive) return true
    }
    if (isBlocked(x + wallSide, y)) {
      let alive = false
      for (const step of [-1, 1]) {
        let cy = y
        for (;;) {
          cy += step
          if (cy < 0 || cy >= h || walls[cy * w + x]) break
          if (targets[cy * w + x]) { alive = true; break }
          if (!isBlocked(x + wallSide, cy)) { alive = true; break }
        }
        if (alive) break
      }
      if (!alive) return true
    }
  }

  // 2×2 冻结簇：以本箱为四角之一枚举
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const) {
    const bx = x + ox
    const by = y + oy
    if (bx < 0 || by < 0) continue
    let frozen = true
    let anyOffTarget = false
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const cx = bx + dx
      const cy = by + dy
      if (cx >= w || cy >= h) { frozen = false; break }
      const idx = cy * w + cx
      if (walls[idx] || !floor[idx]) continue
      if (!boxSet.has(idx)) { frozen = false; break }
      if (!targets[idx]) anyOffTarget = true
    }
    if (frozen && anyOffTarget) return true
  }
  return false
}

export function applyAction(state: SokobanState, action: SokobanAction): SokobanState {
  switch (action.t) {
    case 'move': {
      if (state.phase !== 'playing') return state
      const { level } = state
      const [dx, dy] = DIRS[action.dir]
      const px = state.player % level.w
      const py = (state.player / level.w) | 0
      const nx = px + dx
      const ny = py + dy
      if (nx < 0 || nx >= level.w || ny < 0 || ny >= level.h) return state
      const next = ny * level.w + nx
      if (level.walls[next]) return state

      const boxAt = state.boxes.indexOf(next)
      if (boxAt < 0) {
        return {
          ...state,
          player: next,
          steps: state.steps + 1,
          hint: null,
          events: [{ t: 'walked' }],
        }
      }
      // 推箱：箱前格须空（非墙非箱）
      const bx2 = nx + dx
      const by2 = ny + dy
      if (bx2 < 0 || bx2 >= level.w || by2 < 0 || by2 >= level.h) return state
      const beyond = by2 * level.w + bx2
      if (level.walls[beyond] || state.boxes.includes(beyond)) return state

      const boxes = state.boxes.slice()
      boxes[boxAt] = beyond
      boxes.sort((a, b) => a - b)
      const placed = level.targets[beyond]
      const pushedState: SokobanState = {
        ...state,
        boxes,
        player: next,
        steps: state.steps + 1,
        pushes: state.pushes + 1,
        hint: null,
        stuckBox: null,
        history: [...state.history, { boxes: state.boxes, player: state.player, steps: state.steps, pushes: state.pushes }],
        events: [{ t: 'pushed', from: next, to: beyond, placed }],
      }
      if (pushedState.boxes.every((b) => level.targets[b])) {
        return { ...pushedState, phase: 'won', events: [...pushedState.events, { t: 'won' }] }
      }
      if (isDeadCell(level, boxes, beyond)) {
        return { ...pushedState, stuckBox: beyond, events: [...pushedState.events, { t: 'deadlock', box: beyond }] }
      }
      return pushedState
    }
    case 'undo': {
      if (state.phase !== 'playing' || state.history.length === 0) return state
      const history = state.history.slice()
      const snap = history.pop() as SokobanSnapshot
      return {
        ...state,
        boxes: snap.boxes,
        player: snap.player,
        steps: snap.steps,
        pushes: snap.pushes,
        hint: null,
        stuckBox: null,
        history,
        events: [{ t: 'undid' }],
      }
    }
    case 'hint':
      if (state.phase !== 'playing') return state
      return { ...state, hint: { box: action.box, dir: action.dir }, events: [] }
    case 'unstick':
      return state.stuckBox === null ? state : { ...state, stuckBox: null, events: [] }
  }
}

/** 评星：过关 1 星；≤二星门槛 2 星；≤三星门槛 3 星。 */
export function starsFor(level: SokobanLevel, steps: number): number {
  if (steps <= level.threeStar) return 3
  if (steps <= level.twoStar) return 2
  return 1
}
