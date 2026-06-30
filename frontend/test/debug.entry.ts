/* 本地调试入口：node 直跑完整管线
 * 用法（经 debug.cjs 包装）：输入 PNG → 解码 → generatePattern → 输出 BMP 预览 + 终端统计
 * 仅依赖 node 内置 zlib/fs，无需 Canvas
 */
import * as fs from 'fs'
import * as zlib from 'zlib'
import { generatePattern } from '@/composables/useBeadPattern'
import { getPalette } from '@/utils/beadPalette'
import { displayCode } from '@/utils/format'
import { EMPTY_CELL, DEFAULT_PARAMS, type BoardPresetKey, type PaletteKey } from '@/types/beads'
import { __setPixels, type PixelBuffer } from './stubCanvasAdapter'

function decodePng(buf: Buffer): PixelBuffer {
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat: Buffer[] = []
  let palette: Buffer | null = null
  let trns: Buffer | null = null
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') {
      palette = Buffer.from(data)
    } else if (type === 'tRNS') {
      trns = Buffer.from(data)
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`暂不支持的 PNG：bitDepth=${bitDepth} interlace=${interlace}（先用 sips 转一次）`)
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8ClampedArray(width * height * 4)
  const prev = new Uint8Array(stride)
  let rp = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]
    const line = raw.subarray(rp, rp + stride)
    rp += stride
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let val = line[i]
      if (filter === 1) val += a
      else if (filter === 2) val += b
      else if (filter === 3) val += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        val += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = val & 0xff
    }
    prev.set(cur)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (colorType === 2) {
        out[o] = cur[x * 3]
        out[o + 1] = cur[x * 3 + 1]
        out[o + 2] = cur[x * 3 + 2]
        out[o + 3] = 255
      } else if (colorType === 6) {
        out[o] = cur[x * 4]
        out[o + 1] = cur[x * 4 + 1]
        out[o + 2] = cur[x * 4 + 2]
        out[o + 3] = cur[x * 4 + 3]
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = cur[x]
        out[o + 3] = 255
      } else if (colorType === 4) {
        out[o] = out[o + 1] = out[o + 2] = cur[x * 2]
        out[o + 3] = cur[x * 2 + 1]
      } else if (colorType === 3) {
        const idx = cur[x]
        out[o] = palette![idx * 3]
        out[o + 1] = palette![idx * 3 + 1]
        out[o + 2] = palette![idx * 3 + 2]
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255
      }
    }
  }
  return { data: out, width, height }
}

function writeBmp(path: string, w: number, h: number, rgb: Uint8Array): void {
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const dataSize = rowSize * h
  const buf = Buffer.alloc(54 + dataSize)
  buf.write('BM', 0)
  buf.writeUInt32LE(54 + dataSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(dataSize, 34)
  for (let y = 0; y < h; y++) {
    let off = 54 + (h - 1 - y) * rowSize
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      buf[off++] = rgb[i + 2]
      buf[off++] = rgb[i + 1]
      buf[off++] = rgb[i]
    }
  }
  fs.writeFileSync(path, buf)
}

async function main() {
  const [, , input, output, sizeArg, removeBgArg, paletteArg] = process.argv
  const grid = Number(sizeArg)
  const longMatch = /^long(\d+)$/.exec(sizeArg)
  const removeBackground = removeBgArg !== '0'
  const paletteKey = (paletteArg as PaletteKey) || DEFAULT_PARAMS.paletteKey
  const params = longMatch
    ? {
        ...DEFAULT_PARAMS,
        boardPresetKey: 'auto' as const,
        autoGridSize: false,
        gridLongSide: Number(longMatch[1]),
        removeBackground,
        paletteKey,
      }
    : Number.isFinite(grid) && grid > 0
      ? {
          ...DEFAULT_PARAMS,
          boardPresetKey: 'custom' as const,
          gridWidth: grid,
          gridHeight: grid,
          removeBackground,
          paletteKey,
        }
      : {
          ...DEFAULT_PARAMS,
          boardPresetKey: ((sizeArg || DEFAULT_PARAMS.boardPresetKey) as BoardPresetKey),
          removeBackground,
          paletteKey,
        }

  __setPixels(decodePng(fs.readFileSync(input)))
  const result = await generatePattern('debug', params)

  const palette = getPalette(paletteKey)
  console.log(
    `${result.width}×${result.height} ${result.boardPlan.label} removeBg=${removeBackground} → ${result.totalBeads} 颗 / ${result.used.length} 色`,
  )
  for (const u of result.used) {
    console.log(`  ${displayCode(u.color.code).padEnd(5)} ${u.color.hex}  ×${u.count}`)
  }

  // 每格放大 cellPx 像素输出 BMP，空格画棋盘
  const cellPx = Math.max(4, Math.floor(640 / Math.max(result.width, result.height)))
  const w = result.width * cellPx
  const h = result.height * cellPx
  const rgb = new Uint8Array(w * h * 3)
  for (let gy = 0; gy < result.height; gy++) {
    for (let gx = 0; gx < result.width; gx++) {
      const idx = result.cells[gy * result.width + gx]
      for (let dy = 0; dy < cellPx; dy++) {
        for (let dx = 0; dx < cellPx; dx++) {
          const o = ((gy * cellPx + dy) * w + gx * cellPx + dx) * 3
          if (idx === EMPTY_CELL) {
            const v = ((dx < cellPx / 2) === (dy < cellPx / 2)) ? 244 : 230
            rgb[o] = rgb[o + 1] = rgb[o + 2] = v
          } else {
            const c = palette.colors[idx].rgb
            const border = dx === 0 || dy === 0
            rgb[o] = border ? c[0] * 0.85 : c[0]
            rgb[o + 1] = border ? c[1] * 0.85 : c[1]
            rgb[o + 2] = border ? c[2] * 0.85 : c[2]
          }
        }
      }
    }
  }
  writeBmp(output, w, h, rgb)
  console.log(`预览已写出：${output}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
