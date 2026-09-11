/**
 * 推箱子 canvas 渲染（照 tetrisRender.ts 家法）：纯 2D API、无 uni/wx 依赖、整幅重绘。
 * 程序化绘制全部棋子（墙/格底/落叶点/木箱/归位金箱/小人），皮肤色板照 Pen 原型
 * （docs/sokoban-redesign/）：奶油底 + 棕木框 + 金色行动色，无外部图片资产。
 */

import type { SokobanState } from './sokoban'

export interface SokobanLayout {
  cell: number
  boardW: number
  boardH: number
}

const C = {
  board: '#F7EEDF',
  checker: '#F1E4CE',
  wall: '#B4855C',
  wallEdge: '#96683F',
  target: '#C08A1E',
  box: '#D9A05B',
  boxLine: '#B37F42',
  gold: '#F4B942',
  goldDeep: '#C08A1E',
  red: '#E85D4A',
  ink: '#4A3F35',
}

/** 整数格布局：cell 取可用空间的适配值，小关卡不放大过 52、不小于 16。 */
export function computeSokobanLayout(availW: number, availH: number, w: number, h: number): SokobanLayout {
  const cell = Math.max(16, Math.min(52, Math.floor(Math.min(availW / w, availH / h))))
  return { cell, boardW: cell * w, boardH: cell * h }
}

/** MP 2d ctx 的 roundRect 不可靠，手画圆角矩形路径（tetrisRender 同款）。 */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

