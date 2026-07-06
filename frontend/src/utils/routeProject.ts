/**
 * 经纬度 → canvas 投影（平台无关纯函数，可单测）。
 *
 * 同城：线性映射到路线区（lng→x，lat→y 反向）。
 * 跨城：按相邻有效点的切比雪夫距离分段，各段在路线区内垂直分区，段间留虚线衔接。
 * 有效坐标点 < 2 时退化为横向均匀编号示意（reliable=false）。
 */

/** 相邻点切比雪夫距离（经纬度度数）超过该阈值视为跨城断点（约 50km：同城远景点 < 此值不分段，跨城 > 此值分段） */
const CLUSTER_THRESHOLD = 0.5

export interface RoutePoint {
  x: number
  y: number
  /** 在原始 stops 序列中的下标（用于编号） */
  stopIndex: number
  stopId: string
}

export interface RouteSegment {
  points: RoutePoint[]
}

export interface RouteProjection {
  segments: RouteSegment[]
  /** true=按真实坐标投影；false=横向均匀降级示意 */
  reliable: boolean
}

export interface CanvasBox {
  x: number
  y: number
  width: number
  height: number
}

interface StopLike {
  id: string
  lng: number | null
  lat: number | null
}

interface IndexedStop {
  s: StopLike
  i: number
}

export function projectRoute(stops: StopLike[], box: CanvasBox, options?: { padding?: number }): RouteProjection {
  const padding = (options?.padding ?? 0.08) * Math.min(box.width, box.height)
  const innerX = box.x + padding
  const innerY = box.y + padding
  const innerW = Math.max(1, box.width - 2 * padding)
  const innerH = Math.max(1, box.height - 2 * padding)

  const valid: IndexedStop[] = stops
    .map((s, i) => ({ s, i }))
    .filter((it) => it.s.lng != null && it.s.lat != null)

  // 有效点不足：横向均匀降级（所有 stops 按顺序一行排开）
  if (valid.length < 2) {
    const n = stops.length
    const points: RoutePoint[] = stops.map((s, i) => ({
      x: innerX + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1)),
      y: innerY + innerH / 2,
      stopIndex: i,
      stopId: s.id,
    }))
    return { segments: [{ points }], reliable: false }
  }

  // 行程有序，单链聚类：相邻有效点距离超阈值则断段
  const groups: IndexedStop[][] = []
  let cur: IndexedStop[] = [valid[0]]
  for (let k = 1; k < valid.length; k++) {
    const prev = valid[k - 1].s
    const now = valid[k].s
    const dist = Math.max(
      Math.abs((now.lng as number) - (prev.lng as number)),
      Math.abs((now.lat as number) - (prev.lat as number)),
    )
    if (dist > CLUSTER_THRESHOLD) {
      groups.push(cur)
      cur = [valid[k]]
    } else {
      cur.push(valid[k])
    }
  }
  groups.push(cur)

  // 各段在 box 内垂直分区，段内线性投影
  const segCount = groups.length
  const bandH = innerH / segCount
  const segments: RouteSegment[] = groups.map((group, gi) => {
    const lngs = group.map((it) => it.s.lng as number)
    const lats = group.map((it) => it.s.lat as number)
    const lngMin = Math.min(...lngs)
    const lngMax = Math.max(...lngs)
    const latMin = Math.min(...lats)
    const latMax = Math.max(...lats)
    const bandY = innerY + gi * bandH
    const points: RoutePoint[] = group.map((it) => {
      const t = lngMax === lngMin ? 0.5 : ((it.s.lng as number) - lngMin) / (lngMax - lngMin)
      const u = latMax === latMin ? 0.5 : ((it.s.lat as number) - latMin) / (latMax - latMin)
      return {
        x: innerX + t * innerW,
        y: bandY + (1 - u) * bandH, // 纬度大=北=上
        stopIndex: it.i,
        stopId: it.s.id,
      }
    })
    return { points }
  })

  return { segments, reliable: true }
}
