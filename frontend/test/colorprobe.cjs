/* 源图颜色探针：解码 PNG，按 4bit 量化分桶，打印主要颜色 + 色相归属
 * 用法: node test/colorprobe.cjs <图片> [topN]
 */
const fs = require('fs')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
const path = require('path')

const input = process.argv[2]
const topN = Number(process.argv[3]) || 25
if (!input) {
  console.error('用法: node test/colorprobe.cjs <图片> [topN]')
  process.exit(1)
}

// 先标准化成 8bit PNG
const normalized = path.join(__dirname, 'out', '.probe-input.png')
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true })
execFileSync('sips', ['-s', 'format', 'png', input, '--out', normalized], { stdio: 'pipe' })

function decodePng(buf) {
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []
  let palette = null
  let trns = null
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = []
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
      let val = line[i]
      if (filter === 1) val += a
      else if (filter === 2) val += b
      else if (filter === 3) val += (a + b) >> 1
      else if (filter === 4) {
        const c = i >= channels ? prev[i - channels] : 0
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
      const o = x * channels
      if (colorType === 6) out.push(cur[o], cur[o + 1], cur[o + 2], cur[o + 3])
      else if (colorType === 2) out.push(cur[o], cur[o + 1], cur[o + 2], 255)
      else if (colorType === 3) out.push(palette[cur[x] * 3], palette[cur[x] * 3 + 1], palette[cur[x] * 3 + 2], trns && cur[x] < trns.length ? trns[cur[x]] : 255)
      else if (colorType === 0) out.push(cur[x], cur[x], cur[x], 255)
      else if (colorType === 4) out.push(cur[o], cur[o], cur[o], cur[o + 1])
    }
  }
  return { data: out, width, height }
}

function hueFamily(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma < 18) return max > 200 ? '白' : max < 60 ? '黑' : '灰'
  if (r >= g + 12 && r >= b + 12) return '红/粉/橙'
  if (g >= r + 12 && g >= b + 12) return '绿'
  if (b >= r + 12 && b >= g + 12) return '蓝'
  if (r >= b + 20 && g >= b + 20) return '黄'
  return '过渡'
}

const { data, width, height } = decodePng(fs.readFileSync(normalized))
const buckets = new Map()
let opaque = 0
for (let i = 0; i < data.length; i += 4) {
  const a = data[i + 3]
  if (a < 128) continue
  opaque++
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  const key = `${r >> 4},${g >> 4},${b >> 4}`
  const entry = buckets.get(key) ?? { n: 0, sr: 0, sg: 0, sb: 0 }
  entry.n++
  entry.sr += r
  entry.sg += g
  entry.sb += b
  buckets.set(key, entry)
}

console.log(`${width}×${height}, 不透明像素 ${opaque}`)

// 专门统计绿/黄绿像素（无论多少）
let greenCount = 0
const greenSamples = new Map()
for (let i = 0; i < data.length; i += 4) {
  const a = data[i + 3]
  if (a < 128) continue
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  if (g >= r + 8 && g >= b - 5 && (g - Math.max(r, b)) > 8) {
    greenCount++
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    const e = greenSamples.get(key) ?? { n: 0, sr: 0, sg: 0, sb: 0 }
    e.n++; e.sr += r; e.sg += g; e.sb += b
    greenSamples.set(key, e)
  }
}
console.log(`\n=== 绿/黄绿像素：${greenCount} 个 (${((greenCount / opaque) * 100).toFixed(2)}%) ===`)
if (greenCount > 0) {
  const gs = [...greenSamples.values()].sort((a, b) => b.n - a.n).slice(0, 15)
  for (const e of gs) {
    const r = Math.round(e.sr / e.n)
    const g = Math.round(e.sg / e.n)
    const b = Math.round(e.sb / e.n)
    const rgb = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    console.log(`  ${String(e.n).padStart(5)} 个  ${rgb} (${r},${g},${b})`)
  }
}

const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, topN)
console.log(`\n=== top${topN} 颜色桶 ===`)
console.log('占比    平均RGB      色相')
for (const e of sorted) {
  const r = Math.round(e.sr / e.n)
  const g = Math.round(e.sg / e.n)
  const b = Math.round(e.sb / e.n)
  const pct = ((e.n / opaque) * 100).toFixed(1).padStart(5)
  const rgb = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  console.log(`${pct}%  ${rgb} (${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)})  ${hueFamily(r, g, b)}`)
}
