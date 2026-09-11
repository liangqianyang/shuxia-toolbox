/**
 * 飞行棋棋盘几何唯一真相：15×15 单位格十字环的归一化坐标 [0..1]，
 * canvas 渲染（ludoRender.ts）与 DOM 飞机摆位（页面）共用同一份。
 *
 * 布局与规则引擎（utils/ludo.ts ↔ PHP LudoRule）对齐：
 * - 环 52 格顺时针；色 c 起飞格 = 环索引 c×13（色 0=左上机场 (1,6)、1=右上 (8,1)、2=右下 (13,8)、3=左下 (6,13)）；
 * - 环索引 i 的格子颜色 = i mod 4（各色格间隔 4，与"己色格 = 相对距离 d≡0 mod 4"一致）；
 * - 色相对 d=50 的环格恰好是逆时针邻臂的外侧中格（左/上/右/下），d=51..55 沿该臂中列/行通向中心，d=56=中心；
 * - 飞行弧：色 c 相对 16 → 28（环 (c×13+16)%52 → (c×13+28)%52），弧线从邻角上方掠过（纯装饰走向）。
 *
 * 本文件不 import 任何 uni API（Node 可测）。
 */
import { HANGAR, JOURNEY, MAIN_CELLS } from './ludo'

/** 单位棋盘 15×15 格。 */
export const GRID = 15

/** 格中心归一化。 */
export interface Point {
  x: number
  y: number
}

/** 环路径的直线段（起终点含端点，网格坐标）。 */
const RUNS: Array<[number, number, number, number]> = [
  [1, 6, 5, 6], // (1,6)→(5,6) 向右（色 0 起飞格在 (1,6)）
  [6, 5, 6, 5], // 内角
  [6, 4, 6, 0], // 向上
  [7, 0, 7, 0], // 顶中
  [8, 0, 8, 5], // 向下
  [9, 6, 9, 6], // 内角（色 1 起飞格）
  [10, 6, 14, 6], // 向右
  [14, 7, 14, 7], // 右中
  [14, 8, 9, 8], // 向左
  [8, 9, 8, 9], // 内角（色 2 起飞格）
  [8, 10, 8, 14], // 向下
  [7, 14, 7, 14], // 底中
  [6, 14, 6, 9], // 向上
  [5, 8, 5, 8], // 内角（色 3 起飞格）
  [4, 8, 0, 8], // 向左
  [0, 7, 0, 7], // 左中
  [0, 6, 0, 6], // 收尾（下一格回到 (1,6)）
]

/** 环 52 格的网格坐标（下标 = 环索引）。 */
export const RING: Array<[number, number]> = (() => {
  const cells: Array<[number, number]> = []
  for (const [x0, y0, x1, y1] of RUNS) {
    const dx = Math.sign(x1 - x0)
    const dy = Math.sign(y1 - y0)
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let s = 0; s <= steps; s++) {
      cells.push([x0 + dx * s, y0 + dy * s])
    }
  }
  if (cells.length !== MAIN_CELLS) {
    throw new Error(`棋盘环格子数 ${cells.length} ≠ ${MAIN_CELLS}`)
  }
  return cells
})()

/** 色相对 d（≤50）→ 环索引。 */
export function ringIndexFor(color: number, d: number): number {
  return (color * 13 + d) % MAIN_CELLS
}

/** 环索引 → 格中心归一化坐标。 */
export function trackCell(index: number): Point {
  const [gx, gy] = RING[((index % MAIN_CELLS) + MAIN_CELLS) % MAIN_CELLS]
  return { x: (gx + 0.5) / GRID, y: (gy + 0.5) / GRID }
}

/** 四色的终点跑道（相对 51..55 → 该臂中列/行靠外到靠内）。 */
const HOME_RUNS: Array<[number, number, number, number]> = [
  [1, 7, 5, 7], // 色 0：左臂中行，从 (1,7) 到 (5,7)
  [7, 1, 7, 5], // 色 1：顶臂中列
  [13, 7, 9, 7], // 色 2：右臂中行
  [7, 13, 7, 9], // 色 3：底臂中列
]

/** 终点跑道格中心（pos ∈ 51..55）。 */
export function homeCell(color: number, pos: number): Point {
  const [x0, y0, x1, y1] = HOME_RUNS[color]
  const step = pos - 51 // 0..4
  const dx = Math.sign(x1 - x0)
  const dy = Math.sign(y1 - y0)
  return { x: (x0 + dx * step + 0.5) / GRID, y: (y0 + dy * step + 0.5) / GRID }
}

/** 棋盘中心（终点）。 */
export function centerPoint(): Point {
  return { x: 7.5 / GRID, y: 7.5 / GRID }
}

/** 四色机场（6×6 角块）网格范围 [x0,x1]×[y0,y1]。 */
export const YARD_RECTS: Array<[number, number, number, number]> = [
  [0, 0, 5, 5], // 色 0 左上
  [9, 0, 14, 5], // 色 1 右上
  [9, 9, 14, 14], // 色 2 右下
  [0, 9, 5, 14], // 色 3 左下
]

/** 机场内 2×2 停机位（planeIdx 0..3）。 */
export function hangarSlot(color: number, planeIdx: number): Point {
  const [x0, y0, x1, y1] = YARD_RECTS[color]
  const cx = (x0 + x1 + 1) / 2
  const cy = (y0 + y1 + 1) / 2
  const off = 1.6
  const sx = planeIdx % 2 === 0 ? -off : off
  const sy = planeIdx < 2 ? -off : off
  return { x: (cx + sx) / GRID, y: (cy + sy) / GRID }
}

/** 飞机任意坐标（pos：-1 机场 / 0..50 主道 / 51..55 跑道 / 56 中心）→ 归一化坐标。 */
export function posToPoint(color: number, pos: number, planeIdx = 0): Point {
  if (pos === HANGAR) return hangarSlot(color, planeIdx)
  if (pos >= JOURNEY) return centerPoint()
  if (pos >= 51) return homeCell(color, pos)
  return trackCell(ringIndexFor(color, pos))
}

/** 飞行弧（色 c）：起终格 + 控制点。控制点按「弧线在 t=0.5 恰好经过碾压格」反推——
 * 航线视觉上正压在规则里的碾压格上方，语义自洽（曲线不超出控制点凸包，仍在棋盘内）。 */
export function flyArc(color: number): { from: Point, to: Point, ctrl: Point } {
  const from = trackCell(ringIndexFor(color, 16))
  const to = trackCell(ringIndexFor(color, 28))
  const crush = trackCell(crushIndex(color))
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  return {
    from,
    to,
    ctrl: { x: 2 * crush.x - mid.x, y: 2 * crush.y - mid.y },
  }
}

/** 碾压格环索引（色 c 相对 22）。 */
export function crushIndex(color: number): number {
  return ringIndexFor(color, 22)
}

/** 飞行起点格环索引（色 c 相对 16）。 */
export function flyFromIndex(color: number): number {
  return ringIndexFor(color, 16)
}

/** 星标（起飞）格环索引：四色各自的起飞格。 */
export function starIndex(color: number): number {
  return color * 13
}
