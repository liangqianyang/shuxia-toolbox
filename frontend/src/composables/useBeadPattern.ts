import { reactive, ref, shallowRef } from 'vue'
import type { BoardPlan, BoardPresetKey, PatternParams, PatternResult, UsedColor } from '@/types/beads'
import { BOARD_PRESETS, DEFAULT_PARAMS, EMPTY_CELL } from '@/types/beads'
import { getPalette, nearestBeadIndex } from '@/utils/beadPalette'
import { deltaE2000, rgbToLab } from '@/utils/color'
import { loadImagePixels, type PixelBuffer } from '@/utils/canvasAdapter'

interface GridSample {
  /** 长度 w*h*3，alpha 加权面积平均 RGB */
  rgb: Float32Array
  /** 长度 w*h，1 = 空格 */
  empty: Uint8Array
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fullImageCrop(buf: PixelBuffer): CropRect {
  return {
    x: 0,
    y: 0,
    width: buf.width,
    height: buf.height,
  }
}

function rectFromBounds(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  paddingRatio: number,
): CropRect | null {
  const bw = x1 - x0
  const bh = y1 - y0
  if (bw <= 0 || bh <= 0) return null

  const padding = Math.round(Math.max(bw, bh) * paddingRatio)
  const px0 = clamp(x0 - padding, 0, buf.width)
  const py0 = clamp(y0 - padding, 0, buf.height)
  const px1 = clamp(x1 + padding, 0, buf.width)
  const py1 = clamp(y1 + padding, 0, buf.height)
  const width = px1 - px0
  const height = py1 - py0
  if (width <= 0 || height <= 0) return null

  return {
    x: px0,
    y: py0,
    width,
    height,
  }
}

function detectOpaqueCrop(buf: PixelBuffer, alphaThreshold: number): CropRect | null {
  let x0 = buf.width
  let y0 = buf.height
  let x1 = 0
  let y1 = 0
  const { data, width, height } = buf

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < alphaThreshold) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + 1)
      y1 = Math.max(y1, y + 1)
    }
  }

  const crop = rectFromBounds(buf, x0, y0, x1, y1, 0.05)
  if (!crop) return null

  const imageArea = buf.width * buf.height
  return crop.width * crop.height < imageArea * 0.92 ? crop : null
}

function detectSamplingCrop(buf: PixelBuffer, alphaThreshold: number): CropRect {
  return detectOpaqueCrop(buf, alphaThreshold) ?? fullImageCrop(buf)
}

function detectEdgeBackground(buf: PixelBuffer, alphaThreshold: number): {
  r: number
  g: number
  b: number
  toleranceSq: number
} | null {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number; samples: number[] }>()
  const { data, width, height } = buf
  const addPixel = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < alphaThreshold) return
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, samples: [] }
    bucket.r += data[i]
    bucket.g += data[i + 1]
    bucket.b += data[i + 2]
    bucket.n++
    bucket.samples.push(i)
    buckets.set(key, bucket)
  }

  for (let x = 0; x < width; x++) {
    addPixel(x, 0)
    addPixel(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    addPixel(0, y)
    addPixel(width - 1, y)
  }

  let bgBucket: { r: number; g: number; b: number; n: number; samples: number[] } | null = null
  for (const bucket of buckets.values()) {
    if (!bgBucket || bucket.n > bgBucket.n) bgBucket = bucket
  }
  if (!bgBucket || bgBucket.n < Math.max(8, (width + height) * 0.2)) return null

  const bg = {
    r: bgBucket.r / bgBucket.n,
    g: bgBucket.g / bgBucket.n,
    b: bgBucket.b / bgBucket.n,
  }

  let devSum = 0
  let devSqSum = 0
  for (const i of bgBucket.samples) {
    const dr = data[i] - bg.r
    const dg = data[i + 1] - bg.g
    const db = data[i + 2] - bg.b
    const dev = Math.sqrt(dr * dr + dg * dg + db * db)
    devSum += dev
    devSqSum += dev * dev
  }
  const mean = devSum / bgBucket.n
  const std = Math.sqrt(Math.max(0, devSqSum / bgBucket.n - mean * mean))
  const tolerance = Math.min(46, Math.max(18, mean + 3 * std + 8))
  const toleranceSq = tolerance * tolerance

  // 候选背景色必须从边缘向内延伸足够深度才算真背景；仅贴边的细描边/窄边框不算，
  // 否则会把"主体铺满画布、轮廓贴边"的贴纸的轮廓误当背景删掉。
  // 在每条边的"中间 60%"位置垂直向内扫（避开角落——角落处描边环与边平行，会误判成很深）。
  const minDim = Math.min(width, height)
  const depthNeed = Math.max(6, Math.round(minDim * 0.04))
  const matchBg = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4
    if (data[i + 3] < alphaThreshold) return true
    const dr = data[i] - bg.r
    const dg = data[i + 1] - bg.g
    const db = data[i + 2] - bg.b
    return dr * dr + dg * dg + db * db <= toleranceSq
  }
  let maxDepth = 0
  const samples = 8
  const xLow = Math.round(width * 0.2)
  const xHigh = Math.round(width * 0.8)
  const yLow = Math.round(height * 0.2)
  const yHigh = Math.round(height * 0.8)
  for (let s = 0; s < samples; s++) {
    const x = Math.round(xLow + ((xHigh - xLow) * s) / Math.max(1, samples - 1))
    let d = 0
    for (let y = 0; y < height && matchBg(x, y); y++) d++
    if (d > maxDepth) maxDepth = d
    d = 0
    for (let y = height - 1; y >= 0 && matchBg(x, y); y--) d++
    if (d > maxDepth) maxDepth = d
  }
  for (let s = 0; s < samples; s++) {
    const y = Math.round(yLow + ((yHigh - yLow) * s) / Math.max(1, samples - 1))
    let d = 0
    for (let x = 0; x < width && matchBg(x, y); x++) d++
    if (d > maxDepth) maxDepth = d
    d = 0
    for (let x = width - 1; x >= 0 && matchBg(x, y); x--) d++
    if (d > maxDepth) maxDepth = d
  }
  if (maxDepth < depthNeed) return null

  return { ...bg, toleranceSq }
}

