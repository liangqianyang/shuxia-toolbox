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

/**
 * 静态底图通常先按服务商返回尺寸渲染，再用 cover 填入卡片地图容器。
 * 直接用容器宽高投影会忽略 cover 裁切，导致点线在宽屏地图里纵向偏挤。
 * 这里先投影到原图像素，再按 cover 的缩放/裁切映射到容器坐标。
 */
export function projectLatLngOnCoveredMap(
  lat: number,
  lng: number,
  vp: MapViewport,
  mapW: number,
  mapH: number,
  img: CanvasImageSource | null,
): { x: number; y: number } {
  const size = imageSize(img)
  if (!size) return projectLatLng(lat, lng, vp, mapW, mapH)

  const p = projectLatLng(lat, lng, vp, size.width, size.height)
  const scale = Math.max(mapW / size.width, mapH / size.height)
  return {
    x: (mapW - size.width * scale) / 2 + p.x * scale,
    y: (mapH - size.height * scale) / 2 + p.y * scale,
  }
}

function imageSize(img: CanvasImageSource | null): { width: number; height: number } | null {
  if (!img) return null
  const source = img as {
    width?: number
    naturalWidth?: number
    videoWidth?: number
    height?: number
    naturalHeight?: number
    videoHeight?: number
  }
  const width = source.width || source.naturalWidth || source.videoWidth || 0
  const height = source.height || source.naturalHeight || source.videoHeight || 0
  return width > 0 && height > 0 ? { width, height } : null
}
