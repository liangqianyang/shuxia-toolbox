import { computed, ref } from 'vue'
import type { PatternResult } from '@/types/beads'
import { displayCode } from '@/utils/format'

/**
 * 拼制进度：物理拼 2000+ 颗豆时按色施工，记录「哪些色已拼完」。
 * 按图纸签名（色板+尺寸+用色）持久化到 storage——换图/改参数生成新图纸即换一份进度，
 * 同一张图纸下次打开自动恢复，接着拼。进度以「色号集合」存，与色板下标解耦。
 */
const STORAGE_PREFIX = 'shuxia:beads:progress:'

/** 图纸签名：同一张图纸稳定、不同图纸相异。用色号排序拼串，避免下标漂移。 */
function signatureOf(result: PatternResult): string {
  const codes = result.used
    .map((u) => u.color.code)
    .sort()
    .join(',')
  return `${result.params.paletteKey}:${result.width}x${result.height}:${codes}`
}

export function useBuildProgress() {
  /** 拼制模式开关 */
  const active = ref(false)
  /** 当前签名下已拼完的色号集合 */
  const doneCodes = ref<Set<string>>(new Set())
  /** 当前聚焦施工的色板下标（null = 未聚焦） */
  const focusIndex = ref<number | null>(null)
  let currentSig = ''

  function storageKey(sig: string): string {
    return `${STORAGE_PREFIX}${sig}`
  }

  function loadFor(result: PatternResult): void {
    currentSig = signatureOf(result)
    try {
      const raw = uni.getStorageSync(storageKey(currentSig))
      const arr = raw ? (JSON.parse(raw) as unknown) : []
      doneCodes.value = new Set(
        Array.isArray(arr) ? arr.filter((c): c is string => typeof c === 'string') : [],
      )
    } catch {
      doneCodes.value = new Set()
    }
  }

  function persist(): void {
    if (!currentSig) return
    try {
      uni.setStorageSync(storageKey(currentSig), JSON.stringify([...doneCodes.value]))
    } catch {
      /* 存储满则忽略 */
    }
  }

  /** 进入拼制模式：载入该图纸进度，聚焦第一个未完成色 */
  function enter(result: PatternResult): void {
    loadFor(result)
    active.value = true
    focusIndex.value = firstUnfinished(result)
  }

  function exit(): void {
    active.value = false
    focusIndex.value = null
  }

  function isDone(code: string): boolean {
    return doneCodes.value.has(code)
  }

  /** 第一个未拼完色的色板下标（全部完成返回 null） */
  function firstUnfinished(result: PatternResult): number | null {
    for (const u of result.used) {
      if (!doneCodes.value.has(u.color.code)) return u.paletteIndex
    }
    return null
  }

  /** 聚焦某色施工 */
  function focus(paletteIndex: number): void {
    focusIndex.value = paletteIndex
  }

  /** 标记当前聚焦色为「已拼完」，跳到下一个未完成色 */
  function completeFocused(result: PatternResult): void {
    const idx = focusIndex.value
    if (idx === null) return
    const item = result.used.find((u) => u.paletteIndex === idx)
    if (!item) return
    const next = new Set(doneCodes.value)
    next.add(item.color.code)
    doneCodes.value = next
    persist()
    focusIndex.value = firstUnfinished(result)
  }

  /** 取消某色的完成标记（点已完成色重新施工） */
  function toggleDone(result: PatternResult, paletteIndex: number): void {
    const item = result.used.find((u) => u.paletteIndex === paletteIndex)
    if (!item) return
    const next = new Set(doneCodes.value)
    if (next.has(item.color.code)) next.delete(item.color.code)
    else next.add(item.color.code)
    doneCodes.value = next
    persist()
  }

  const doneCount = computed(() => doneCodes.value.size)

  /** 已拼完的豆数（用于进度条），随 result 与 doneCodes 计算 */
  function doneBeads(result: PatternResult): number {
    let sum = 0
    for (const u of result.used) {
      if (doneCodes.value.has(u.color.code)) sum += u.count
    }
    return sum
  }

  /** 当前聚焦色的展示文案 */
  function focusText(result: PatternResult): string {
    if (focusIndex.value === null) return '全部拼完啦 🎉'
    const item = result.used.find((u) => u.paletteIndex === focusIndex.value)
    if (!item) return ''
    return `${displayCode(item.color.code)} · ${item.count} 颗`
  }

  return {
    active,
    doneCodes,
    doneCount,
    focusIndex,
    enter,
    exit,
    isDone,
    focus,
    completeFocused,
    toggleDone,
    firstUnfinished,
    doneBeads,
    focusText,
  }
}
