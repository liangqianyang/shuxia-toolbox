/* 攻略图渲染纯函数验证（Node 运行，无 Canvas 依赖）：
 * 1. wrapText：按字符折行、支持显式 \n、空串
 * 2. projectRoute：同城线性投影保持方位、跨城分段、全 null 降级、单点降级
 *
 * 注：卡片渲染（routeCard/poiCard/foodCard/timelineCard）依赖真实 Canvas 2D，
 * 走真机/开发者工具验证，不在此纯函数测试内。
 */
import { wrapText } from '@/utils/textLayout'
import { projectRoute } from '@/utils/routeProject'

let failures = 0
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}`)
  }
}

function mockCtx(charW: number): CanvasRenderingContext2D {
  return { measureText: (s: string) => ({ width: s.length * charW }) } as unknown as CanvasRenderingContext2D
}

console.log('— wrapText —')
{
  const ctx = mockCtx(10)
  assert(wrapText(ctx, '一二三四五六七八九十', 55).length === 2, '超宽按字符折成 2 行')
  assert(wrapText(ctx, '短', 100).length === 1, '短文本 1 行')
  const multi = wrapText(ctx, '一二三\n四五六', 1000)
  assert(multi.length === 2 && multi[0] === '一二三' && multi[1] === '四五六', '支持显式 \\n')
  const empty = wrapText(ctx, '', 100)
  assert(empty.length === 1 && empty[0] === '', '空串返回 1 个空行')
}

console.log('— projectRoute —')
{
  const box = { x: 0, y: 0, width: 100, height: 100 }
  const sameCity = [
    { id: 'a', lng: 121.4, lat: 31.2 },
    { id: 'b', lng: 121.5, lat: 31.3 },
    { id: 'c', lng: 121.6, lat: 31.25 },
    { id: 'd', lng: 121.45, lat: 31.35 },
    { id: 'e', lng: 121.55, lat: 31.15 },
  ]
  const proj1 = projectRoute(sameCity, box)
  assert(proj1.reliable === true, '同城 reliable=true')
  const pts1 = proj1.segments.flatMap((s) => s.points)
  assert(pts1.length === 5, '同城 5 点全部投影')
  assert(pts1.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100), '点落在 box 内')
  const c = pts1.find((p) => p.stopId === 'c')! // 最东
  const d = pts1.find((p) => p.stopId === 'd')! // 最北
  const e = pts1.find((p) => p.stopId === 'e')! // 最南
  assert(c.x === Math.max(...pts1.map((p) => p.x)), '最东点 x 最大')
  assert(d.y === Math.min(...pts1.map((p) => p.y)), '最北点 y 最小')
  assert(e.y === Math.max(...pts1.map((p) => p.y)), '最南点 y 最大')

  const cross = [
    { id: 's1', lng: 121.4, lat: 31.2 },
    { id: 's2', lng: 121.5, lat: 31.3 },
    { id: 'h1', lng: 120.1, lat: 30.2 },
    { id: 'h2', lng: 120.2, lat: 30.3 },
  ]
  const proj2 = projectRoute(cross, box)
  assert(proj2.reliable === true, '跨城 reliable=true')
  assert(proj2.segments.length === 2, '跨城分 2 段')
  assert(
    proj2.segments[0].points.length === 2 && proj2.segments[1].points.length === 2,
    '每段各 2 点',
  )

  const nulls = [
    { id: 'x', lng: null, lat: null },
    { id: 'y', lng: null, lat: null },
    { id: 'z', lng: null, lat: null },
  ]
  const proj3 = projectRoute(nulls, box)
  assert(proj3.reliable === false, '全 null reliable=false')
  assert(proj3.segments[0].points.length === 3, '降级仍保留全部点')

  const proj4 = projectRoute([{ id: 'o', lng: 121, lat: 31 }], box)
  assert(proj4.reliable === false, '单点降级 reliable=false')
}

if (failures > 0) {
  console.error(`\n${failures} 项断言失败`)
  process.exit(1)
}
console.log('\n所有攻略图渲染断言通过')
