import { computed, ref } from 'vue'
import type { PaletteKey } from '@/types/beads'
import { getPalette } from '@/utils/beadPalette'

/**
 * 用户「我有哪些豆」的库存。按色号（code）持久化——色号在各 MARD 色板间稳定
 * （mard-221 是 mard-291 子集），比色板下标可靠（下标会随色板变动）。
 * 消费方 generatePattern 需要的是「允许的下标集合」，按当前 paletteKey 现算。
 */
const STORAGE_PREFIX = 'shuxia:beads:inventory:'

/** 单例：全局共享同一份库存状态，页面与参数面板对同一 ref 读写 */
const ownedCodes = ref<Set<string>>(new Set())
let loadedKey: PaletteKey | null = null

function storageKey(key: PaletteKey): string {
  return `${STORAGE_PREFIX}${key}`
}

function load(key: PaletteKey): void {
  try {
    const raw = uni.getStorageSync(storageKey(key))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    ownedCodes.value = new Set(Array.isArray(arr) ? arr.filter((c): c is string => typeof c === 'string') : [])
  } catch {
    ownedCodes.value = new Set()
  }
  loadedKey = key
}

function persist(key: PaletteKey): void {
  try {
    uni.setStorageSync(storageKey(key), JSON.stringify([...ownedCodes.value]))
  } catch {
    /* 存储满则忽略 */
  }
}

export function useBeadInventory() {
  /** 切换到某色板：首次或换板时从 storage 载入 */
  function ensureLoaded(key: PaletteKey): void {
    if (loadedKey !== key) load(key)
  }

  function has(code: string): boolean {
    return ownedCodes.value.has(code)
  }

  function toggle(key: PaletteKey, code: string): void {
    ensureLoaded(key)
    const next = new Set(ownedCodes.value)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    ownedCodes.value = next
    persist(key)
  }

  function selectAll(key: PaletteKey): void {
    ownedCodes.value = new Set(getPalette(key).colors.map((c) => c.code))
    persist(key)
  }

  function clear(key: PaletteKey): void {
    ownedCodes.value = new Set()
    persist(key)
  }

  const ownedCount = computed(() => ownedCodes.value.size)

  /** 按当前色板把「拥有的色号」映射成「允许的下标集合」，供 generatePattern 约束 */
  function allowedIndices(key: PaletteKey): Set<number> {
    ensureLoaded(key)
    const set = new Set<number>()
    const colors = getPalette(key).colors
    for (let i = 0; i < colors.length; i++) {
      if (ownedCodes.value.has(colors[i].code)) set.add(i)
    }
    return set
  }

  return { ownedCodes, ownedCount, ensureLoaded, has, toggle, selectAll, clear, allowedIndices }
}
