/**
 * 军棋（两人暗棋）纯规则镜像：与后端 app/Service/MountainChess/MountainChessRule.php 双份同步。
 * 后端是权威（战斗裁决/布阵校验/超时代走都以服务端为准），这里只做落点提示、布阵编辑器
 * 即时校验与单测锁定；冲突以 PHP 为准。规则唯一事实源：docs/junqi-rules.md。
 * 坐标：绝对显示坐标 r 0..11（0-5 蓝方上半场，6-11 红方下半场）、c 0..4；蓝方座位客户端
 * 本地做 180° 旋转（screen↔absolute：r'=11-r，c'=4-c）。
 */

import type { JunqiLayoutPiece, JunqiPiece, JunqiRank, JunqiSide } from '@/types/junqi'

export const ROWS = 12
export const COLS = 5

export const RED: JunqiSide = 'red'
export const BLUE: JunqiSide = 'blue'

/** 军衔等级：司令 9 … 工兵 1；zha/lei/qi 为特殊子。 */
export const RANKS: Record<string, number> = { si: 9, jun: 8, shi: 7, lv: 6, tuan: 5, ying: 4, lian: 3, pai: 2, gong: 1 }

export const RANK_NAMES: Record<JunqiRank, string> = {
  si: '司令', jun: '军长', shi: '师长', lv: '旅长', tuan: '团长', ying: '营长',
  lian: '连长', pai: '排长', gong: '工兵', zha: '炸弹', lei: '地雷', qi: '军旗',
}

/** 等级链顺序（等级表展示用）。 */
export const RANK_ORDER: JunqiRank[] = ['si', 'jun', 'shi', 'lv', 'tuan', 'ying', 'lian', 'pai', 'gong']

/** 每方 25 枚的编制。 */
export const PIECE_COUNTS: Record<JunqiRank, number> = {
  si: 1, jun: 1, shi: 2, lv: 2, tuan: 2, ying: 2, lian: 3, pai: 3, gong: 3, zha: 2, lei: 3, qi: 1,
}

/** 行营 [r, c]（显示坐标，进入免战、布阵不可放子）。 */
export const CAMP_CELLS: Record<JunqiSide, Array<[number, number]>> = {
  blue: [[2, 1], [2, 3], [3, 2], [4, 1], [4, 3]],
  red: [[9, 1], [9, 3], [8, 2], [7, 1], [7, 3]],
}

/** 大本营 [r, c]（军旗限放于此；任何子进入后不能再移动）。 */
export const HQ_CELLS: Record<JunqiSide, Array<[number, number]>> = {
  blue: [[0, 1], [0, 3]],
  red: [[11, 1], [11, 3]],
}

/** 铁路横线所在显示行（全宽）。 */
export const RAIL_ROWS = [1, 5, 6, 10]

/** 铁路纵线所在显示列，行 1..10 连续（含跨山界）。 */
export const RAIL_COLS = [0, 4]

export const RAIL_TOP = 1
export const RAIL_BOTTOM = 10

/** 山界公路通路（列 2；列 0/4 是铁路通路）。 */
export const CROSS_ROAD_COL = 2

export function opponent(side: JunqiSide): JunqiSide {
  return side === RED ? BLUE : RED
}

export function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

const CAMP_LOOKUP: Set<string> = new Set(
  Object.values(CAMP_CELLS).flat().map(([r, c]) => `${r}:${c}`),
)

/** 是否行营（任意方）。 */
export function isCamp(r: number, c: number): boolean {
  return CAMP_LOOKUP.has(`${r}:${c}`)
}

export function isHqOf(side: JunqiSide, r: number, c: number): boolean {
  return HQ_CELLS[side].some(([hr, hc]) => hr === r && hc === c)
}

/** 是否铁路格。 */
export function isRail(r: number, c: number): boolean {
  if (RAIL_ROWS.includes(r)) return true
  return RAIL_COLS.includes(c) && r >= RAIL_TOP && r <= RAIL_BOTTOM
}

/**
 * 公路一步邻格：正交相邻 + 行营四斜角 + 山界中路 (5,2)↔(6,2)。
 * 行 5/6 之间只有列 2 相通（列 0/4 由铁路边承载）。
 */
export function roadNeighbors(r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
    const nr = r + dr
    const nc = c + dc
    if (!inBoard(nr, nc)) continue
    if ((r === 5 && nr === 6) || (r === 6 && nr === 5)) {
      if (c !== CROSS_ROAD_COL) continue
    }
    out.push([nr, nc])
  }
  if (isCamp(r, c)) {
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const nr = r + dr
        const nc = c + dc
        if (inBoard(nr, nc)) out.push([nr, nc])
      }
    }
  }
  return out
}

