/**
 * 枫趣冒险棋盘几何与静态配置（10×10 蛇形山道，1 在底行左端，100=枫顶在顶行）。
 *
 * 与后端 App\Service\Adventure\AdventureBoard 双份同步（同拼豆色卡/unoChat 的约定），
 * 规则条文见 docs/adventure-rules.md；冲突以 PHP 为准。
 * 不 import 任何 uni API（Node 可测，test/algo.test.ts 锁棋盘不变量）。
 */

export const SUMMIT = 100

export const CAMPS = [21, 41, 61, 81] as const

export const CABLE_STATIONS = [14, 38, 62] as const

export interface SegmentDef {
  from: number
  to: number
  name: string
  duel: 'rps' | 'bid' | 'dice'
  duelDouble: boolean
}

export const SEGMENTS: SegmentDef[] = [
  { from: 1, to: 20, name: '山脚草原', duel: 'rps', duelDouble: false },
  { from: 21, to: 40, name: '枫叶林', duel: 'bid', duelDouble: false },
  { from: 41, to: 60, name: '清溪谷', duel: 'dice', duelDouble: false },
  { from: 61, to: 80, name: '岩壁', duel: 'rps', duelDouble: false },
  { from: 81, to: 100, name: '雪线', duel: 'rps', duelDouble: true },
]

export type CellType =
  | 'plain' | 'camp' | 'leaf' | 'spring' | 'ladder' | 'cable' | 'slide' | 'rock'
  | 'shop' | 'supply' | 'ambush' | 'fate' | 'shrine' | 'arena' | 'avalanche' | 'fork' | 'summit'

export interface ForkOption {
  key: string
  label: string
  to: number | null
}

export interface CellDef {
  type: CellType
  to?: number
  back?: number
  options?: ForkOption[]
}

/** 机关格定义（无键 = 普通格），与后端 AdventureBoard::CELLS 一字不差。 */
export const CELLS: Record<number, CellDef> = {
  3: { type: 'leaf' },
  5: { type: 'ladder', to: 10 },
  7: { type: 'slide', to: 4 },
  10: { type: 'spring' },
  13: { type: 'leaf' },
  14: { type: 'cable', to: 28 },
  16: { type: 'rock', back: 3 },
  21: { type: 'camp' },
  23: { type: 'leaf' },
  25: { type: 'ambush' },
  27: { type: 'leaf' },
  30: {
    type: 'fork',
    options: [
      { key: 'cable', label: '缆车直达 44', to: 44 },
      { key: 'trail', label: '山道捡枫叶', to: null },
    ],
  },
  32: { type: 'leaf' },
  33: { type: 'shop' },
  35: { type: 'shrine' },
  37: { type: 'slide', to: 31 },
  38: { type: 'cable', to: 55 },
  40: { type: 'leaf' },
  41: { type: 'camp' },
  43: { type: 'spring' },
  45: { type: 'supply' },
  47: { type: 'ladder', to: 52 },
  49: { type: 'ambush' },
  53: { type: 'fate' },
  57: { type: 'leaf' },
  58: { type: 'ladder', to: 62 },
  59: { type: 'rock', back: 3 },
  61: { type: 'camp' },
  62: { type: 'cable', to: 79 },
  66: {
    type: 'fork',
    options: [
      { key: 'shortcut', label: '捷径直达 78', to: 78 },
      { key: 'trail', label: '安全绕行', to: null },
    ],
  },
  67: { type: 'ambush' },
  69: { type: 'rock', back: 4 },
  70: { type: 'arena' },
  72: { type: 'ladder', to: 76 },
  73: { type: 'slide', to: 63 },
  74: { type: 'avalanche' },
  77: { type: 'supply' },
  81: { type: 'camp' },
  83: { type: 'slide', to: 76 },
  85: { type: 'ambush' },
  87: { type: 'rock', back: 5 },
  89: { type: 'avalanche' },
  91: { type: 'shop' },
  93: { type: 'slide', to: 84 },
  95: { type: 'ladder', to: 98 },
  96: { type: 'rock', back: 4 },
  99: { type: 'shrine' },
  100: { type: 'summit' },
}

export const CELL_NAMES: Partial<Record<CellType, string>> = {
  camp: '营地',
  leaf: '枫叶格',
  spring: '温泉',
  ladder: '云梯',
  cable: '缆车',
  slide: '滑坡',
  rock: '落石',
  shop: '商店',
  supply: '补给站',
  ambush: '埋伏格',
  fate: '命运交换',
  shrine: '山神小屋',
  arena: '决斗擂台',
  avalanche: '雪崩',
  fork: '岔路口',
}

/** 格的机关定义；普通格返回 null。 */
export function cell(n: number): CellDef | null {
  return CELLS[n] ?? null
}

export function cellType(n: number): CellType {
  return CELLS[n]?.type ?? 'plain'
}

export function isCamp(n: number): boolean {
  return (CAMPS as readonly number[]).includes(n)
}

export function segmentOf(n: number): SegmentDef {
  return SEGMENTS.find((s) => n >= s.from && n <= s.to) ?? SEGMENTS[0]
}

/** 段位主色（棋盘渲染底色，奶油白基底上的低饱和带）。 */
export const SEGMENT_COLORS: { band: string; cell: string; text: string }[] = [
  { band: '#E7F0DC', cell: '#F4F9EC', text: '#4E7A3A' }, // 山脚草原
  { band: '#F7E5D2', cell: '#FCF1E5', text: '#A6541F' }, // 枫叶林
  { band: '#DDEEEC', cell: '#EFF8F7', text: '#2A6E68' }, // 清溪谷
  { band: '#E8E3DA', cell: '#F3F0EA', text: '#6E5F49' }, // 岩壁
  { band: '#E3EBF3', cell: '#F0F5FA', text: '#3A5A7E' }, // 雪线
]

/** 座位颜色（2-6 人，枫趣品牌色系延展）。 */
export const SEAT_COLORS = ['#E85D4A', '#F4B942', '#5F9E6E', '#4A7FB5', '#9B6BB5', '#4AB5A0']

export function seatColor(seat: number): string {
  return SEAT_COLORS[seat % SEAT_COLORS.length]
}

/**
 * 格号 → 棋盘归一化坐标（格中心，[0,1] 区间；pos=0 山脚起点在棋盘底边下方）。
 * 蛇形：奇数行（自底起）从左到右，偶数行从右到左。
 */
export function cellToPoint(n: number): { x: number; y: number } {
  if (n <= 0) {
    return { x: 0.5 / 10, y: 1.06 } // 山脚起点：棋盘底边中偏左的出发带
  }
  const clamped = Math.min(n, SUMMIT)
  const row = Math.floor((clamped - 1) / 10)
  let col = (clamped - 1) % 10
  if (row % 2 === 1) col = 9 - col
  return { x: (col + 0.5) / 10, y: 1 - (row + 0.5) / 10 }
}

/**
 * 位移统一语义（与后端 AdventureRule 一致的展示侧公式）：
 * 掷骰 exact=登顶；超出反弹（200-pos-steps）；雪线外前进被封顶暴雪截断为 81。
 * 这里只做 UI 提示用（如掷骰后的落点预览），权威以后端为准。
 */
export function previewTarget(pos: number, steps: number, canTicket: boolean, leaves: number): number {
  let target = pos + steps
  if (target > SUMMIT) {
    const gap = SUMMIT - pos
    if (canTicket && steps >= gap && leaves >= gap) return SUMMIT
    target = 2 * SUMMIT - target
  }
  return target
}
