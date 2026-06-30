/** 数据层补零色号转展示色号：'F04'→'F4'，'H21'→'H21'，'ZG05'→'ZG5' */
export function displayCode(code: string): string {
  const match = /^([A-Z]+)0*(\d+)$/.exec(code)
  if (!match) {
    return code
  }
  return `${match[1]}${Number(match[2])}`
}