/**
 * 先在原始像素层清掉边缘连通背景，再降采样。
 * 对白底表情包尤其重要：如果先缩成 38×38，细线边缘会被白底平均稀释。
 */
function removeSourceBackgroundFlood(buf: PixelBuffer, alphaThreshold: number): PixelBuffer {
  const bg = detectEdgeBackground(buf, alphaThreshold)
  if (!bg) return buf

  const { width, height } = buf
  const total = width * height
  const data = buf.data
  const visited = new Uint8Array(total)
  const flooded: number[] = []
  let opaqueCount = 0

  // 近中性背景（白/灰）常带噪点/压缩渐变：除精确色容差外，把"近中性且亮度接近背景"
  // 的像素也算背景，这样能把白底+浅灰噪点一并清掉。彩色主体（肤色/粉红等）彩度高，不会被误清。
  const bgChroma = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b)
  const bgNeutral = bgChroma < 18
  const bgLuma = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b
  const isBg = (cell: number): boolean => {
    const i = cell * 4
    const a = data[i + 3]
    if (a < alphaThreshold) return true
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const dr = r - bg.r
    const dg = g - bg.g
    const db = b - bg.b
    if (dr * dr + dg * dg + db * db <= bg.toleranceSq) return true
    if (bgNeutral) {
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      if (chroma < 18) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (Math.abs(luma - bgLuma) <= 60) return true
      }
    }
    return false
  }

  for (let cell = 0; cell < total; cell++) {
    if (data[cell * 4 + 3] >= alphaThreshold) opaqueCount++
  }

  const queue: number[] = []
  const pushIfBg = (cell: number) => {
    if (visited[cell] || !isBg(cell)) return
    visited[cell] = 1
    queue.push(cell)
  }

  for (let x = 0; x < width; x++) {
    pushIfBg(x)
    pushIfBg((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    pushIfBg(y * width)
    pushIfBg(y * width + width - 1)
  }

  let floodedOpaque = 0
  while (queue.length > 0) {
    const cell = queue.pop()!
    flooded.push(cell)
    if (data[cell * 4 + 3] >= alphaThreshold) floodedOpaque++
    const x = cell % width
    const y = (cell / width) | 0
    const neighbors = [
      x > 0 ? cell - 1 : -1,
      x < width - 1 ? cell + 1 : -1,
      y > 0 ? cell - width : -1,
      y < height - 1 ? cell + width : -1,
    ]
    for (const next of neighbors) {
      if (next >= 0) pushIfBg(next)
    }
  }

  if (opaqueCount === 0 || floodedOpaque < opaqueCount * 0.02 || floodedOpaque > opaqueCount * 0.78) {
    return buf
  }

  const cleaned = new Uint8ClampedArray(data)
  for (const cell of flooded) {
    cleaned[cell * 4 + 3] = 0
  }
  return { data: cleaned, width, height }
}

function getBoardPreset(key: BoardPresetKey) {
  return BOARD_PRESETS.find((preset) => preset.key === key && preset.key !== 'auto') ?? BOARD_PRESETS[1]
}

/** auto 模式长边格数上下限：小图不放大（1 格≈1 源像素），大图按内容复杂度自适应。
 * 上限 64：纯色/简单图边缘密度≈0、颜色少，仍落在 38-45，不受影响；只有"线密多部件"的复杂图
 * （骑车熊猫、车辆等）边缘密度项才会把格数顶到 ~62-64——52 时这类图的细线（三轮车/辐条）不足 1 格宽，
 * 无法分辨且深色会连片发黑，64 才够还原。代价是这类图豆数 ~2k、用 1 张 104 大板。手动滑块仍可到 104。 */
const MIN_LONG_SIDE = 24
const MAX_AUTO_LONG_SIDE = 64
const MAX_MANUAL_LONG_SIDE = 104

/** 去毛点高对比豁免阈值（ΔE2000）：≤2 格小色块若与将替换它的邻域主色差异超过该值，
 * 判定为有意特征（眼睛/高光/字迹）保留，不并入邻域；低于该值才是抗锯齿/压缩噪点，并入。
 * 选在 25：五官（眼黑 vs 肤色 ≈ 40+）远超此值必保，边缘抗锯齿中间色（≈10–22）会被清掉。 */
const DESPECKLE_PRESERVE_DE = 25

/** 由实际格数反推拼板方案：≤52 用小板，否则用 104 大板，不足自动拼多张。 */
function gridToBoardPlan(gridW: number, gridH: number, presetKey: BoardPresetKey): BoardPlan {
  const boardSize = gridW <= 52 && gridH <= 52 ? 52 : 104
  const cols = Math.max(1, Math.ceil(gridW / boardSize))
  const rows = Math.max(1, Math.ceil(gridH / boardSize))
  const total = cols * rows
  return {
    presetKey,
    boardSize,
    cols,
    rows,
    total,
    capacityWidth: cols * boardSize,
    capacityHeight: rows * boardSize,
    label: `${total} 张 ${boardSize} 板`,
  }
}

function planFromPreset(
  presetKey: Exclude<BoardPresetKey, 'auto' | 'custom'>,
  crop: CropRect,
  labelPrefix = '',
  planKey: BoardPresetKey = presetKey,
): BoardPlan {
  const preset = getBoardPreset(presetKey)
  let cols = preset.cols
  let rows = preset.rows
  const aspect = crop.width / Math.max(1, crop.height)
  if (preset.autoOrient && aspect < 1) {
    cols = preset.rows
    rows = preset.cols
  }
  const total = cols * rows
  return {
    presetKey: planKey,
    boardSize: preset.boardSize,
    cols,
    rows,
    total,
    capacityWidth: cols * preset.boardSize,
    capacityHeight: rows * preset.boardSize,
    label: `${labelPrefix}${preset.label}`,
  }
}

/**
 * 估计图像复杂度：纯面积平均降到参考尺寸，输出两个因子——
 *  - colors：**2 位粗量化**后占比 >1% 的主色数（抗锯齿/JPEG 噪点合并回平涂色，不算）。
 *  - edgeDensity：非空格中、与 4 邻居颜色差异显著（RGB²>EDGE_DIST²）的格子占比。
 * 用纯平均（不走 sampleGrid 的细节保留）使定格数稳定不漂移。
 *
 * edgeDensity 刻画"细线条 / 多小部件"的空间复杂度——这是 colors 抓不到的：一只骑三轮车的
 * 卡通熊猫色少（白/黑/粉/红/灰）但描边+车架+气球绳+五官全是边，colors 低、edgeDensity 高。
 * 单靠 colors 会把它压到 ~45 格，恰好低于"小嘴/车轮"能分辨的临界线，五官被降采样平均掉。
 */
function estimateComplexity(
  buf: PixelBuffer,
  crop: CropRect,
  alphaThreshold: number,
): { colors: number; edgeDensity: number } {
  const refLong = 80
  const aspect = crop.width / Math.max(1, crop.height)
  let rw: number
  let rh: number
  if (aspect >= 1) {
    rw = refLong
    rh = Math.max(1, Math.round(refLong / aspect))
  } else {
    rh = refLong
    rw = Math.max(1, Math.round(refLong * aspect))
  }
  const { data, width } = buf
  const { x: ox, y: oy, width: cw, height: ch } = crop
  const counts = new Map<number, number>()
  const cellPacked = new Int32Array(rw * rh).fill(-1) // -1 = 空格
  let total = 0
  for (let gy = 0; gy < rh; gy++) {
    const y0 = Math.floor(oy + (gy * ch) / rh)
    const y1 = Math.max(y0 + 1, Math.floor(oy + ((gy + 1) * ch) / rh))
    for (let gx = 0; gx < rw; gx++) {
      const x0 = Math.floor(ox + (gx * cw) / rw)
      const x1 = Math.max(x0 + 1, Math.floor(ox + ((gx + 1) * cw) / rw))
      let sR = 0
      let sG = 0
      let sB = 0
      let sA = 0
      let px = 0
      for (let y = y0; y < y1; y++) {
        let idx = (y * width + x0) * 4
        for (let x = x0; x < x1; x++, idx += 4) {
          const a = data[idx + 3]
          sR += data[idx] * a
          sG += data[idx + 1] * a
          sB += data[idx + 2] * a
          sA += a
          px++
        }
      }
      if (px === 0 || sA / px < alphaThreshold) continue
      total++
      const r = Math.round(sR / sA)
      const g = Math.round(sG / sA)
      const b = Math.round(sB / sA)
      cellPacked[gy * rw + gx] = (r << 16) | (g << 8) | b
      const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  if (total === 0) return { colors: 0, edgeDensity: 0 }
  let distinct = 0
  for (const v of counts.values()) if (v / total > 0.01) distinct++

  const EDGE_DIST = 42
  const EDGE_DIST_SQ = EDGE_DIST * EDGE_DIST
  let edgeCells = 0
  for (let gy = 0; gy < rh; gy++) {
    for (let gx = 0; gx < rw; gx++) {
      const c = cellPacked[gy * rw + gx]
      if (c < 0) continue
      const cr = (c >> 16) & 255
      const cg = (c >> 8) & 255
      const cb = c & 255
      let isEdge = false
      const nbrs = [
        gx > 0 ? cellPacked[gy * rw + gx - 1] : -1,
        gx < rw - 1 ? cellPacked[gy * rw + gx + 1] : -1,
        gy > 0 ? cellPacked[(gy - 1) * rw + gx] : -1,
        gy < rh - 1 ? cellPacked[(gy + 1) * rw + gx] : -1,
      ]
      for (const n of nbrs) {
        if (n < 0) continue
        const dr = cr - ((n >> 16) & 255)
        const dg = cg - ((n >> 8) & 255)
        const db = cb - (n & 255)
        if (dr * dr + dg * dg + db * db > EDGE_DIST_SQ) {
          isEdge = true
          break
        }
      }
      if (isEdge) edgeCells++
    }
  }
  return { colors: distinct, edgeDensity: edgeCells / total }
}

/**
 * auto 模式按内容复杂度定格数：长边 = clamp(38 + colors×0.6 + edgeDensity×EDGE_WEIGHT, 38, 64)，
 * 且不超过源图像素（小图不放大）。
 * colors 抓"多色"，edgeDensity 抓"细线条/多部件"——色少线密的卡通靠边缘项把格数顶到上限，
 * 避免小五官/细件被降采样平均掉（如骑三轮车的熊猫，52 格三轮车糊成深色块，~62 格才能分辨车架/辐条）；
 * 纯色/渐变图 edgeDensity≈0，格数仍低、豆数不涨。简单图 ~1.5-2 千颗豆，复杂线密图 ~2-2.5 千颗豆。
 */
function resolveAutoGridSize(
  buf: PixelBuffer,
  crop: CropRect,
  alphaThreshold: number,
): { width: number; height: number } {
  const sourceLong = Math.max(crop.width, crop.height)
  const { colors, edgeDensity } = estimateComplexity(buf, crop, alphaThreshold)
  // 边缘项权重：把"线密"图顶到 52 上限；纯色/渐变图 edgeDensity≈0 不受影响
  const EDGE_WEIGHT = 80
  const detailCap = clamp(Math.round(38 + colors * 0.6 + edgeDensity * EDGE_WEIGHT), 38, MAX_AUTO_LONG_SIDE)
  const targetLong = clamp(Math.min(detailCap, sourceLong), MIN_LONG_SIDE, MAX_AUTO_LONG_SIDE)
  const aspect = crop.width / Math.max(1, crop.height)
  let width: number
  let height: number
  if (aspect >= 1) {
    width = targetLong
    height = Math.max(1, Math.round(targetLong / aspect))
  } else {
    height = targetLong
    width = Math.max(1, Math.round(targetLong * aspect))
  }
  return { width, height }
}

/** 统一入口：按板规格模式推导图纸格数与拼板方案。 */
function resolveLayout(
  params: PatternParams,
  buf: PixelBuffer,
  crop: CropRect,
): { width: number; height: number; boardPlan: BoardPlan } {
  if (params.boardPresetKey === 'custom') {
    const width = Math.max(1, Math.round(params.gridWidth))
    const height = Math.max(1, Math.round(params.gridHeight || params.gridWidth))
    return { width, height, boardPlan: gridToBoardPlan(width, height, 'custom') }
  }

  if (params.boardPresetKey === 'auto') {
    let width: number
    let height: number
    if (params.autoGridSize) {
      ;({ width, height } = resolveAutoGridSize(buf, crop, params.alphaThreshold))
    } else {
      const targetLong = clamp(params.gridLongSide, MIN_LONG_SIDE, MAX_MANUAL_LONG_SIDE)
      const aspect = crop.width / Math.max(1, crop.height)
      if (aspect >= 1) {
        width = targetLong
        height = Math.max(1, Math.round(targetLong / aspect))
      } else {
        height = targetLong
        width = Math.max(1, Math.round(targetLong * aspect))
      }
    }
    return { width, height, boardPlan: gridToBoardPlan(width, height, 'auto') }
  }

  // 手动指定板规格：图纸等比铺满该板容量，不受放大倍数影响。
  const boardPlan = planFromPreset(params.boardPresetKey, crop)
  const cropAspect = crop.width / Math.max(1, crop.height)
  const { width, height } = fitAspectToBox(cropAspect, boardPlan.capacityWidth, boardPlan.capacityHeight)
  return { width, height, boardPlan }
}

function fitAspectToBox(cropAspect: number, capacityWidth: number, capacityHeight: number): {
  width: number
  height: number
} {
  const capacityAspect = capacityWidth / capacityHeight
  let width: number
  let height: number
  if (capacityAspect > cropAspect) {
    height = capacityHeight
    width = Math.max(1, Math.round(height * cropAspect))
  } else {
    width = capacityWidth
    height = Math.max(1, Math.round(width / cropAspect))
  }

  return {
    width: Math.min(capacityWidth, width),
    height: Math.min(capacityHeight, height),
  }
}

/**
 * 阶段 1：按主体比例裁切 + 降采样。不依赖 drawImage，跨端一致；alpha 加权，区域内 alpha 占比低于阈值的格子记为空格。
 * 格子取色：某色占格内过半 → 用该主色（众数），边界更锐利不糊（综合：同豆数下更清晰）；
 * 否则用面积平均（渐变/照片不噪点）。
 * 细节保留：穿过格子的细特征会被冲淡——"含深色少数且远暗于格平均"取深色（保轮廓）、
 * "含高饱和少数且饱和度远高于格平均"取彩色（保字迹）。方向性差距判定，避免双色格互相抵消。
 */
function sampleGrid(
  buf: PixelBuffer,
  crop: CropRect,
  gridW: number,
  gridH: number,
  alphaThreshold: number,
): GridSample {
  const { x: offsetX, y: offsetY, width: cropW, height: cropH } = crop

  const rgb = new Float32Array(gridW * gridH * 3)
  const empty = new Uint8Array(gridW * gridH)
  const { data, width } = buf

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor(offsetY + (gy * cropH) / gridH)
    const y1 = Math.max(y0 + 1, Math.floor(offsetY + ((gy + 1) * cropH) / gridH))
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor(offsetX + (gx * cropW) / gridW)
      const x1 = Math.max(x0 + 1, Math.floor(offsetX + ((gx + 1) * cropW) / gridW))

      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumA = 0
      let darkR = 0
      let darkG = 0
      let darkB = 0
      let darkA = 0
      let satR = 0
      let satG = 0
      let satB = 0
      let satA = 0
      let pixels = 0
      const buckets = new Map<number, { r: number; g: number; b: number; a: number }>()
      for (let y = y0; y < y1; y++) {
        let idx = (y * width + x0) * 4
        for (let x = x0; x < x1; x++, idx += 4) {
          const a = data[idx + 3]
          const r = data[idx]
          const g = data[idx + 1]
          const b = data[idx + 2]
          sumR += r * a
          sumG += g * a
          sumB += b * a
          sumA += a
          pixels++
          if (a >= alphaThreshold) {
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if (luma < 90) {
              darkR += r * a
              darkG += g * a
              darkB += b * a
              darkA += a
            } else {
              const mx = Math.max(r, g, b)
              const chroma = mx - Math.min(r, g, b)
              if (mx > 120 && chroma > 100 && chroma / mx > 0.4) {
                satR += r * a
                satG += g * a
                satB += b * a
                satA += a
              }
            }
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
            const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, a: 0 }
            bucket.r += r * a
            bucket.g += g * a
            bucket.b += b * a
            bucket.a += a
            buckets.set(key, bucket)
          }
        }
      }

      const cell = gy * gridW + gx
      if (sumA / pixels < alphaThreshold) {
        empty[cell] = 1
      } else {
        const avgR = sumR / sumA
        const avgG = sumG / sumA
        const avgB = sumB / sumA
        let outR = avgR
        let outG = avgG
        let outB = avgB
        // 主色（众数）打底：某色占格内过半时用主色而非平均，边界更锐利、不糊（同豆数下更清晰）；
        // 没有明显主色（渐变/照片）仍用平均，避免噪点化。
        let domA = 0
        for (const bucket of buckets.values()) {
          if (bucket.a > domA) {
            domA = bucket.a
            outR = bucket.r / bucket.a
            outG = bucket.g / bucket.a
            outB = bucket.b / bucket.a
          }
        }
        if (domA / sumA <= 0.5) {
          outR = avgR
          outG = avgG
          outB = avgB
        }
        const avgLuma = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB
        const avgChroma = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB)
        let fired = false
        // 深色细节（描边）：格内有深色少数且远暗于格平均 → 取深色，避免轮廓被冲淡成中灰。
        // 彩度闸门：格平均本身已明显彩色（avgChroma 高）且深色只占少数时，深色是相邻描边渗进来的
        // 边缘像素而非本格特征（如张嘴里的粉舌头格混进 1 个嘴框深像素）——此时保留彩色，不翻黑，
        // 否则被深框包围的小彩色区会被一圈圈吞成纯黑。低彩度格（真描边，棕/灰）不受影响仍走深色。
        if (darkA > 0) {
          const darkShare = darkA / sumA
          const colorfulCell = avgChroma > 50 && darkShare < 0.5
          if (darkShare >= 0.05 && darkShare <= 0.8 && !colorfulCell) {
            const dr = darkR / darkA
            const dg = darkG / darkA
            const db = darkB / darkA
            if (0.2126 * dr + 0.7152 * dg + 0.0722 * db + 30 < avgLuma) {
              outR = dr
              outG = dg
              outB = db
              fired = true
            }
          }
        }
        // 彩色细节（文字/线条）：格内有高饱和少数且饱和度远高于格平均 → 取彩色，避免字被冲淡。
        if (!fired && satA > 0) {
          const satShare = satA / sumA
          if (satShare >= 0.05 && satShare <= 0.8) {
            const sr = satR / satA
            const sg = satG / satA
            const sb = satB / satA
            if (Math.max(sr, sg, sb) - Math.min(sr, sg, sb) > avgChroma + 50) {
              outR = sr
              outG = sg
              outB = sb
            }
          }
        }
        rgb[cell * 3] = outR
        rgb[cell * 3 + 1] = outG
        rgb[cell * 3 + 2] = outB
      }
    }
  }

  return { rgb, empty }
}

