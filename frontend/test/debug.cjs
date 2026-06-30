/* 真实图片调试器：对任意图片文件跑完整算法管线，输出可视化预览 PNG
 * 用法: node test/debug.cjs <图片路径> [auto|small-1|small-2|large-1|small-4|grid] [removeBg 0/1] [paletteKey]
 * 输出: test/out/<名字>-<size>.png
 */
const { build } = require('esbuild')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const root = __dirname
const src = path.join(root, '..', 'src')
const outDir = path.join(root, 'out')
fs.mkdirSync(outDir, { recursive: true })

const [, , input, size = 'small-1', removeBg = '1', paletteKey = 'mard-221'] = process.argv
if (!input) {
  console.error('用法: node test/debug.cjs <图片路径> [auto|small-1|small-2|large-1|small-4|grid] [removeBg 0/1] [paletteKey]')
  process.exit(1)
}

// 任意格式先经 sips 标准化为 8-bit PNG（jpg/heic/webp 等都能进）
const normalized = path.join(outDir, '.input.png')
execFileSync('sips', ['-s', 'format', 'png', input, '--out', normalized], { stdio: 'pipe' })

const base = path.basename(input).replace(/\.[^.]+$/, '')
const bmpOut = path.join(outDir, `.${base}.bmp`)
const pngOut = path.join(outDir, `${base}-${size}${removeBg === '0' ? '-nobg' : ''}.png`)
const bundle = path.join(outDir, '.debug.cjs')

build({
  entryPoints: [path.join(root, 'debug.entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  plugins: [
    {
      name: 'alias',
      setup(b) {
        b.onResolve({ filter: /^@\/utils\/canvasAdapter$/ }, () => ({
          path: path.join(root, 'stubCanvasAdapter.ts'),
        }))
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: path.join(src, args.path.slice(2)) + '.ts',
        }))
      },
    },
  ],
}).then(() => {
  execFileSync('node', [bundle, normalized, bmpOut, size, removeBg, paletteKey], {
    stdio: 'inherit',
  })
  execFileSync('sips', ['-s', 'format', 'png', bmpOut, '--out', pngOut], { stdio: 'pipe' })
  fs.rmSync(bmpOut, { force: true })
  console.log(`PNG 预览：${pngOut}`)
})
