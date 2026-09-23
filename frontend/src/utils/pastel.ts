/** 淡彩图标表（16 组 tint/fg）——v4 小清新「工具/游戏个性 = 图标小方块」专用。
 *  与 `src/styles/variables.scss` 的 `$pastel` SCSS map 双份同步（同 beadPalette 的 PHP/TS 同步约定）：
 *  SCSS map 供静态样式取值，本表供运行时动态 key（tool.key 来自接口，编译期函数取不到）。
 *  数据源：docs/design/maple-paper-prototype.html 的 JS `PASTEL` 表。 */
export interface PastelPair {
  /** 图标方块底色 */
  tint: string
  /** 图标方块前景色（emoji/线性图标着色） */
  fg: string
}

const PASTEL: Record<string, PastelPair> = {
  beads: { tint: '#FFF1E4', fg: '#E08A4C' },
  travel: { tint: '#E8F3FB', fg: '#4E97CE' },
  fortune: { tint: '#F1EDF9', fg: '#8E7CC3' },
  food: { tint: '#FFF6E0', fg: '#D9A032' },
  lottery: { tint: '#FDEEEA', fg: '#E27966' },
  anniversary: { tint: '#FCEFF4', fg: '#DE8FAB' },
  gomoku: { tint: '#ECF1F5', fg: '#5C7389' },
  uno: { tint: '#FDEEEA', fg: '#E27966' },
  ludo: { tint: '#E8F4F6', fg: '#4CA5B5' },
  adventure: { tint: '#ECF5EA', fg: '#67A75B' },
  tetris: { tint: '#E8F5FA', fg: '#3FA3C4' },
  sokoban: { tint: '#FBF3DF', fg: '#C99A34' },
  jungle: { tint: '#EFF6EC', fg: '#79A66B' },
  junqi: { tint: '#F5EEE6', fg: '#A98858' },
  xiangqi: { tint: '#FBEFEA', fg: '#CC6F4E' },
  tictactoe: { tint: '#EAF4FA', fg: '#5D9FC6' },
}

/** 未登记的 key（如新上架工具还没配淡彩色）回退到主蓝淡彩，保证新条目开箱可用 */
const FALLBACK: PastelPair = { tint: '#E9F4FB', fg: '#3B86B8' }

export function pastel(key: string): PastelPair {
  return PASTEL[key] || FALLBACK
}