/**
 * 阶段 2：每格映射到最近豆色（CIELAB ΔE2000）。
 * 直接映射在降采样后的格子上做——平涂区同色格子映射同一豆色，
 * 照片的渐变保留自然过渡，比 k-means 预聚类更保真。
 */
function mapCellsDirectToPalette(
  labs: Float64Array,
  empty: Uint8Array,
  cellCount: number,
  palette: ReturnType<typeof getPalette>,
): Int16Array {
  const cells = new Int16Array(cellCount).fill(EMPTY_CELL)
  for (let i = 0; i < cellCount; i++) {
    if (empty[i]) continue
    cells[i] = nearestBeadIndex(
      {
        l: labs[i * 3],
        a: labs[i * 3 + 1],
        b: labs[i * 3 + 2],
      },
      palette,
    )
  }
  return cells
}

function buildPaletteIndexCounts(cells: Int16Array): Map<number, number> {
  const counts = new Map<number, number>()
  for (let i = 0; i < cells.length; i++) {
    const color = cells[i]
    if (color !== EMPTY_CELL) {
      counts.set(color, (counts.get(color) ?? 0) + 1)
    }
  }
  return counts
}

function replacePaletteIndex(cells: Int16Array, from: number, to: number): number {
  let changed = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === from) {
      cells[i] = to
      changed++
    }
  }
  return changed
}

