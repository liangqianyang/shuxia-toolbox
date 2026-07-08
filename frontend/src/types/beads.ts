export type PaletteKey = 'mard-221' | 'mard-291' | 'basic-24'
export type BoardPresetKey = 'auto' | 'small-1' | 'small-2' | 'large-1' | 'small-4' | 'custom'

export interface Lab {
  l: number
  a: number
  b: number
}

export interface BeadColor {
  /** 数据层色号恒为补零格式（F04、H07），展示时用 displayCode 去零 */
  code: string
  name: string
  hex: string
  rgb: readonly [number, number, number]
  lab: Lab
}

export interface Palette {
  key: PaletteKey
  name: string
  /** 图纸标题用短名，如 Mard */
  displayName: string
  colors: BeadColor[]
}

export interface PatternParams {
  boardPresetKey: BoardPresetKey
  /** custom 调试模式下的目标宽度；真实板规格由 boardPresetKey 自动推导 */
  gridWidth: number
  /** custom 调试模式下的目标高度；未设置时按 gridWidth 处理 */
  gridHeight: number
  /** auto 模式下是否按内容复杂度自动定格；关闭则用 gridLongSide 手动指定 */
  autoGridSize: boolean
  /** auto 模式手动定格时的长边格数（30-104）；仅在 autoGridSize=false 时生效 */
  gridLongSide: number
  paletteKey: PaletteKey
  removeBackground: boolean
  /** 仅用「我的库存」里勾选的颜色映射（库存为空时忽略，退回全色板） */
  ownedOnly: boolean
  /** 0–255，格子 alpha 占比低于该值视为空格 */
  alphaThreshold: number
}

/** 购物清单按包估算用：一包拼豆约多少颗。经验值，各卖家不一，可调。 */
export const BEADS_PER_PACK = 300

/** cells 中表示空格（透明/被去除背景）的值 */
export const EMPTY_CELL = -1

export interface UsedColor {
  paletteIndex: number
  color: BeadColor
  count: number
}

export interface PatternResult {
  width: number
  height: number
  /** 当前图纸对应的用板方案 */
  boardPlan: BoardPlan
  /** 长度 = width * height，值为色板下标或 EMPTY_CELL */
  cells: Int16Array
  /** 按 count 降序 */
  used: UsedColor[]
  /** 不含空格 */
  totalBeads: number
  params: PatternParams
}

export interface BoardPlan {
  presetKey: BoardPresetKey
  boardSize: 52 | 104
  cols: number
  rows: number
  total: number
  capacityWidth: number
  capacityHeight: number
  label: string
}

export interface BoardPreset {
  key: BoardPresetKey
  label: string
  boardSize: 52 | 104
  cols: number
  rows: number
  autoOrient?: boolean
}

export const BOARD_PRESETS: readonly BoardPreset[] = [
  { key: 'auto', label: '智能推荐', boardSize: 52, cols: 1, rows: 1 },
  { key: 'small-1', label: '1 张 52 小板', boardSize: 52, cols: 1, rows: 1 },
  { key: 'small-2', label: '2 张 52 小板', boardSize: 52, cols: 2, rows: 1, autoOrient: true },
  { key: 'large-1', label: '1 张 104 大板', boardSize: 104, cols: 1, rows: 1 },
  { key: 'small-4', label: '4 张 52 小板', boardSize: 52, cols: 2, rows: 2 },
] as const

export const DEFAULT_PARAMS: PatternParams = {
  boardPresetKey: 'auto',
  gridWidth: 52,
  gridHeight: 52,
  autoGridSize: true,
  gridLongSide: 52,
  paletteKey: 'mard-221',
  removeBackground: true,
  ownedOnly: false,
  alphaThreshold: 32,
}

/**
 * 用途预设：把常见成品尺寸一键套成板型/格数参数，降低休闲用户的认知负担。
 * 选「自定义」则展开高级设置手动调。尺寸为经验值，可调。
 */
export interface UseCasePreset {
  key: string
  label: string
  icon: string
  /** 应用到 params 的字段（部分覆盖） */
  patch: Partial<Pick<PatternParams, 'boardPresetKey' | 'autoGridSize' | 'gridLongSide'>>
  hint: string
}

export const USE_CASE_PRESETS: readonly UseCasePreset[] = [
  {
    key: 'smart',
    label: '智能推荐',
    icon: '✨',
    patch: { boardPresetKey: 'auto', autoGridSize: true },
    hint: '按图片内容自动定尺寸，适合大多数场景',
  },
  {
    key: 'keychain',
    label: '钥匙扣',
    icon: '🔑',
    patch: { boardPresetKey: 'auto', autoGridSize: false, gridLongSide: 30 },
    hint: '小巧成品，约 30 格，豆量省',
  },
  {
    key: 'coaster',
    label: '杯垫',
    icon: '☕',
    patch: { boardPresetKey: 'small-1', autoGridSize: false, gridLongSide: 52 },
    hint: '1 张 52 小板铺满，方形成品',
  },
  {
    key: 'avatar',
    label: '头像',
    icon: '🙂',
    patch: { boardPresetKey: 'auto', autoGridSize: false, gridLongSide: 58 },
    hint: '中等分辨率，五官细节清晰',
  },
  {
    key: 'frame',
    label: '相框大图',
    icon: '🖼️',
    patch: { boardPresetKey: 'large-1', autoGridSize: false, gridLongSide: 104 },
    hint: '1 张 104 大板，细节最多（建议分页打印）',
  },
] as const
