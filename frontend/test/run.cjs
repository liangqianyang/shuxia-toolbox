// 用 esbuild 打包测试入口（@ 别名指向 src，canvasAdapter 替换为测试桩）后交给 node 执行
const { build } = require('esbuild')
const path = require('path')
const { execFileSync } = require('child_process')

const root = __dirname
const src = path.join(root, '..', 'src')
const outfile = path.join(root, '.algo.test.cjs')

build({
  entryPoints: [path.join(root, 'algo.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  plugins: [
    {
      name: 'alias',
      setup(build) {
        build.onResolve({ filter: /^@\/utils\/canvasAdapter$/ }, () => ({
          path: path.join(root, 'stubCanvasAdapter.ts'),
        }))
        build.onResolve({ filter: /^@\// }, (args) => ({
          path: path.join(src, args.path.slice(2)) + '.ts',
        }))
      },
    },
  ],
}).then(() => {
  execFileSync('node', [outfile], { stdio: 'inherit' })
})
