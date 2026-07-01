/* 算法与布局验证（Node 运行，无 Canvas 依赖）：
 * 1. 像素图：颜色无损通过、透明区为空格、统计一致
 * 2. 带噪照片模拟：去毛点收敛（无 ≤2 格孤立色块）、背景被清除
 * 3. 确定性：同图同参两次输出逐格一致
 * 4. 75×75 大图布局：不超 4000px、cellPx 足够印色号
 */
import { generatePattern, updatePatternCell, recolorColor, eraseColor, useBeadPattern } from '@/composables/useBeadPattern'
import { computeSheetLayout } from '@/utils/sheetRenderer'
import { getPalette } from '@/utils/beadPalette'
import { deltaE2000 } from '@/utils/color'
import { EMPTY_CELL, DEFAULT_PARAMS, type PatternResult } from '@/types/beads'
import { __setPixels, type PixelBuffer } from './stubCanvasAdapter'

let failures = 0
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}`)
  }
}

function makeBuffer(size: number): PixelBuffer {
  return { data: new Uint8ClampedArray(size * size * 4), width: size, height: size }
}

function setPx(buf: PixelBuffer, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const i = (y * buf.width + x) * 4
  buf.data[i] = r
  buf.data[i + 1] = g
  buf.data[i + 2] = b
  buf.data[i + 3] = a
}

function darkUsedCount(result: PatternResult): number {
  return result.used
    .filter((u) => {
      const [r, g, b] = u.color.rgb
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 95
    })
    .reduce((sum, u) => sum + u.count, 0)
}

function usedCodes(result: PatternResult): string[] {
  return result.used.map((u) => u.color.code).sort()
}

function fakeBoardPlan(width: number, height: number): PatternResult['boardPlan'] {
  const boardSize: 52 | 104 = width <= 52 && height <= 52 ? 52 : 104
  const cols = Math.ceil(width / boardSize)
  const rows = Math.ceil(height / boardSize)
  return {
    presetKey: 'custom',
    boardSize,
    cols,
    rows,
    total: cols * rows,
    capacityWidth: cols * boardSize,
    capacityHeight: rows * boardSize,
    label: `${cols * rows} 张 ${boardSize} 板`,
  }
}

/** 仍存在的 ≤2 格小色块里，有多少是"低对比噪点"（与邻域多数色 ΔE2000 ≤ 25，本应被去毛点清掉）。
 * 高对比小特征（眼/高光/字迹，ΔE2000>25）是有意保留的，不算噪点——与算法 DESPECKLE_PRESERVE_DE 一致。 */
function lowContrastSpeckCount(result: PatternResult): number {
  const { width: w, height: h, cells } = result
  const palette = getPalette(result.params.paletteKey)
  const seen = new Uint8Array(w * h)
  let specks = 0
  for (let start = 0; start < w * h; start++) {
    if (cells[start] === EMPTY_CELL || seen[start]) continue
    const color = cells[start]
    const member: number[] = []
    const stack = [start]
    seen[start] = 1
    const histogram = new Map<number, number>()
    let colored = 0
    while (stack.length) {
      const cell = stack.pop()!
      member.push(cell)
      const x = cell % w
      const y = (cell / w) | 0
      for (const next of [x > 0 ? cell - 1 : -1, x < w - 1 ? cell + 1 : -1, y > 0 ? cell - w : -1, y < h - 1 ? cell + w : -1]) {
        if (next < 0) continue
        if (cells[next] === color) {
          if (!seen[next]) {
            seen[next] = 1
            stack.push(next)
          }
        } else if (cells[next] !== EMPTY_CELL) {
          colored++
          histogram.set(cells[next], (histogram.get(cells[next]) ?? 0) + 1)
        }
      }
    }
    if (member.length > 2 || colored === 0) continue
    let majorColor = -1
    let majorN = 0
    for (const [c, n] of histogram) if (n > majorN) { majorN = n; majorColor = c }
    if (deltaE2000(palette.colors[color].lab, palette.colors[majorColor].lab) <= 25) specks++
  }
  return specks
}

// mulberry32，与算法内一致的确定性噪声源
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function testPixelArt() {
  console.log('用例 1：透明底像素图（4 色方块）')
  const buf = makeBuffer(64)
  // 四个 16×16 色块按 2×2 摆在中间，外圈透明
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ MARD F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })

  assert(result.used.length === 4, `恰好 4 种颜色（实际 ${result.used.length}）`)
  const sum = result.used.reduce((acc, u) => acc + u.count, 0)
  assert(sum === result.totalBeads, `图例求和 = 总豆数（${sum} = ${result.totalBeads}）`)
  assert(result.totalBeads === 16 * 16, `非空格数正确（${result.totalBeads} = 256）`)
  let emptyOk = true
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const isCenter = x >= 8 && x < 24 && y >= 8 && y < 24
      const isEmpty = result.cells[y * 32 + x] === EMPTY_CELL
      if (isCenter === isEmpty) emptyOk = false
    }
  }
  assert(emptyOk, '透明区/实心区边界精确')
  const codes = result.used.map((u) => u.color.code).sort()
  assert(
    JSON.stringify(codes) === JSON.stringify(['A26', 'F04', 'H02', 'H07']),
    `匹配到预期色号 ${codes.join(',')}`,
  )
}

async function testNoisyPhoto() {
  console.log('用例 2：带噪照片模拟（纯色背景 + 两个噪声色块）')
  const size = 290
  const buf = makeBuffer(size)
  const noise = rng(42)
  const jitter = (v: number) => Math.max(0, Math.min(255, v + (noise() * 30 - 15)))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 背景：浅蓝
      let r = 205
      let g = 232
      let b = 255
      const dx = x - size / 2
      const dy = y - size / 2
      if (dx * dx + dy * dy < 90 * 90) {
        // 大红圆
        r = 252
        g = 40
        b = 60
      }
      if (x > 40 && x < 110 && y > 40 && y < 110) {
        // 黄色方块
        r = 255
        g = 200
        b = 48
      }
      setPx(buf, x, y, jitter(r), jitter(g), jitter(b))
    }
  }
  __setPixels(buf)
  const params = {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom' as const,
    gridWidth: 58,
    gridHeight: 58,
    removeBackground: true,
  }
  const result = await generatePattern('test', params)

  assert(lowContrastSpeckCount(result) === 0, '无低对比噪点毛点（高对比小特征允许保留）')
  // 背景被清除：四角应为空
  const corners = [0, 57, 57 * 58, 58 * 58 - 1]
  assert(corners.every((c) => result.cells[c] === EMPTY_CELL), '边缘背景被清除为空格')
  // 红圆中心应是红色系（F 组）
  const center = result.cells[29 * 58 + 29]
  const centerCode = center === EMPTY_CELL ? 'EMPTY' : result.used.find((u) => u.paletteIndex === center)!.color.code
  assert(/^F/.test(centerCode), `圆心匹配到红色系（${centerCode}）`)

  const again = await generatePattern('test', params)
  assert(
    Buffer.from(result.cells.buffer).equals(Buffer.from(again.cells.buffer)),
    '同图同参两次输出逐格一致（确定性）',
  )
}

async function testLineArtSticker() {
  console.log('用例 3：白底表情包细线保留')
  const size = 96
  const buf = makeBuffer(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }

  const cx = 48
  const cy = 43
  const radius = 28
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (Math.abs(dist - radius) <= 1.7) {
        setPx(buf, x, y, 78, 44, 38)
      }
      if ((x - 38) ** 2 + (y - 43) ** 2 <= 2.2 ** 2 || (x - 58) ** 2 + (y - 43) ** 2 <= 2.2 ** 2) {
        setPx(buf, x, y, 78, 44, 38)
      }
      if (x >= 46 && x <= 50 && y >= 48 && y <= 57) {
        setPx(buf, x, y, 78, 44, 38)
      }
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 38,
    gridHeight: 38,
    removeBackground: true,
  })
  const corners = [0, 37, 37 * 38, 38 * 38 - 1]
  assert(corners.every((c) => result.cells[c] === EMPTY_CELL), '白底边缘背景被清空')
  assert(darkUsedCount(result) >= 20, `深色轮廓/五官保留（${darkUsedCount(result)} 格）`)
  assert(result.used.some((u) => u.color.code === 'H02'), '白色主体保留')
}

async function testLightTransitionCleanup() {
  console.log('用例 4：低对比源坍缩为主色')
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }
  for (let y = 28; y < 36; y++) {
    for (let x = 28; x < 36; x++) {
      setPx(buf, x, y, 232, 228, 228)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  assert(result.used.length <= 2, `低对比源颜色数很少（实际 ${result.used.length} 色）`)
  assert(result.used[0]?.color.code === 'H02', `主色为白色 H02（实际 ${result.used[0]?.color.code ?? '无'}）`)
}

async function testOutlineUnification() {
  console.log('用例 5：多色合成图（直接映射不变量）')
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 254, 255, 255)
    }
  }

  const colors: [number, number, number][] = [
    [90, 33, 33],
    [120, 82, 75],
  ]
  for (let cell = 8; cell <= 23; cell++) {
    const [r, g, b] = colors[cell % 2]
    for (const [cx, cy] of [[cell, 8], [cell, 23], [8, cell], [23, cell]]) {
      const isIntentionalGap = cx === 16 && cy === 8
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (isIntentionalGap) {
            setPx(buf, cx * 2 + dx, cy * 2 + dy, 254, 255, 255)
          } else {
            setPx(buf, cx * 2 + dx, cy * 2 + dy, r, g, b)
          }
        }
      }
    }
  }
  for (let cell = 9; cell <= 22; cell++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setPx(buf, cell * 2 + dx, 9 * 2 + dy, 138, 163, 134)
      }
    }
  }
  for (let y = 20; y <= 22; y++) {
    for (let x = 14; x <= 17; x++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          setPx(buf, x * 2 + dx, y * 2 + dy, 199, 115, 98)
        }
      }
    }
  }
  for (let x = 14; x <= 17; x++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setPx(buf, x * 2 + dx, 24 * 2 + dy, 199, 115, 98)
      }
    }
  }
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const isRedHalf = dx === 1
      setPx(buf, 18 * 2 + dx, 24 * 2 + dy, isRedHalf ? 199 : 90, isRedHalf ? 115 : 33, isRedHalf ? 98 : 33)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  // 干净管线不变量：不去背景时无空格、无毛点、局部独立色（红色）经直接映射保留
  assert(result.width === 32 && result.height === 32, `尺寸 32×32（实际 ${result.width}×${result.height}）`)
  assert(result.totalBeads === 32 * 32, `不去背景时无空格（实际 ${result.totalBeads}）`)
  assert(lowContrastSpeckCount(result) === 0, '无低对比噪点毛点（高对比小特征允许保留）')
  assert(usedCodes(result).includes('M14'), `局部红色块保留（实际 ${usedCodes(result).join(',')}）`)
}

async function testFeatureSpeckPreserved() {
  console.log('用例 10：高对比小特征（眼睛级）保留，不被去毛点抹掉')
  // 64px → 32 格（每格 2px）。整张铺肤色，正中放 2×2px 深色块 → 恰好 1 个深色格，
  // 四周全是肤色，是典型 1 格高对比"眼珠"。旧的无差别去毛点会把它并入肤色而消失。
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPx(buf, x, y, 255, 210, 170) // 肤色
    }
  }
  for (let y = 32; y <= 33; y++) {
    for (let x = 32; x <= 33; x++) {
      setPx(buf, x, y, 56, 38, 36) // 眼珠深色
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  assert(darkUsedCount(result) > 0, '深色眼珠被保留（未被并入肤色）')
  const center = result.cells[16 * 32 + 16]
  assert(center !== EMPTY_CELL, '中心眼珠格非空')
}

async function testEdgeAntiAliasing() {
  console.log('用例 11：描边边缘清晰（crisp、无毛刺、无过渡杂色）')
  // 左黑右白、边界落在格内正中（px 32 黑 / px 33 白 → 第 16 列格 50/50）。
  // 新逻辑：50/50 边界格深色占够份量 → crisp 取深色（描边细而贴曲线），不平均成中灰杂色；
  // 边界外侧第一格深色占比为 0 → 不强制变深，不渗黑、无毛刺。
  const buf = makeBuffer(64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (x < 33) setPx(buf, x, y, 0, 0, 0)
      else setPx(buf, x, y, 255, 255, 255)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })
  const lumaOf = (x: number, y: number): number => {
    const idx = result.cells[y * 32 + x]
    if (idx === EMPTY_CELL) return -1
    const [r, g, b] = getPalette(result.params.paletteKey).colors[idx].rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const darkLuma = lumaOf(0, 16) // 纯黑区
  const lightLuma = lumaOf(31, 16) // 纯白区
  const edgeLuma = lumaOf(16, 16) // 50/50 边界格
  const outsideLuma = lumaOf(17, 16) // 边界外侧第一格
  assert(
    edgeLuma <= darkLuma + 25,
    `50/50 边界格 crisp 取深色、不平均成中灰杂色（纯黑 ${darkLuma.toFixed(0)} · 边界 ${edgeLuma.toFixed(0)}）`,
  )
  assert(
    outsideLuma > lightLuma - 30,
    `边界外侧不渗黑、无毛刺（外侧 ${outsideLuma.toFixed(0)} ≈ 纯白 ${lightLuma.toFixed(0)}）`,
  )
}

async function testBulkRecolorErase() {
  console.log('用例 12：批量改色 / 批量擦除（隔离高亮后的操作）')
  const buf = makeBuffer(64)
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const result = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'custom',
    gridWidth: 32,
    gridHeight: 32,
    removeBackground: false,
  })

  const countOf = (res: PatternResult, code: string) =>
    res.used.find((u) => u.color.code === code)?.count ?? 0
  const idxOf = (res: PatternResult, code: string) =>
    res.used.find((u) => u.color.code === code)?.paletteIndex ?? -1

  const beforeF04 = countOf(result, 'F04')
  const beforeA26 = countOf(result, 'A26')
  const beforeTotal = result.totalBeads

  // 批量改色：F04 → A26
  const recolored = recolorColor(result, idxOf(result, 'F04'), idxOf(result, 'A26'))
  assert(countOf(recolored, 'F04') === 0, '改色后原色 F04 清零')
  assert(
    countOf(recolored, 'A26') === beforeA26 + beforeF04,
    `改色后目标色 A26 = 原 A26 + 原 F04（${countOf(recolored, 'A26')} = ${beforeA26}+${beforeF04}）`,
  )
  assert(recolored.totalBeads === beforeTotal, '改色不改变总豆数')

  // 批量擦除：H07 → 空
  const beforeH07 = countOf(recolored, 'H07')
  const erased = eraseColor(recolored, idxOf(recolored, 'H07'))
  assert(countOf(erased, 'H07') === 0, '擦除后 H07 清零')
  assert(
    erased.totalBeads === beforeTotal - beforeH07,
    `擦除后总豆数减少（${erased.totalBeads} = ${beforeTotal}-${beforeH07}）`,
  )
  assert(erased.cells.some((c) => c === EMPTY_CELL), '擦除产生了空格')
}

async function testUndo() {
  console.log('用例 13：撤销编辑（批量改色 / 批量擦除各算一步）')
  const buf = makeBuffer(64)
  const colors: [number, number, number][] = [
    [252, 40, 60], // ≈ F04
    [255, 200, 48], // ≈ A26
    [0, 0, 0], // H07
    [254, 255, 255], // H02
  ]
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const block = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const [r, g, b] = colors[block]
      setPx(buf, x, y, r, g, b)
    }
  }
  __setPixels(buf)
  const { params, generate, recolor, eraseAll, undo, canUndo, result } = useBeadPattern()
  params.boardPresetKey = 'custom'
  params.gridWidth = 32
  params.gridHeight = 32
  params.removeBackground = false
  await generate('test')

  const countOf = (code: string) => result.value!.used.find((u) => u.color.code === code)?.count ?? 0
  const idxOf = (code: string) =>
    result.value!.used.find((u) => u.color.code === code)?.paletteIndex ?? -1

  assert(canUndo.value === false, '初始无历史，不可撤销')

  // 批量改色 F04 → A26，再撤销
  recolor(idxOf('F04'), idxOf('A26'))
  assert(canUndo.value === true, '改色后可撤销')
  assert(countOf('F04') === 0, '改色后 F04 清零')
  assert(undo() !== null, '撤销返回结果')
  assert(countOf('F04') === 64, `撤销恢复 F04（${countOf('F04')} = 64）`)
  assert(countOf('A26') === 64, `撤销恢复 A26（${countOf('A26')} = 64）`)
  assert(canUndo.value === false, '撤销唯一一步后不可再撤销')

  // 批量擦除 H07，再撤销
  eraseAll(idxOf('H07'))
  assert(countOf('H07') === 0, '擦除后 H07 清零')
  undo()
  assert(countOf('H07') === 64, `撤销恢复 H07（${countOf('H07')} = 64）`)
}

async function testBoardSizing() {
  console.log('用例 6：真实拼板规格与等比缩放')
  const buf = { data: new Uint8ClampedArray(148 * 160 * 4), width: 148, height: 160 }
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 148; x++) {
      setPx(buf, x, y, 252, 40, 60)
    }
  }

  __setPixels(buf)
  const small = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'small-1', removeBackground: false })
  assert(small.width === 48 && small.height === 52, `1 张 52 小板等比生成 48×52（实际 ${small.width}×${small.height}）`)
  assert(small.boardPlan.boardSize === 52 && small.boardPlan.total === 1, '小板方案 = 1 张 52 板')

  __setPixels(buf)
  const twoSmall = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'small-2', removeBackground: false })
  assert(twoSmall.width === 52 && twoSmall.height === 56, `2 张 52 小板等比生成 52×56（实际 ${twoSmall.width}×${twoSmall.height}）`)
  assert(twoSmall.boardPlan.cols === 1 && twoSmall.boardPlan.rows === 2, '2 张 52 板按竖图自动纵向拼接')

  __setPixels(buf)
  const large = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'large-1', removeBackground: false })
  assert(large.width === 96 && large.height === 104, `1 张 104 大板等比生成 96×104（实际 ${large.width}×${large.height}）`)
  assert(large.boardPlan.boardSize === 104 && large.boardPlan.total === 1, '大板方案 = 1 张 104 板')

  __setPixels(buf)
  const simpleAuto = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: false })
  assert(
    simpleAuto.width === 36 && simpleAuto.height === 39,
    `auto 把纯色 148×160 自适应降到 36×39（实际 ${simpleAuto.width}×${simpleAuto.height}）`,
  )
  assert(
    simpleAuto.boardPlan.boardSize === 52 && simpleAuto.boardPlan.total === 1,
    `36×39 用 1 张 52 板（实际 ${simpleAuto.boardPlan.label}）`,
  )

  __setPixels(buf)
  const manual = await generatePattern('test', {
    ...DEFAULT_PARAMS,
    boardPresetKey: 'auto',
    autoGridSize: false,
    gridLongSide: 60,
    removeBackground: false,
  })
  assert(
    Math.max(manual.width, manual.height) === 60,
    `关掉自动、手动定格长边 60（实际 ${manual.width}×${manual.height}）`,
  )
}

async function testAutoBoardRecommendation() {
  console.log('用例 7：auto 模式自动定格数')
  const size = 128
  const buf = makeBuffer(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPx(buf, x, y, 255, 255, 255)
    }
  }

  for (let y = 16; y < 112; y += 8) {
    for (let x = 16; x < 112; x++) {
      setPx(buf, x, y, 80, 44, 40)
    }
  }
  for (let x = 16; x < 112; x += 8) {
    for (let y = 16; y < 112; y++) {
      setPx(buf, x, y, 80, 44, 40)
    }
  }

  __setPixels(buf)
  const result = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: true })
  const smallLong = Math.max(result.width, result.height)
  // 密集网格图边缘密度极高 → auto 顶到上限 64（线密图需要更多格才能分辨细线）
  assert(
    result.width === result.height && smallLong === 64,
    `auto 把 128×128 网格图自适应顶到上限 64×64（实际 ${result.width}×${result.height}）`,
  )
  assert(result.boardPlan.boardSize === 104, `64 格用 104 板（实际 ${result.boardPlan.label}）`)

  console.log('用例 7.1：细节图 auto 生成')
  const detailed = { data: new Uint8ClampedArray(148 * 160 * 4), width: 148, height: 160 }
  for (let y = 0; y < detailed.height; y++) {
    for (let x = 0; x < detailed.width; x++) {
      setPx(detailed, x, y, 255, 255, 255)
    }
  }

  for (let y = 0; y < detailed.height; y++) {
    for (let x = 0; x < detailed.width; x++) {
      const head = ((x - 70) / 46) ** 2 + ((y - 61) / 43) ** 2
      if (head > 0.9 && head < 1.08) setPx(detailed, x, y, 82, 42, 39)
      if ((x - 48) ** 2 + (y - 62) ** 2 < 5 ** 2 || (x - 75) ** 2 + (y - 64) ** 2 < 5 ** 2) {
        setPx(detailed, x, y, 82, 42, 39)
      }
      if (x >= 62 && x <= 67 && y >= 69 && y <= 84) setPx(detailed, x, y, 82, 42, 39)
      const leftWheel = ((x - 57) / 13) ** 2 + ((y - 125) / 20) ** 2
      const rightWheel = ((x - 104) / 11) ** 2 + ((y - 123) / 18) ** 2
      if ((leftWheel > 0.72 && leftWheel < 1.1) || (rightWheel > 0.72 && rightWheel < 1.1)) {
        setPx(detailed, x, y, 72, 70, 78)
      }
      if (x >= 52 && x <= 98 && y >= 103 && y <= 110) setPx(detailed, x, y, 253, 124, 114)
      if (x >= 72 && x <= 86 && y >= 116 && y <= 121) setPx(detailed, x, y, 199, 115, 98)
      if ((x - 116) ** 2 + (y - 43) ** 2 < 16 ** 2 || (x - 129) ** 2 + (y - 43) ** 2 < 16 ** 2) {
        setPx(detailed, x, y, 253, 124, 114)
      }
      if (x > 107 && x < 138 && y > 42 && y < 70 && y - 42 > Math.abs(x - 122) * 0.8) {
        setPx(detailed, x, y, 253, 124, 114)
      }
      const balloonLine = Math.abs(x - (113 + (y - 70) * 0.1)) < 1.4 && y >= 58 && y <= 124
      if (balloonLine) setPx(detailed, x, y, 82, 42, 39)
    }
  }

  __setPixels(detailed)
  const detailedResult = await generatePattern('test', { ...DEFAULT_PARAMS, boardPresetKey: 'auto', removeBackground: true })
  const detailedLong = Math.max(detailedResult.width, detailedResult.height)
  // 线密细节图（骑车熊猫）边缘密度高 → auto 顶到 ~56-64，比旧 52 上限多出的格用来分辨三轮车等细件
  assert(
    detailedLong >= 56 && detailedLong <= 64,
    `auto 把 148×160 细节图自适应顶到 56-64（实际 ${detailedResult.width}×${detailedResult.height}）`,
  )
  assert(detailedResult.boardPlan.boardSize === 104, `细节图用 104 板（实际 ${detailedResult.boardPlan.label}）`)
  assert(detailedResult.totalBeads < 22000, `细节图豆数合理（实际 ${detailedResult.totalBeads} 颗）`)
}

async function testLayout() {
  console.log('用例 8：布局约束')
  const fakeUsed = Array.from({ length: 32 }, (_, i) => ({
    paletteIndex: i,
    color: { code: 'A01', name: '', hex: '#FFFFFF', rgb: [255, 255, 255] as const, lab: { l: 0, a: 0, b: 0 } },
    count: 1,
  }))
  const big: PatternResult = {
    width: 75,
    height: 75,
    cells: new Int16Array(75 * 75),
    used: fakeUsed,
    totalBeads: 75 * 75,
    boardPlan: fakeBoardPlan(75, 75),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 75, gridHeight: 75 },
  }
  const layout = computeSheetLayout(big, 4000)
  assert(layout.totalW <= 4000 && layout.totalH <= 4000, `75×75 整图 ≤4000px（${layout.totalW}×${layout.totalH}）`)
  assert(layout.cellPx >= 24, `cellPx 足够印色号（${layout.cellPx}px）`)
  assert(layout.showCodes, '75×75 仍显示格内色号')
  assert(layout.legendCols * layout.legendRows >= 32, '图例容纳全部 32 色')

  const small: PatternResult = {
    ...big,
    width: 29,
    height: 29,
    boardPlan: fakeBoardPlan(29, 29),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 29, gridHeight: 29 },
  }
  const layoutSmall = computeSheetLayout(small, 4000)
  assert(layoutSmall.cellPx === 50, `小图 cellPx 顶满 50（${layoutSmall.cellPx}px）`)
}

async function testManualCellEdit() {
  console.log('用例 9：人工改单格同步统计')
  const result: PatternResult = {
    width: 2,
    height: 1,
    cells: new Int16Array([EMPTY_CELL, EMPTY_CELL]),
    used: [],
    totalBeads: 0,
    boardPlan: fakeBoardPlan(2, 1),
    params: { ...DEFAULT_PARAMS, boardPresetKey: 'custom', gridWidth: 2, gridHeight: 1 },
  }

  const filled = updatePatternCell(result, 0, 0, 0)
  assert(filled.cells[0] === 0, '改单格写入目标色')
  assert(filled.totalBeads === 1, `改单格后总豆数更新（${filled.totalBeads}）`)
  assert(filled.used.length === 1 && filled.used[0].count === 1, '改单格后图例统计更新')

  const emptied = updatePatternCell(filled, 0, 0, EMPTY_CELL)
  assert(emptied.cells[0] === EMPTY_CELL, '单格可改为空格')
  assert(emptied.totalBeads === 0 && emptied.used.length === 0, '改为空格后统计清零')
}

async function main() {
  await testPixelArt()
  await testNoisyPhoto()
  await testLineArtSticker()
  await testLightTransitionCleanup()
  await testOutlineUnification()
  await testFeatureSpeckPreserved()
  await testEdgeAntiAliasing()
  await testBulkRecolorErase()
  await testUndo()
  await testBoardSizing()
  await testAutoBoardRecommendation()
  await testLayout()
  await testManualCellEdit()
  if (failures > 0) {
    console.error(`\n${failures} 项断言失败`)
    process.exit(1)
  }
  console.log('\n全部通过')
}

main()
