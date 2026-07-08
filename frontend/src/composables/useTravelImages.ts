import { nextTick, reactive, ref, shallowRef } from 'vue'
import type { Trip } from '@/types/travel'
import { canvasToFile, getCanvasNode, getWindowInfo, openAuthSetting, saveImageToAlbum, type CanvasNode } from '@/utils/canvasAdapter'
import { GUIDE_CARDS, CARD_W, CARD_H, cardMapUrl, guideCardsForTrip, type GuideCard } from '@/utils/guide'
import { setGuideStyle } from '@/utils/guide/theme'
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
  const cards = reactive<GuideCard[]>(GUIDE_CARDS.slice())
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
    const availW = (getWindowInfo().windowWidth || 375) - 32
    cssWidth.value = availW
    cssHeight.value = Math.round((availW * CARD_H) / CARD_W)
  }

  // 最近一次渲染的 trip / 自定义底图，供 saveOne/saveAll 以 2x 重画导出时复用
  let lastTrip: Trip | null = null
  let lastCardBgs: Record<number, string> = {}

  /**
   * 在指定节点上以 scale 倍率绘制一张卡。
   * 预览 scale=1（省内存：10 卡 × 1080×1440）；导出 scale=2（2160×2880，放大不糊）。
   * 设置 canvas.width 会清空内容并重置 transform，故 scale≠1 时重新 ctx.scale；逻辑坐标系始终是 CARD_W×CARD_H。
   */
  async function drawCard(
    node: CanvasNode,
    card: GuideCard,
    trip: Trip,
    bgUrl: string | null,
    scale: number,
  ): Promise<void> {
    const { canvas, ctx } = node
    canvas.width = CARD_W * scale
    canvas.height = CARD_H * scale
    if (scale !== 1) ctx.scale(scale, scale)
    // 清空（scale 后逻辑坐标仍是 CARD_W×CARD_H，clearRect 覆盖整张）
    ctx.clearRect(0, 0, CARD_W, CARD_H)
    setGuideStyle(trip.guideStyle)

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

  async function renderCard(
    index: number,
    card: GuideCard,
    trip: Trip,
    component: unknown,
    bgUrl: string | null,
  ): Promise<void> {
    const node = await nodeOf(index, component)
    await drawCard(node, card, trip, bgUrl, 1)
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
    syncCardsForTrip(cards, trip)
    if (!rendered.value) {
      rendered.value = true
    }
    await nextTick()
    renderErrors.value = []
    lastTrip = trip
    lastCardBgs = cardBgs ?? {}
    for (let i = 0; i < cards.length; i++) {
      loadingIndex.value = i
      try {
        await renderCard(i, cards[i], trip, component, lastCardBgs[i] ?? null)
      } catch (err) {
        // 单张失败不阻断后续，记录供 UI 提示
        renderErrors.value.push(cards[i].key)
        console.warn(`[useTravelImages] 卡片 ${cards[i].key} 渲染失败:`, err)
      }
    }
    loadingIndex.value = cards.length
  }

  /** 保存单张到相册（直接导出预览画布当前像素，稳定可用）；授权被拒引导去设置页 */
  async function saveOne(index: number, component?: unknown): Promise<boolean> {
    if (saving.value) return false
    if (!lastTrip) return false
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

  /** 顺序保存指定卡片（未传 indexes 时保存全部）；授权被拒引导 */
  async function saveAll(component?: unknown, indexes?: number[]): Promise<void> {
    if (saving.value) return
    if (!lastTrip) return
    const targets = indexes && indexes.length > 0 ? indexes : cards.map((_, i) => i)
    saving.value = true
    uni.showLoading({ title: '正在保存图片…', mask: true })
    let ok = 0
    let authFail = false
    let firstError = ''
    try {
      for (let pos = 0; pos < targets.length; pos++) {
        const i = targets[pos]
        uni.showLoading({ title: `保存 ${pos + 1}/${targets.length}`, mask: true })
        try {
          const { canvas } = await nodeOf(i, component)
          const file = await canvasToFile(canvas, CARD_W, CARD_H)
          await saveImageToAlbum(file)
          ok++
          // 连续写相册在真机/开发者工具里都容易被系统节流，顺序保存时留一点喘息。
          await sleep(160)
        } catch (err) {
          const message = errorMessage(err)
          if (!firstError) firstError = message
          console.warn(`[useTravelImages] 保存卡片 ${cards[i].key} 失败:`, err)
          // 授权类错误：记下中断；其它错误继续尝试后续卡片，但最终给出首个失败原因
          if (isAuthError(err)) {
            authFail = true
            break
          }
        }
      }
    } finally {
      // showLoading 必须且仅在这里 hide（配对）；之后再 showToast/promptAuth，
      // 否则多余的 hideLoading 会把成功 toast 一并杀掉。
      uni.hideLoading()
      saving.value = false
    }
    if (authFail) {
      promptAuth()
      return
    }
    if (ok === 0 && firstError) {
      uni.showModal({
        title: '保存失败',
        content: `没有图片保存成功。\n${firstError}`,
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (ok < targets.length && firstError) {
      uni.showModal({
        title: '部分保存成功',
        content: `已保存 ${ok}/${targets.length} 张。\n未保存的图片可能需要重新生成后再试。\n${firstError}`,
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    uni.showToast({ title: `已保存 ${ok}/${targets.length} 张`, icon: ok === targets.length ? 'success' : 'none' })
  }

  function release(): void {
    nodes.value.clear()
    rendered.value = false
    loadingIndex.value = -1
    renderErrors.value = []
  }

  return { cards, cssWidth, cssHeight, rendered, saving, loadingIndex, renderErrors, renderAll, saveOne, saveAll, release }
}

function syncCardsForTrip(target: GuideCard[], trip: Trip): void {
  target.splice(0, target.length, ...guideCardsForTrip(trip))
}

function isAuthError(err: unknown): boolean {
  const message = errorMessage(err)
  return /auth|deny|denied/i.test(message)
}

function isCancelError(err: unknown): boolean {
  return /cancel/i.test(errorMessage(err))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || '保存失败')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  if (isAuthError(err)) {
    promptAuth()
  } else if (!isCancelError(err)) {
    uni.showModal({
      title: '保存失败',
      content: errorMessage(err),
      showCancel: false,
      confirmText: '知道了',
    })
  }
}