/** 铁路边邻格（仅用于工兵 BFS）：同铁路横线相邻，或同铁路纵线相邻（行 1..10）。 */
export function railNeighbors(r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  if (!isRail(r, c)) return out
  if (RAIL_ROWS.includes(r)) {
    for (const dc of [-1, 1]) {
      const nc = c + dc
      if (inBoard(r, nc)) out.push([r, nc])
    }
  }
  if (RAIL_COLS.includes(c)) {
    for (const dr of [-1, 1]) {
      const nr = r + dr
      if (inBoard(nr, c) && nr >= RAIL_TOP && nr <= RAIL_BOTTOM) out.push([nr, c])
    }
  }
  return out
}

export function pieceAt(pieces: JunqiPiece[], r: number, c: number): JunqiPiece | null {
  return pieces.find(p => p.alive && p.r === r && p.c === c) ?? null
}

/**
 * 走子是否合法；返回 null 表示合法，否则返回错误键（与 PHP 一字不差）。
 */
export function validateMove(pieces: JunqiPiece[], turn: JunqiSide, fr: number, fc: number, tr: number, tc: number): string | null {
  if (!inBoard(fr, fc) || !inBoard(tr, tc)) return 'out_of_range'
  const piece = pieceAt(pieces, fr, fc)
  if (!piece) return 'no_piece'
  if (piece.side !== turn) return 'not_yours'
  if (piece.rank === 'lei' || piece.rank === 'qi') return 'cannot_move'
  if (isHqOf('red', fr, fc) || isHqOf('blue', fr, fc)) return 'locked_hq'
  if (isHqOf(turn, tr, tc)) return 'in_own_hq'
  const target = pieceAt(pieces, tr, tc)
  if (target && target.side === turn) return 'blocked_own'
  if (target && isCamp(tr, tc)) return 'camp_protected'
  if (!reachableTargets(pieces, fr, fc).some(([hr, hc]) => hr === tr && hc === tc)) return 'not_reachable'
  return null
}

/**
 * 某格棋子的所有可达落点（移动规则层，不判断战斗结果——暗棋下任意敌子皆可攻击，胜负服务器裁决）。
 */
export function reachableTargets(pieces: JunqiPiece[], fr: number, fc: number): Array<[number, number]> {
  const piece = pieceAt(pieces, fr, fc)
  if (!piece || piece.rank === 'lei' || piece.rank === 'qi') return []
  if (isHqOf('red', fr, fc) || isHqOf('blue', fr, fc)) return []
  const targets: Array<[number, number]> = [...roadNeighbors(fr, fc)]
  if (isRail(fr, fc)) {
    const railTargets = piece.rank === 'gong' ? gongRailTargets(pieces, fr, fc) : straightRailTargets(pieces, fr, fc)
    targets.push(...railTargets)
  }
  const unique = new Map<string, [number, number]>()
  for (const [tr, tc] of targets) {
    if (!inBoard(tr, tc) || (tr === fr && tc === fc)) continue
    unique.set(`${tr}:${tc}`, [tr, tc])
  }
  return [...unique.values()]
}

/** 相邻两格是否属于同一条铁路线（滑行合法性）。 */
function onRailLine(fr: number, fc: number, tr: number, tc: number): boolean {
  if (fr === tr) return RAIL_ROWS.includes(fr)
  if (fc === tc) {
    return RAIL_COLS.includes(fc) && fr >= RAIL_TOP && fr <= RAIL_BOTTOM && tr >= RAIL_TOP && tr <= RAIL_BOTTOM
  }
  return false
}

/** 非工兵铁路直线滑行：沿所属铁路线向四方向滑到头（路径必须为空，撞上第一枚子为止）。 */
function straightRailTargets(pieces: JunqiPiece[], fr: number, fc: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
    let nr = fr + dr
    let nc = fc + dc
    while (inBoard(nr, nc) && onRailLine(fr, fc, nr, nc)) {
      out.push([nr, nc])
      if (pieceAt(pieces, nr, nc)) break
      nr += dr
      nc += dc
    }
  }
  return out
}

/** 工兵铁路 BFS：沿铁路网任意拐弯，中间格必须为空（终点可为敌子，可吃不可穿）。 */
function gongRailTargets(pieces: JunqiPiece[], fr: number, fc: number): Array<[number, number]> {
  const visited = new Set([`${fr}:${fc}`])
  const queue: Array<[number, number]> = [[fr, fc]]
  const out: Array<[number, number]> = []
  while (queue.length) {
    const [r, c] = queue.shift()!
    for (const [nr, nc] of railNeighbors(r, c)) {
      const key = `${nr}:${nc}`
      if (visited.has(key)) continue
      visited.add(key)
      const occupied = pieceAt(pieces, nr, nc) !== null
      out.push([nr, nc])
      if (!occupied) queue.push([nr, nc])
    }
  }
  return out
}

