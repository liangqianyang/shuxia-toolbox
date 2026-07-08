import type { MapViewport } from '@/types/travel'

/**
 * Web Mercator（slippy map）投影：经纬度 → 相对地图图片左上角的像素坐标。
 * 与后端 computeViewport 用同一视口（center + zoom），腾讯 staticmap 底图也按该视口渲染，
 * 三者一致 → 前端投影坐标与底图严格对齐，编号点正好落在真实道路上。
 * 返回 {x, y}：相对地图图区（0..mapW, 0..mapH），调用方再加地图区左上角偏移。
 */
export function projectLatLng(
  lat: number,
  lng: number,
  vp: MapViewport,
  mapW: number,
  mapH: number,
): { x: number; y: number } {
  const n = Math.pow(2, vp.zoom)
  const tileY = (la: number): number => {
    const r = (la * Math.PI) / 180
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  }
  const cX = ((vp.centerLng + 180) / 360) * n
  const cY = tileY(vp.centerLat)
  const pX = ((lng + 180) / 360) * n
  const pY = tileY(lat)
  return { x: (pX - cX) * 256 + mapW / 2, y: (pY - cY) * 256 + mapH / 2 }
}
