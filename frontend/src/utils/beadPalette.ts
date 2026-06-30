import type { BeadColor, Lab, Palette, PaletteKey } from '@/types/beads'
import { rgbToLab, deltaE2000 } from '@/utils/color'
import { BASIC_24_COLORS, MARD_291_COLORS, type RawBeadColor } from '@/utils/beadPaletteData'

const MARD_221_PREFIXES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'])

const PALETTE_META: Record<PaletteKey, { name: string; displayName: string }> = {
  'mard-221': { name: 'MARD 221 色', displayName: 'Mard' },
  'mard-291': { name: 'MARD 291 色', displayName: 'Mard' },
  'basic-24': { name: '基础 24 色', displayName: '基础色' },
}

const paletteCache = new Map<PaletteKey, Palette>()

function buildColors(raw: readonly RawBeadColor[]): BeadColor[] {
  return raw.map((color) => ({
    ...color,
    lab: rgbToLab(color.rgb[0], color.rgb[1], color.rgb[2]),
  }))
}

export function getPalette(key: PaletteKey): Palette {
  const cached = paletteCache.get(key)
  if (cached) {
    return cached
  }

  let raw: readonly RawBeadColor[]
  switch (key) {
    case 'basic-24':
      raw = BASIC_24_COLORS
      break
    case 'mard-291':
      raw = MARD_291_COLORS
      break
    default:
      raw = MARD_291_COLORS.filter((color) => {
        const prefix = /^([A-Z]+)/.exec(color.code)?.[1] ?? ''
        return MARD_221_PREFIXES.has(prefix)
      })
  }

  const palette: Palette = {
    key,
    name: PALETTE_META[key].name,
    displayName: PALETTE_META[key].displayName,
    colors: buildColors(raw),
  }
  paletteCache.set(key, palette)
  return palette
}

/** ΔE2000 找最近拼豆色，调用方只对聚类中心调用（≤48 次），无性能压力 */
export function nearestBeadIndex(lab: Lab, palette: Palette): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.colors.length; i++) {
    const dist = deltaE2000(lab, palette.colors[i].lab)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

export const PALETTE_OPTIONS: { key: PaletteKey; label: string }[] = [
  { key: 'mard-221', label: 'MARD 221 色' },
  { key: 'mard-291', label: 'MARD 291 色' },
  { key: 'basic-24', label: '基础 24 色' },
]