/** 战斗裁决：'flag'（夺旗终局）| 'win'（攻方胜）| 'lose'（攻方亡）| 'both'（同归于尽）。 */
export function resolveBattle(attacker: JunqiPiece, defender: JunqiPiece): 'flag' | 'win' | 'lose' | 'both' {
  if (defender.rank === 'qi') return 'flag'
  if (attacker.rank === 'zha') return 'both'
  if (defender.rank === 'lei') return attacker.rank === 'gong' ? 'win' : 'both'
  const ar = RANKS[attacker.rank ?? 'pai']
  const dr = RANKS[defender.rank ?? 'pai']
  if (ar > dr) return 'win'
  return ar === dr ? 'both' : 'lose'
}

/**
 * 在快照副本上执行走子（含战斗结算）。阵亡子保留原位置、alive=false、revealed=true；
 * 战斗存活的一方 revealed=true（交战暴露）；司令阵亡时 revealSide 指示亮旗方。
 */
export function applyMove(
  pieces: JunqiPiece[],
  mover: JunqiSide,
  fr: number,
  fc: number,
  tr: number,
  tc: number,
): { pieces: JunqiPiece[]; result: 'move' | 'win' | 'lose' | 'both' | 'flag'; captured: JunqiRank | null; revealSide: JunqiSide | null } {
  const next: JunqiPiece[] = []
  let attacker: JunqiPiece | null = null
  let defender: JunqiPiece | null = null
  for (const p of pieces) {
    if (p.alive && p.r === fr && p.c === fc && !attacker) attacker = p
    else if (p.alive && p.r === tr && p.c === tc && !defender) defender = p
    else next.push(p)
  }
  const result = defender === null || attacker === null ? 'move' : resolveBattle(attacker, defender)
  let revealSide: JunqiSide | null = null
  const markDead = (p: JunqiPiece): JunqiPiece => {
    const dead = { ...p, alive: false, revealed: true }
    if (dead.rank === 'si') revealSide = dead.side
    return dead
  }

  if (result === 'move' || !defender || !attacker) {
    next.push({ ...attacker!, r: tr, c: tc })
  } else if (result === 'flag') {
    next.push({ ...attacker, r: tr, c: tc }, markDead(defender))
  } else if (result === 'win') {
    next.push({ ...attacker, revealed: true, r: tr, c: tc }, markDead(defender))
  } else if (result === 'both') {
    next.push(markDead({ ...attacker, r: tr, c: tc }), markDead(defender))
  } else {
    next.push(markDead({ ...attacker, r: tr, c: tc }), { ...defender, revealed: true })
  }

  return { pieces: next, result, captured: defender && result !== 'move' ? (defender.rank ?? null) : null, revealSide }
}

/** 走子后即时胜负：'flag'（攻方夺旗）；对方全灭 'eliminated'；否则 null。 */
export function findWin(pieces: JunqiPiece[], mover: JunqiSide, result: string): 'flag' | 'eliminated' | null {
  if (result === 'flag') return 'flag'
  return pieces.some(p => p.side !== mover && p.alive) ? null : 'eliminated'
}

/** $side 是否还有任何合法着法（无步可走判负）。 */
export function hasAnyMove(pieces: JunqiPiece[], side: JunqiSide): boolean {
  return pieces.some((p) => {
    if (p.side !== side || !p.alive) return false
    return reachableTargets(pieces, p.r, p.c).length > 0
  })
}

/**
 * 校验一方布阵（25 项，己方半场绝对坐标）。返回 null=合法，否则错误键（与 PHP 一字不差）。
 */
