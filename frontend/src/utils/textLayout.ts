/**
 * canvas 文字自动换行（平台无关纯函数，可单测）。
 * 中文无空格，故按字符逐个累加，超过 maxWidth 折行；支持显式 \n。
 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  // 先按显式换行拆段，每段再按宽度折行
  const paragraphs = text.split('\n')
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (const ch of paragraph) {
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        lines.push(line)
        line = ch
      } else {
        line = test
      }
    }
    if (line !== '') lines.push(line)
  }
  return lines
}
