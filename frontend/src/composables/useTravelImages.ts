import { nextTick, ref, shallowRef } from 'vue'
import type { Trip } from '@/types/travel'
import { canvasToFile, getCanvasNode, openAuthSetting, saveImageToAlbum, type CanvasNode } from '@/utils/canvasAdapter'
import { GUIDE_CARDS, CARD_W, CARD_H, cardMapUrl, type GuideCard } from '@/utils/guide'
import { preloadMapImage } from '@/utils/stopImage'

/**
 * 多图渲染 + 导出。
 * 每张卡片一个页内 <canvas>（固定 1080×1440），预览即导出（CSS 缩放显示，canvas 本身满分辨率）。
 * MP 限制：真实底图必须加载到即将绘制它的那张 canvas 上，故逐卡片各自预加载再渲染。
 * 平台差异全部收敛在 canvasAdapter，本文件无 #ifdef。
 *
 * 性能优化：
 * - loadingIndex 追踪当前渲染进度（UI 可据此显示「第 N/M 张」）
 * - 单张出错不阻断其他卡片，失败数记录在 renderErrors
 * - 每次渲染前 clearRect 清空 canvas，防止鬼影
 */
export function useTravelImages() {
  const cards = GUIDE_CARDS
  const cssWidth = ref(0)
  const cssHeight = ref(0)
  const rendered = ref(false)
  const saving = ref(false)
  /** 当前正在渲染第几张（0-based），-1=未开始，cards.length=全部完成 */
  const loadingIndex = ref(-1)
  /** 渲染失败的卡片 key 列表（用于 UI 提示）*/
  const renderErrors = ref<string[]>([])
  const nodes = shallowRef<Map<number, CanvasNode>>(new Map())

  function selectorOf(index: number): string {
    return `#guide-canvas-${index}`
  }

  async function nodeOf(index: number, component?: unknown): Promise<CanvasNode> {
    const cached = nodes.value.get(index)
    if (cached) return cached
    const node = await getCanvasNode(selectorOf(index), component)
    nodes.value.set(index, node)
    return node
  }

  /** 计算预览 CSS 尺寸（页面可用宽度，按 3:4 定高） */
  function computeCss(): void {
    const info = uni.getSystemInfoSync()
    const availW = (info.windowWidth || 375) - 32
    cssWidth.value = availW
    cssHeight.value = Math.round((availW * CARD_H) / CARD_W)
  }

  async function renderCard(
    index: number,
    card: GuideCard,
    trip: Trip,
    component: unknown,
    bgUrl: string | null,
  ): Promise<void> {
    const { canvas, ctx } = await nodeOf(index, component)
    canvas.width = CARD_W
    canvas.height = CARD_H
    // 清空画布防止上次内容鬼影
    ctx.clearRect(0, 0, CARD_W, CARD_H)

    const mapImage = await preloadMapImage(canvas, cardMapUrl(trip, card))
    const bgImage = bgUrl ? await preloadMapImage(canvas, bgUrl) : null

    // 预加载景点照片（仅 needsStopPhotos=true 的卡片）
    let stopPhotos: Map<string, CanvasImageSource> | undefined
    if (card.needsStopPhotos) {
      stopPhotos = new Map()
      for (const day of trip.days) {
        for (const stop of day.stops) {
          if (stop.photo) {
            const img = await preloadMapImage(canvas, stop.photo)
            if (img) stopPhotos.set(stop.id, img)
          }
        }
      }
    }

    card.render(ctx, trip, mapImage, bgImage, stopPhotos)
  }

  /**
   * 渲染全部卡片（顺序执行，避免 MP 并发取节点竞争）。
   * 画廊 <canvas> 由 v-if="rendered" 控制：必须先把 rendered 置 true 让节点挂载，
   * 等一个 nextTick 让 DOM 把 canvas 渲染出来，再逐张取节点绘制——否则取不到节点，
   * renderCard 会 reject「找不到 canvas 节点」，点击「生成攻略图」就毫无反应。
   * cardBgs：按卡片下标传「自定义底图临时路径」，未传则用内置主题。
   */
  async function renderAll(trip: Trip, component: unknown, cardBgs?: Record<number, string>): Promise<void> {
    computeCss()
    if (!rendered.value) {
      rendered.value = true
      await nextTick()
    }
    renderErrors.value = []
    for (let i = 0; i < cards.length; i++) {
      loadingIndex.value = i
      try {
        await renderCard(i, cards[i], trip, component, cardBgs?.[i] ?? null)
      } catch (err) {
        // 单张失败不阻断后续，记录供 UI 提示
        renderErrors.value.push(cards[i].key)
        console.warn(`[useTravelImages] 卡片 ${cards[i].key} 渲染失败:`, err)
      }
    }
    loadingIndex.value = cards.length
  }

  /** 保存单张到相册；授权被拒引导去设置页 */
  async function saveOne(index: number, component?: unknown): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      const { canvas } = await nodeOf(index, component)
      const file = await canvasToFile(canvas, CARD_W, CARD_H)
      await saveImageToAlbum(file)
      uni.showToast({ title: '已保存到相册', icon: 'success' })
      return true
    } catch (err) {
      handleSaveError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 顺序保存全部 */
  async function saveAll(component?: unknown): Promise<void> {
    if (saving.value) return
    saving.value = true
    uni.showLoading({ title: '正在保存全部…', mask: true })
    let ok = 0
    try {
      for (let i = 0; i < cards.length; i++) {
        try {
          const { canvas } = await nodeOf(i, component)
          const file = await canvasToFile(canvas, CARD_W, CARD_H)
          await saveImageToAlbum(file)
          ok++
        } catch (err) {
          // 授权类错误直接中断并引导
          if (isAuthError(err)) {
            uni.hideLoading()
            saving.value = false
            promptAuth()
            return
          }
        }
      }
      uni.hideLoading()
      uni.showToast({ title: `已保存 ${ok}/${cards.length} 张`, icon: ok === cards.length ? 'success' : 'none' })
    } finally {
      uni.hideLoading()
      saving.value = false
    }
  }

  function release(): void {
    nodes.value.clear()
    rendered.value = false
    loadingIndex.value = -1
    renderErrors.value = []
  }

  return { cards, cssWidth, cssHeight, rendered, saving, loadingIndex, renderErrors, renderAll, saveOne, saveAll, release }
}

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /auth|deny|denied/i.test(message)
}

function promptAuth(): void {
  uni.showModal({
    title: '需要相册权限',
    content: '保存图片需要相册权限，请在设置中开启「添加到相册」',
    confirmText: '去设置',
    success: (res) => {
      if (res.confirm) openAuthSetting()
    },
  })
}

function handleSaveError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  if (isAuthError(err)) {
    promptAuth()
  } else if (!/cancel/i.test(message)) {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
  }
}