/**
 * 合并视觉上相近的低频色（抗锯齿/压缩产生的中间过渡色）到高频主色，减少杂色。
 * 按用量降序，把占比 <1% 的相近色（ΔE2000 < threshold）并入更常见色；占比更高的结构相近色保留，
 * 避免把脸上的明暗渐变压平、串色发灰。纯感知距离，不做语义特判。
 *
 * threshold=12：描边边缘的抗锯齿过渡色（暗红/灰紫/棕，与主描边色 ΔE 约 6-12）会被吸回主色，
 * 描边连续不斑驳；而独立语义细节（车轮黄绿辐条与所有高频色 ΔE 都 >12）因"只并入相近色"而保留。
 * 提分辨率后边缘格变多、过渡杂色更明显，正是靠这道更宽的合并压回主色（旧阈值 6 漏掉一半）。
 */
function mergeSimilarColorsByFrequency(
  cells: Int16Array,
  palette: ReturnType<typeof getPalette>,
  threshold = 12,
): number {
  const counts = buildPaletteIndexCounts(cells)
  let nonEmpty = 0
  for (const count of counts.values()) nonEmpty += count
  const byFreq = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color)
  const replaced = new Set<number>()
  let changed = 0
  for (let i = 0; i < byFreq.length; i++) {
    const target = byFreq[i]
    if (replaced.has(target)) continue
    const targetLab = palette.colors[target].lab
    for (let j = i + 1; j < byFreq.length; j++) {
      const source = byFreq[j]
      if (replaced.has(source)) continue
      // 仅合并极低频色（占比 <1%）：占比更高的结构相近色保留，保住渐变/明暗层次
      if ((counts.get(source) ?? 0) / nonEmpty >= 0.01) continue
      if (deltaE2000(palette.colors[source].lab, targetLab) < threshold) {
        changed += replacePaletteIndex(cells, source, target)
        replaced.add(source)
      }
    }
  }
  return changed
}

