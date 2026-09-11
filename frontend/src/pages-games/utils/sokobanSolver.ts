/**
 * 推箱子求解器（纯 TS，无平台依赖）：离线预算三星门槛 + 运行时「看下一步」提示共用。
 *
 * 搜索空间 = 推状态（箱子集合 + 玩家可达域规范化），代价为**步数**（玩家移动数，
 * 与页面展示的「步数」同一口径）。启发式 = 各箱到最近目标的曼哈顿距离和
 * （推一格算一步、箱距至多减一 → 可采纳且一致）。扩展时用引擎的 isDeadCell
 * 剪枝（该启发无误报，剪掉不损最优性）。同一规范化状态允许以更小 g 重开（best-g 表，
 * 生成时去重会丢更优路径）。greedy 模式 f=h 牺牲最优换速度，只用于运行时提示。
 */

import { DIRS, isDeadCell, type SokobanLevel } from './sokoban'

export interface SolveResult {
  status: 'solved' | 'unsolvable' | 'timeout'
  /** 总步数（optimal=最优；greedy=找到的可行解）；solved 才有效。 */
  moves: number
  pushes: number
  /** 解法的第一次推箱 {box, dir}，提示用；box 为推之前箱子所在格。 */
  firstPush: { box: number; dir: number } | null
  /** 搜索展开的节点数（难度代理指标，关卡排序用）。 */
  nodes: number
}

interface SearchNode {
  boxes: number[]
  /** 玩家实际所在格（推箱后 = 箱子原格）。 */
  player: number
  g: number
  f: number
  /** 到达本节点的推箱（父节点视角）；根节点为 null。 */
  via: { box: number; dir: number } | null
  parent: SearchNode | null
}

class MinHeap {
  private items: SearchNode[] = []
  get size() { return this.items.length }
  push(node: SearchNode) {
    const a = this.items
    a.push(node)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): SearchNode | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop() as SearchNode
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/** 玩家可达域 BFS：dist（<0 = 不可达），推位距离与规范化键都用它。 */
function playerReach(level: SokobanLevel, boxes: readonly number[], from: number): Int32Array {
  const { w, h, walls } = level
  const blocked = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (walls[i]) blocked[i] = 1
  for (const b of boxes) blocked[b] = 1
  const dist = new Int32Array(w * h).fill(-1)
  dist[from] = 0
  const queue = [from]
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]
    const cx = cur % w
    const cy = (cur / w) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const next = ny * w + nx
      if (blocked[next] || dist[next] >= 0) continue
      dist[next] = dist[cur] + 1
      queue.push(next)
    }
  }
  return dist
}

function heuristic(level: SokobanLevel, boxes: readonly number[]): number {
  const { w, targets } = level
  const targetCells: number[] = []
  for (let i = 0; i < targets.length; i++) if (targets[i]) targetCells.push(i)
  let sum = 0
  for (const b of boxes) {
    const bx = b % w
    const by = (b / w) | 0
    let best = Infinity
    for (const t of targetCells) {
      const d = Math.abs((t % w) - bx) + Math.abs(((t / w) | 0) - by)
      if (d < best) best = d
    }
    sum += best
  }
  return sum
}

/** 规范化键：可达域最小格号（代表玩家位置）+ 升序箱集。 */
function stateKey(level: SokobanLevel, boxes: readonly number[], dist: Int32Array): string {
  let norm = -1
  for (let i = 0; i < dist.length; i++) if (dist[i] >= 0 && (norm < 0 || i < norm)) norm = i
  return `${norm}|${boxes.join(',')}`
}

/**
 * 求解。optimal 跑满 A*（离线预算三星门槛、测试对拍）；greedy 用 f=h 快速出解（运行时提示）。
 * budgetMs 超时返回 timeout（greedy 提示超时按「推不到」处理，关卡小罕见）。
 */
export function solve(
  level: SokobanLevel,
  startBoxes: readonly number[],
  startPlayer: number,
  opts: { mode: 'optimal' | 'greedy'; budgetMs?: number } = { mode: 'optimal' },
): SolveResult {
  const deadline = Date.now() + (opts.budgetMs ?? 2000)
  const startBoxesSorted = startBoxes.slice().sort((a, b) => a - b)
  if (startBoxesSorted.every((b) => level.targets[b])) {
    return { status: 'solved', moves: 0, pushes: 0, firstPush: null, nodes: 0 }
  }
  const gWeight = opts.mode === 'greedy' ? 0 : 1

  const rootDist = playerReach(level, startBoxesSorted, startPlayer)
  const root: SearchNode = {
    boxes: startBoxesSorted,
    player: startPlayer,
    g: 0,
    f: heuristic(level, startBoxesSorted),
    via: null,
    parent: null,
  }
  const best = new Map<string, number>([[stateKey(level, root.boxes, rootDist), 0]])
  const heap = new MinHeap()
  heap.push(root)
  let nodes = 0

  while (heap.size > 0) {
    nodes++
    if ((nodes & 63) === 0 && Date.now() > deadline) {
      return { status: 'timeout', moves: 0, pushes: 0, firstPush: null, nodes }
    }
    const node = heap.pop() as SearchNode
    const dist = playerReach(level, node.boxes, node.player)
    const boxSet = new Set(node.boxes)

    for (const box of node.boxes) {
      const bx = box % level.w
      const by = (box / level.w) | 0
      for (let dir = 0; dir < 4; dir++) {
        const [dx, dy] = DIRS[dir]
        const standX = bx - dx
        const standY = by - dy
        const destX = bx + dx
        const destY = by + dy
        if (standX < 0 || standX >= level.w || standY < 0 || standY >= level.h) continue
        if (destX < 0 || destX >= level.w || destY < 0 || destY >= level.h) continue
        const stand = standY * level.w + standX
        const dest = destY * level.w + destX
        if (dist[stand] < 0) continue // 玩家到不了推位
        if (level.walls[dest] || boxSet.has(dest)) continue // 箱前不空
        const nextBoxes = node.boxes.filter((b) => b !== box)
        nextBoxes.push(dest)
        nextBoxes.sort((a, b) => a - b)
        if (!level.targets[dest] && isDeadCell(level, nextBoxes, dest)) continue // 死局剪枝

        const g = node.g + dist[stand] + 1 // 走到推位 + 推这一步
        const key = stateKey(level, nextBoxes, playerReach(level, nextBoxes, box)) // 推完玩家在箱子原格
        const known = best.get(key)
        if (known !== undefined && known <= g) continue
        best.set(key, g)

        const h = heuristic(level, nextBoxes)
        const child: SearchNode = {
          boxes: nextBoxes,
          player: box,
          g,
          f: gWeight * g + h,
          via: { box, dir },
          parent: node,
        }
        if (nextBoxes.every((b) => level.targets[b])) {
          let head = child
          while (head.parent && head.parent.parent) head = head.parent // 根的下一个 = 第一次推箱
          let pushes = 0
          for (let n: SearchNode | null = child; n && n.via; n = n.parent) pushes++
          return { status: 'solved', moves: g, pushes, firstPush: head.via, nodes }
        }
        heap.push(child)
      }
    }
  }
  return { status: 'unsolvable', moves: 0, pushes: 0, firstPush: null, nodes }
}

/** 运行时提示：从当前局面找下一次该推的箱子与方向；无解/超时返回 null。 */
export function nextPush(
  level: SokobanLevel,
  boxes: readonly number[],
  player: number,
  budgetMs = 400,
): { box: number; dir: number } | null {
  const result = solve(level, boxes, player, { mode: 'greedy', budgetMs })
  return result.status === 'solved' ? result.firstPush : null
}
