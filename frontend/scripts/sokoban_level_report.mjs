// 推箱子关卡验关报告：解析 + 求解 + 难度指标 + 门槛建议值（作者ing 工具,不改任何数据）。
// 运行：cd frontend && npx esbuild scripts/sokoban_level_report.mjs --bundle --platform=node --format=cjs --outfile=/tmp/sok-report.cjs --log-level=error && node /tmp/sok-report.cjs
import { parseLevel } from '../src/utils/sokoban.ts'
import { solve } from '../src/utils/sokobanSolver.ts'
import { LEVELS } from '../src/utils/sokobanLevels.ts'

let bad = 0
const rows = []
for (const def of LEVELS) {
  try {
    const level = parseLevel(def)
    const r = solve(level, level.boxesStart, level.playerStart, { mode: 'optimal', budgetMs: 10000 })
    if (r.status !== 'solved') {
      bad++
      rows.push(`  ${def.id}: ${r.status} nodes=${r.nodes}  ✗`)
    } else {
      const t3 = Math.ceil(r.moves * 1.25)
      const t2 = Math.ceil(r.moves * 1.5)
      rows.push(`  ${def.id}: par=${String(r.moves).padStart(3)} nodes=${String(r.nodes).padStart(5)}  [${t3}, ${t2}]`)
    }
  } catch (e) {
    bad++
    rows.push(`  ${def.id}: PARSE ${String(e).replace(/^Error: /, '')}  ✗`)
  }
}
console.log(rows.join('\n'))
console.log(bad === 0 ? `\n全部 ${LEVELS.length} 关可解 ✓` : `\n${bad} 关需要修复 ✗`)