/**
 * 描边归并：把"深色"里视觉近似的碎色（描边被抗锯齿拆成的暗红/灰紫/棕，彼此 ΔE 约 7-14）
 * 按频归并到最高频的那个深色，让描边变成一条连续色而非斑驳五六色。
 *
 * 为什么单独做、且只在深色做：脸上肤色 vs 腮红 ΔE 仅 ~5，比描边碎色之间还近，纯全局阈值会把腮红
 * 一起压平。但描边碎色全是深色(luma<maxLuma)、肤色/腮红全是浅色——按明暗切开就能只动描边不碰脸。
 * 不设占比下限（描边各碎色占比都 >1%，这正是它们逃过 mergeSimilarColorsByFrequency 的原因）。
 * protectLuma：近黑(luma<protectLuma)的源不并走，保住眼珠/瞳孔这类最深的五官不被并成中性深灰。
 */
function consolidateDarkOutline(
  cells: Int16Array,
  palette: ReturnType<typeof getPalette>,
  threshold = 14,
  maxLuma = 100,
  protectLuma = 55,
): number {
  const luma = (idx: number) => {
    const [r, g, b] = palette.colors[idx].rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const counts = buildPaletteIndexCounts(cells)
  const dark = [...counts.keys()].filter((idx) => luma(idx) <= maxLuma)
  dark.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
  const replaced = new Set<number>()
  let changed = 0
  for (let i = 0; i < dark.length; i++) {
    const target = dark[i]
    if (replaced.has(target)) continue
    const targetLab = palette.colors[target].lab
    for (let j = i + 1; j < dark.length; j++) {
      const source = dark[j]
      if (replaced.has(source)) continue
      if (luma(source) < protectLuma) continue // 近黑五官（眼珠）保留
      if (deltaE2000(palette.colors[source].lab, targetLab) < threshold) {
        changed += replacePaletteIndex(cells, source, target)
        replaced.add(source)
      }
    }
  }
  return changed
}

/**
 * 阶段 3：去毛点。4 连通连通域标记，面积 ≤ maxRegion 的色块
 * 整域改写为边界邻居的众数色；返回改动格子数，外层循环至稳定。
 * 高对比豁免：小色块与将替换它的邻域主色 ΔE2000 差异过大（眼/高光/字迹）时保留，
 * 只清掉与邻域相近的抗锯齿/压缩噪点——否则眼睛这类 1–2 格的五官会被并入肤色而消失。
 */
function despeckle(
  cells: Int16Array,
  w: number,
  h: number,
  palette: ReturnType<typeof getPalette>,
  maxRegion = 2,
): number {
  const total = w * h
  const regionId = new Int32Array(total).fill(-1)
  const regions: number[][] = []

  for (let start = 0; start < total; start++) {
    if (cells[start] === EMPTY_CELL || regionId[start] !== -1) continue
    const color = cells[start]
    const member: number[] = []
    const stack = [start]
    regionId[start] = regions.length
    while (stack.length > 0) {
      const cell = stack.pop()!
      member.push(cell)
      const x = cell % w
      const y = (cell / w) | 0
      const neighbors = [
        x > 0 ? cell - 1 : -1,
        x < w - 1 ? cell + 1 : -1,
        y > 0 ? cell - w : -1,
        y < h - 1 ? cell + w : -1,
      ]
      for (const next of neighbors) {
        if (next >= 0 && regionId[next] === -1 && cells[next] === color) {
          regionId[next] = regions.length
          stack.push(next)
        }
      }
    }
    regions.push(member)
  }

  let changedCells = 0
  for (const member of regions) {
    if (member.length > maxRegion) continue
    const regionColor = cells[member[0]]
    // 统计区域边界上非空邻居的颜色直方图
    const histogram = new Map<number, number>()
    for (const cell of member) {
      const x = cell % w
      const y = (cell / w) | 0
      const neighbors = [
        x > 0 ? cell - 1 : -1,
        x < w - 1 ? cell + 1 : -1,
        y > 0 ? cell - w : -1,
        y < h - 1 ? cell + w : -1,
      ]
      for (const next of neighbors) {
        if (next < 0) continue
        const color = cells[next]
        if (color === EMPTY_CELL || color === cells[cell]) continue
        histogram.set(color, (histogram.get(color) ?? 0) + 1)
      }
    }
    let bestColor = -1
    let bestCount = 0
    for (const [color, count] of histogram) {
      if (count > bestCount) {
        bestCount = count
        bestColor = color
      }
    }
    // 四周全空（孤立小装饰点）→ 保留；
    // 与邻域主色高对比（眼/高光/字迹）→ 保留，避免五官被抹平成底色。
    if (bestColor === -1) continue
    if (deltaE2000(palette.colors[regionColor].lab, palette.colors[bestColor].lab) > DESPECKLE_PRESERVE_DE) {
      continue
    }
    for (const cell of member) cells[cell] = bestColor
    changedCells += member.length
  }
  return changedCells
}

/** 阶段 4：用量统计，空格不计，按数量降序 */
function countColors(cells: Int16Array, paletteKey: PatternParams['paletteKey']): {
  used: UsedColor[]
  totalBeads: number
} {
  const palette = getPalette(paletteKey)
  const counts = new Map<number, number>()
  let totalBeads = 0
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]
    if (idx === EMPTY_CELL) continue
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
    totalBeads++
  }
  const used: UsedColor[] = [...counts.entries()]
    .map(([paletteIndex, count]) => ({ paletteIndex, color: palette.colors[paletteIndex], count }))
    .sort((a, b) => b.count - a.count)
  return { used, totalBeads }
}