export function validateLayout(side: JunqiSide, layout: JunqiLayoutPiece[]): string | null {
  if (layout.length !== 25) return 'layout_count'
  const counts: Partial<Record<JunqiRank, number>> = {}
  const seen = new Set<string>()
  const [rMin, rMax] = side === 'red' ? [6, 11] : [0, 5]
  const [backMin, backMax] = side === 'red' ? [10, 11] : [0, 1]
  const frontRow = side === 'red' ? 6 : 5
  for (const item of layout) {
    const rank = item.rank
    if (!(rank in PIECE_COUNTS)) return 'layout_rank'
    counts[rank] = (counts[rank] ?? 0) + 1
    const key = `${item.r}:${item.c}`
    if (seen.has(key)) return 'layout_overlap'
    seen.add(key)
    if (item.r < rMin || item.r > rMax || item.c < 0 || item.c >= COLS) return 'layout_half'
    if (isCamp(item.r, item.c)) return 'layout_camp'
    if (rank === 'lei' && (item.r < backMin || item.r > backMax)) return 'layout_mine_row'
    if (rank === 'zha' && item.r === frontRow) return 'layout_bomb_row'
    if (rank === 'qi' && !isHqOf(side, item.r, item.c)) return 'layout_flag_hq'
  }
  for (const [rank, count] of Object.entries(PIECE_COUNTS)) {
    if ((counts[rank as JunqiRank] ?? 0) !== count) return 'layout_count'
  }
  return null
}

/**
 * 随机合法布阵：军旗随机占一个大本营，地雷散后两排，炸弹避开前排，其余混洗填空。
 */
export function randomLayout(side: JunqiSide): JunqiLayoutPiece[] {
  const [rMin, rMax] = side === 'red' ? [6, 11] : [0, 5]
  const [backMin, backMax] = side === 'red' ? [10, 11] : [0, 1]
  const frontRow = side === 'red' ? 6 : 5

  const pool: Array<[number, number]> = []
  for (let r = rMin; r <= rMax; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isCamp(r, c)) pool.push([r, c])
    }
  }
  // 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const take = (filter: (r: number, c: number) => boolean): [number, number] => {
    const idx = pool.findIndex(([r, c]) => filter(r, c))
    const picked = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift()!
    return picked
  }

  const layout: JunqiLayoutPiece[] = []
  const hq = HQ_CELLS[side][Math.floor(Math.random() * 2)]
  take((r, c) => r === hq[0] && c === hq[1])
  layout.push({ rank: 'qi', r: hq[0], c: hq[1] })
  for (let i = 0; i < PIECE_COUNTS.lei; i++) {
    const [r, c] = take((r, c) => r >= backMin && r <= backMax)
    layout.push({ rank: 'lei', r, c })
  }
  for (let i = 0; i < PIECE_COUNTS.zha; i++) {
    const [r, c] = take((r, c) => r !== frontRow)
    layout.push({ rank: 'zha', r, c })
  }
  const rest: JunqiRank[] = []
  for (const [rank, count] of Object.entries(PIECE_COUNTS)) {
    if (rank === 'qi' || rank === 'lei' || rank === 'zha') continue
    for (let i = 0; i < count; i++) rest.push(rank as JunqiRank)
  }
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  for (const rank of rest) {
    const [r, c] = pool.shift()!
    layout.push({ rank, r, c })
  }
  return layout
}

/** 布阵条目转完整 pieces 快照（双方合并）。 */
export function buildPieces(redLayout: JunqiLayoutPiece[], blueLayout: JunqiLayoutPiece[]): JunqiPiece[] {
  const toPiece = (side: JunqiSide) => (p: JunqiLayoutPiece): JunqiPiece =>
    ({ side, rank: p.rank, r: p.r, c: p.c, alive: true, revealed: false })
  return [...redLayout.map(toPiece('red')), ...blueLayout.map(toPiece('blue'))]
}

/**
 * 预设阵型 ×3（均衡 / 镜像 / 急攻），全部通过 validateLayout（测试锁定）。
 * 红方绝对坐标；蓝方提交前由页面做 180° 旋转。
 */
