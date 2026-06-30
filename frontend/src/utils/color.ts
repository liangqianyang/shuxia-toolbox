import type { Lab } from '@/types/beads'

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** sRGB → XYZ(D65) → CIELAB */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  // D65 白点归一化后的 XYZ
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

/** CIE76 距离的平方，仅用于大小比较（聚类迭代内便宜） */
export function deltaE76Sq(a: Lab, b: Lab): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return dl * dl + da * da + db * db
}

/** CIEDE2000，用于聚类中心 → 色板的最终映射 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { l: l1, a: a1, b: b1 } = lab1
  const { l: l2, a: a2, b: b2 } = lab2

  const c1 = Math.sqrt(a1 * a1 + b1 * b1)
  const c2 = Math.sqrt(a2 * a2 + b2 * b2)
  const cAvg = (c1 + c2) / 2
  const cAvg7 = Math.pow(cAvg, 7)
  const g = 0.5 * (1 - Math.sqrt(cAvg7 / (cAvg7 + Math.pow(25, 7))))

  const a1p = a1 * (1 + g)
  const a2p = a2 * (1 + g)
  const c1p = Math.sqrt(a1p * a1p + b1 * b1)
  const c2p = Math.sqrt(a2p * a2p + b2 * b2)

  const h1p = c1p === 0 ? 0 : ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360
  const h2p = c2p === 0 ? 0 : ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360

  const dlp = l2 - l1
  const dcp = c2p - c1p

  let dhp: number
  if (c1p * c2p === 0) {
    dhp = 0
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360
  } else {
    dhp = h2p - h1p + 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(((dhp / 2) * Math.PI) / 180)

  const lAvg = (l1 + l2) / 2
  const cpAvg = (c1p + c2p) / 2

  let hpAvg: number
  if (c1p * c2p === 0) {
    hpAvg = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= 180) {
    hpAvg = (h1p + h2p) / 2
  } else if (h1p + h2p < 360) {
    hpAvg = (h1p + h2p + 360) / 2
  } else {
    hpAvg = (h1p + h2p - 360) / 2
  }

  const t =
    1 -
    0.17 * Math.cos(((hpAvg - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hpAvg * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hpAvg + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hpAvg - 63) * Math.PI) / 180)

  const lAvgSq = (lAvg - 50) * (lAvg - 50)
  const sl = 1 + (0.015 * lAvgSq) / Math.sqrt(20 + lAvgSq)
  const sc = 1 + 0.045 * cpAvg
  const sh = 1 + 0.015 * cpAvg * t

  const dTheta = 30 * Math.exp(-((hpAvg - 275) / 25) * ((hpAvg - 275) / 25))
  const cpAvg7 = Math.pow(cpAvg, 7)
  const rc = 2 * Math.sqrt(cpAvg7 / (cpAvg7 + Math.pow(25, 7)))
  const rt = -rc * Math.sin((2 * dTheta * Math.PI) / 180)

  const dl = dlp / sl
  const dc = dcp / sc
  const dh = dHp / sh

  return Math.sqrt(dl * dl + dc * dc + dh * dh + rt * dc * dh)
}

/** WCAG 相对亮度（0–1） */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** 给定底色返回可读的文字颜色 */
export function textColorOn(rgb: readonly [number, number, number]): '#000000' | '#FFFFFF' {
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) > 0.45 ? '#000000' : '#FFFFFF'
}