export function updatePatternCell(
  result: PatternResult,
  x: number,
  y: number,
  paletteIndex: number,
): PatternResult {
  if (x < 0 || x >= result.width || y < 0 || y >= result.height) return result
  const palette = getPalette(result.params.paletteKey)
  const nextValue =
    paletteIndex === EMPTY_CELL || (paletteIndex >= 0 && paletteIndex < palette.colors.length)
      ? paletteIndex
      : EMPTY_CELL
  const cell = y * result.width + x
  if (result.cells[cell] === nextValue) return result

  const cells = new Int16Array(result.cells)
  cells[cell] = nextValue
  const { used, totalBeads } = countColors(cells, result.params.paletteKey)
  return {
    ...result,
    cells,
    used,
    totalBeads,
  }
}

export async function generatePattern(src: string, params: PatternParams): Promise<PatternResult> {
  const loaded = await loadImagePixels(src)
  const buf = params.removeBackground
    ? removeSourceBackgroundFlood(loaded, params.alphaThreshold)
    : loaded
  await yieldToUI()

  const crop = params.removeBackground ? detectSamplingCrop(buf, params.alphaThreshold) : fullImageCrop(buf)
  const { width: w, height: h, boardPlan } = resolveLayout(params, buf, crop)
  const sample = sampleGrid(buf, crop, w, h, params.alphaThreshold)
  await yieldToUI()

  // 每格 LAB 只算一次，去背景/映射共用
  const cellCount = w * h
  const labs = new Float64Array(cellCount * 3)
  for (let i = 0; i < cellCount; i++) {
    if (sample.empty[i]) continue
    const lab = rgbToLab(sample.rgb[i * 3], sample.rgb[i * 3 + 1], sample.rgb[i * 3 + 2])
    labs[i * 3] = lab.l
    labs[i * 3 + 1] = lab.a
    labs[i * 3 + 2] = lab.b
  }

  const palette = getPalette(params.paletteKey)
  const cells = mapCellsDirectToPalette(labs, sample.empty, cellCount, palette)
  // 合并抗锯齿/压缩产生的相近低频色（ΔE2000<12 且占比<1%），减少杂色、描边连续不斑驳；
  // 占比更高的结构相近色保留，保住脸上的明暗/渐变层次、避免串色发灰
  mergeSimilarColorsByFrequency(cells, palette)
  // 描边归并：深色里近似的描边碎色（暗红/灰紫/棕）并入最高频深色，描边变连续一色；
  // 只动深色、保护近黑，浅色肤色/腮红不受影响
  consolidateDarkOutline(cells, palette)

  // 去毛点至稳定：≤3 格孤立小块并入邻域主色，但眼/高光/字迹/辐条等高对比小特征豁免保留
  for (let round = 0; round < 4; round++) {
    if (despeckle(cells, w, h, palette, 3) === 0) break
  }

  const { used, totalBeads } = countColors(cells, params.paletteKey)
  return { width: w, height: h, boardPlan, cells, used, totalBeads, params: { ...params } }
}

export function useBeadPattern() {
  const params = reactive<PatternParams>({ ...DEFAULT_PARAMS })
  const result = shallowRef<PatternResult | null>(null)
  const generating = ref(false)
  const error = ref('')

  async function generate(src: string): Promise<PatternResult | null> {
    generating.value = true
    error.value = ''
    try {
      result.value = await generatePattern(src, params)
      return result.value
    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败，请重试'
      return null
    } finally {
      generating.value = false
    }
  }

  function editCell(x: number, y: number, paletteIndex: number): PatternResult | null {
    if (!result.value) return null
    result.value = updatePatternCell(result.value, x, y, paletteIndex)
    return result.value
  }

  function reset() {
    result.value = null
    error.value = ''
  }

  return { params, result, generating, error, generate, editCell, reset }
}