export const PRESETS: { name: string, layout: JunqiLayoutPiece[] }[] = [
  {
    name: '均衡',
    layout: [
      { rank: 'lian', r: 6, c: 0 }, { rank: 'gong', r: 6, c: 1 }, { rank: 'tuan', r: 6, c: 2 }, { rank: 'pai', r: 6, c: 3 }, { rank: 'lian', r: 6, c: 4 },
      { rank: 'ying', r: 7, c: 0 }, { rank: 'gong', r: 7, c: 2 }, { rank: 'shi', r: 7, c: 4 },
      { rank: 'pai', r: 8, c: 0 }, { rank: 'jun', r: 8, c: 1 }, { rank: 'gong', r: 8, c: 3 }, { rank: 'lv', r: 8, c: 4 },
      { rank: 'zha', r: 9, c: 0 }, { rank: 'lv', r: 9, c: 2 }, { rank: 'tuan', r: 9, c: 4 },
      { rank: 'lei', r: 10, c: 0 }, { rank: 'lei', r: 10, c: 1 }, { rank: 'shi', r: 10, c: 2 }, { rank: 'ying', r: 10, c: 3 }, { rank: 'pai', r: 10, c: 4 },
      { rank: 'zha', r: 11, c: 0 }, { rank: 'qi', r: 11, c: 1 }, { rank: 'lei', r: 11, c: 2 }, { rank: 'lian', r: 11, c: 3 }, { rank: 'si', r: 11, c: 4 },
    ],
  },
  {
    name: '镜像',
    layout: [
      { rank: 'lian', r: 6, c: 4 }, { rank: 'gong', r: 6, c: 3 }, { rank: 'tuan', r: 6, c: 2 }, { rank: 'pai', r: 6, c: 1 }, { rank: 'lian', r: 6, c: 0 },
      { rank: 'ying', r: 7, c: 4 }, { rank: 'gong', r: 7, c: 2 }, { rank: 'shi', r: 7, c: 0 },
      { rank: 'pai', r: 8, c: 4 }, { rank: 'jun', r: 8, c: 3 }, { rank: 'gong', r: 8, c: 1 }, { rank: 'lv', r: 8, c: 0 },
      { rank: 'zha', r: 9, c: 4 }, { rank: 'lv', r: 9, c: 2 }, { rank: 'tuan', r: 9, c: 0 },
      { rank: 'lei', r: 10, c: 4 }, { rank: 'lei', r: 10, c: 3 }, { rank: 'shi', r: 10, c: 2 }, { rank: 'ying', r: 10, c: 1 }, { rank: 'pai', r: 10, c: 0 },
      { rank: 'zha', r: 11, c: 4 }, { rank: 'qi', r: 11, c: 3 }, { rank: 'lei', r: 11, c: 2 }, { rank: 'lian', r: 11, c: 1 }, { rank: 'si', r: 11, c: 0 },
    ],
  },
  {
    name: '急攻',
    layout: [
      { rank: 'lv', r: 6, c: 0 }, { rank: 'shi', r: 6, c: 1 }, { rank: 'tuan', r: 6, c: 2 }, { rank: 'shi', r: 6, c: 3 }, { rank: 'lv', r: 6, c: 4 },
      { rank: 'zha', r: 7, c: 0 }, { rank: 'jun', r: 7, c: 2 }, { rank: 'zha', r: 7, c: 4 },
      { rank: 'tuan', r: 8, c: 0 }, { rank: 'si', r: 8, c: 1 }, { rank: 'ying', r: 8, c: 3 }, { rank: 'pai', r: 8, c: 4 },
      { rank: 'gong', r: 9, c: 0 }, { rank: 'ying', r: 9, c: 2 }, { rank: 'lian', r: 9, c: 4 },
      { rank: 'lei', r: 10, c: 0 }, { rank: 'pai', r: 10, c: 1 }, { rank: 'lian', r: 10, c: 2 }, { rank: 'gong', r: 10, c: 3 }, { rank: 'gong', r: 10, c: 4 },
      { rank: 'lei', r: 11, c: 0 }, { rank: 'qi', r: 11, c: 1 }, { rank: 'lei', r: 11, c: 2 }, { rank: 'lian', r: 11, c: 3 }, { rank: 'pai', r: 11, c: 4 },
    ],
  },
]

// ---------- 画布几何（原型：格 pitch 36 / 格面 33 / 山界带 14，等比缩放） ----------

export interface JunqiGeometry {
  /** 格 pitch（含 3/36 间隙）。 */
  cell: number
  /** 山界带高度。 */
  band: number
  width: number
  height: number
}

export function boardGeometry(cell: number): JunqiGeometry {
  const band = Math.round(cell * (14 / 36))
  return { cell, band, width: cell * COLS, height: cell * ROWS + band }
}

/** 格子的绘制矩形（格面 = pitch − 3，居中于 pitch）。 */
export function cellRect(r: number, c: number, geo: JunqiGeometry): { x: number, y: number, size: number } {
  return {
    x: c * geo.cell + 1.5,
    y: (r < 6 ? r * geo.cell : r * geo.cell + geo.band) + 1.5,
    size: geo.cell - 3,
  }
}

/** 触摸坐标 → 格；山界带返回 null。 */
export function pointToCell(x: number, y: number, geo: JunqiGeometry): { r: number, c: number } | null {
  const c = Math.floor(x / geo.cell)
  if (c < 0 || c >= COLS) return null
  const firstBand = 6 * geo.cell
  if (y < firstBand) {
    const r = Math.floor(y / geo.cell)
    return r >= 0 && r < 6 ? { r, c } : null
  }
  if (y < firstBand + geo.band) return null
  const r = Math.floor((y - geo.band) / geo.cell)
  return r >= 6 && r < ROWS ? { r, c } : null
}