export function drawSokobanFrame(ctx: CanvasRenderingContext2D, layout: SokobanLayout, state: SokobanState): void {
  const { level } = state
  const { cell, boardW, boardH } = layout
  // 整幅 clearRect：透明区残留会把上一帧叠成马赛克（tetrisRender 的教训）
  ctx.clearRect(0, 0, boardW, boardH)

  // 棋盘底板
  roundRectPath(ctx, 0, 0, boardW, boardH, cell * 0.3)
  ctx.fillStyle = C.board
  ctx.fill()

  ctx.save()
  roundRectPath(ctx, 0, 0, boardW, boardH, cell * 0.3)
  ctx.clip()

  // 地板棋盘格（只画洪泛可达地板,棋盘外保持透明）
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const idx = y * level.w + x
      if (!level.floor[idx] || level.walls[idx]) continue
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = C.checker
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }

  // 墙：木框色块 + 底缘深色线（留 1px 缝,像拼木框）
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      if (!level.walls[y * level.w + x]) continue
      const px = x * cell
      const py = y * cell
      ctx.fillStyle = C.wall
      ctx.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1)
      ctx.fillStyle = C.wallEdge
      ctx.fillRect(px + 0.5, py + cell - 3.5, cell - 1, 3)
    }
  }

  // 落叶点：半透明金圆片 + 实心芯（照原型 Sok/落叶点：20×20 圈 #C08A1E4D + 4×4 芯）
  for (let i = 0; i < level.targets.length; i++) {
    if (!level.targets[i]) continue
    const cx = (i % level.w + 0.5) * cell
    const cy = (((i / level.w) | 0) + 0.5) * cell
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = C.target
    ctx.beginPath()
    ctx.arc(cx, cy, cell * 0.3125, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = C.target
    ctx.beginPath()
    ctx.arc(cx, cy, cell * 0.0625, 0, Math.PI * 2)
    ctx.fill()
  }

  // 木箱 / 归位金箱
  for (const b of state.boxes) {
    const placed = level.targets[b]
    const px = (b % level.w) * cell
    const py = ((b / level.w) | 0) * cell
    const inset = cell * 0.1
    roundRectPath(ctx, px + inset, py + inset, cell - inset * 2, cell - inset * 2, cell * 0.14)
    ctx.fillStyle = placed ? C.gold : C.box
    ctx.fill()
    // 顶部高光条（原型 Sok/木箱：24×5 #FFFFFF2E）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    roundRectPath(ctx, px + inset + cell * 0.03, py + inset + cell * 0.03, cell - (inset + cell * 0.03) * 2, cell * 0.16, cell * 0.08)
    ctx.fill()
    ctx.lineWidth = Math.max(1.5, cell * 0.05)
    ctx.strokeStyle = placed ? C.goldDeep : C.boxLine
    ctx.stroke()
    if (placed) {
      // 对勾
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = Math.max(2, cell * 0.08)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px + cell * 0.32, py + cell * 0.52)
      ctx.lineTo(px + cell * 0.45, py + cell * 0.65)
      ctx.lineTo(px + cell * 0.7, py + cell * 0.35)
      ctx.stroke()
    } else {
      // 木板纹：两条横线
      ctx.strokeStyle = C.boxLine
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px + inset + 2, py + cell * 0.4)
      ctx.lineTo(px + cell - inset - 2, py + cell * 0.4)
      ctx.moveTo(px + inset + 2, py + cell * 0.62)
      ctx.lineTo(px + cell - inset - 2, py + cell * 0.62)
      ctx.stroke()
    }
  }

  // 小人（照原型 Sok/小人 逐坐标）：26/32 暖白圆身 #FFFDF8 无描边,眼 2.6/32 @±(5,4),叶帽 11/32 #E85D4A 转35°
  {
    const px = (state.player % level.w) * cell
    const py = ((state.player / level.w) | 0) * cell
    const u = cell / 32
    const cx = px + cell / 2
    const cy = py + cell / 2
    ctx.fillStyle = '#FFFDF8'
    ctx.beginPath()
    ctx.arc(cx, cy, 13 * u, 0, Math.PI * 2)
    ctx.fill()
    // 双眼（原型 @11,12 与 @18.5,12,即中心左侧 5/2.5、上方 4）——各自独立 path,避免 arc 连线
    ctx.fillStyle = C.ink
    for (const ex of [-5, 2.5]) {
      ctx.beginPath()
      ctx.arc(cx + ex * u, cy - 4 * u, 1.3 * u, 0, Math.PI * 2)
      ctx.fill()
    }
    // 枫叶帽：原型 lucide leaf（24 视框）@11,-2 转 35°——SVG 路径逐段手转成贝塞尔
    //（左弧段用等效二次曲线近似,其余照抄;微信 canvas 的 Path2D 不可靠,不用）
    ctx.save()
    // 原型绕图标左上角(11,-2)转35°后的叶形视觉中心 = (18.66,-0.65)/32,即头顶右上、微出框顶
    ctx.translate(cx + 2.66 * u, cy - 16.65 * u)
    ctx.rotate(-35 * Math.PI / 180)
    ctx.strokeStyle = C.red
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const hat = 11 * u
    ctx.scale(hat / 24, hat / 24)
    ctx.translate(-11.5, -11.5) // 24 视框内叶形视觉中心(bbox 中心)对到原点
    ctx.lineWidth = 2.2
    // 叶身轮廓
    ctx.beginPath()
    ctx.moveTo(11, 20)
    ctx.quadraticCurveTo(4, 13.5, 9.8, 6.1)
    ctx.bezierCurveTo(15.5, 5, 17, 4.48, 19, 2)
    ctx.bezierCurveTo(20, 4, 21, 6.18, 21, 10)
    ctx.bezierCurveTo(21, 15.5, 16.22, 20, 11, 20)
    ctx.closePath()
    ctx.stroke()
    // 叶脉/叶柄（lucide 第二笔）
    ctx.beginPath()
    ctx.moveTo(2, 21)
    ctx.bezierCurveTo(2, 18, 3.85, 15.64, 7.08, 15)
    ctx.bezierCurveTo(9.5, 14.52, 12, 13, 13, 12)
    ctx.stroke()
    ctx.restore()
  }

  // 提示圈（金）+ 方向箭头 / 卡住圈（红）
  const marker = state.hint
    ? { cell: state.hint.box, dir: state.hint.dir, color: C.gold, fill: '#F4B94233' }
    : state.stuckBox !== null
      ? { cell: state.stuckBox, dir: null, color: C.red, fill: '#E85D4A33' }
      : null
  if (marker) {
    const px = (marker.cell % level.w) * cell
    const py = ((marker.cell / level.w) | 0) * cell
    roundRectPath(ctx, px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.16)
    ctx.fillStyle = marker.fill
    ctx.fill()
    ctx.strokeStyle = marker.color
    ctx.lineWidth = 2
    ctx.stroke()
    if (marker.dir !== null) {
      // 箭头：贴箱缘指向推方向
      const deltas: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      const [dx, dy] = deltas[marker.dir]
      const ax = px + cell / 2 + dx * cell * 0.52
      const ay = py + cell / 2 + dy * cell * 0.52
      const size = cell * 0.16
      ctx.fillStyle = marker.color
      ctx.beginPath()
      ctx.moveTo(ax + dx * size, ay + dy * size)
      ctx.lineTo(ax - dy * size * 0.8 - dx * size * 0.3, ay - dx * size * 0.8 - dy * size * 0.3)
      ctx.lineTo(ax + dy * size * 0.8 - dx * size * 0.3, ay + dx * size * 0.8 - dy * size * 0.3)
      ctx.closePath()
      ctx.fill()
    }
  }

  ctx.restore()
}
