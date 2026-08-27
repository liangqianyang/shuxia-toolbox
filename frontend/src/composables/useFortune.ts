/**
 * 每日灵签主状态机 + API。
 *
 * 阶段流转：deck（选签种）→ ask（问事）→ shake（摇签）→ reveal（出签/掷杯/解签/分享）。
 * 掷杯是纯前端彩蛋（不调接口不占配额）；抽签/配额/解签/分享加次都走后端。
 */
import { computed, ref } from 'vue'
import { requestUserApi } from '@/services/toolbox'
import { DECK_THEMES, GRAIL_MAX_CASTS, throwGrail } from '@/utils/fortune/theme'
import type {
  DeckKey,
  FortuneCategory,
  FortuneDrawResult,
  FortuneHistoryItem,
  FortuneQuota,
  FortuneReading,
  GrailResult,
} from '@/types/fortune'

export type FortuneStage = 'deck' | 'ask' | 'shake' | 'reveal'

const INTERPRET_TIMEOUT = 60000

export function useFortune() {
  const stage = ref<FortuneStage>('deck')
  const deck = ref<DeckKey>('guanyin')
  const category = ref<FortuneCategory>('other')
  const question = ref('')

  const quota = ref<FortuneQuota | null>(null)
  const draw = ref<FortuneDrawResult | null>(null)
  const reading = ref<FortuneReading | null>(null)
  const interpretLoading = ref(false)
  const interpretError = ref('')
  const drawing = ref(false)

  /** 掷杯：throwing 动画中，result 落定后的结果；每签最多掷 GRAIL_MAX_CASTS 次。 */
  const grailThrowing = ref(false)
  const grailResult = ref<GrailResult | null>(null)
  const grailCups = ref<[boolean, boolean]>([false, false])
  const grailCastCount = ref(0)

  const isBook = computed(() => deck.value === 'book')
  const grailCastsLeft = computed(() => Math.max(0, GRAIL_MAX_CASTS - grailCastCount.value))

  async function loadQuota(): Promise<void> {
    try {
      quota.value = await requestUserApi<FortuneQuota>('/api/fortune/quota', 'GET')
    } catch {
      // 配额拉取失败不阻塞页面，抽签时后端仍会兜底校验。
    }
  }

  function selectDeck(key: DeckKey): void {
    deck.value = key
    // 每个签种有自己的默认问事分类（关帝→事业、月老→姻缘），不再一刀切「其他」；
    // 换签种同时清空上次的问题（姻缘的问题带到关帝就串戏了）；同一签种「再抽一次」仍保留问题。
    category.value = DECK_THEMES[key].defaultCategory
    question.value = ''
    stage.value = 'ask'
  }

  function backToDeck(): void {
    stage.value = 'deck'
  }

  /** 进入摇签阶段（摇手机/长按由页面交互触发，完成后调 performDraw）。 */
  function beginShake(): void {
    stage.value = 'shake'
  }

  /** 摇签完成 → 调后端抽签。返回是否成功（失败时停留在 shake 阶段，由页面提示）。 */
  async function performDraw(): Promise<boolean> {
    if (drawing.value) return false
    drawing.value = true
    try {
      const result = await requestUserApi<FortuneDrawResult>('/api/fortune/draw', 'POST', {
        deck: deck.value,
        category: category.value,
        question: question.value.trim() || undefined,
      })
      draw.value = result
      quota.value = result.quota
      reading.value = null
      interpretError.value = ''
      grailResult.value = null
      grailCastCount.value = 0
      stage.value = 'reveal'
      return true
    } catch (error) {
      // 配额用完时同步刷新 quota，让页面切到「明日再来」视图。
      if (error instanceof Error && error.message.includes('已用完')) {
        void loadQuota()
      }
      throw error
    } finally {
      drawing.value = false
    }
  }

  /** 掷杯请示（纯前端随机 + 动画，灵签类限定，每签最多 GRAIL_MAX_CASTS 次）。 */
  function castGrail(): void {
    if (grailThrowing.value || isBook.value || grailCastsLeft.value <= 0) return
    grailCastCount.value += 1
    grailThrowing.value = true
    grailResult.value = null
    try {
      uni.vibrateShort({})
    } catch {}
    const { result, cups } = throwGrail()
    setTimeout(() => {
      grailCups.value = cups
      grailResult.value = result
      grailThrowing.value = false
      try {
        uni.vibrateShort({})
      } catch {}
    }, 1200)
  }

  /** AI 大师解签（同签服务端缓存，重复点不调 AI）。 */
  async function requestInterpret(): Promise<void> {
    if (!draw.value || interpretLoading.value || reading.value) return
    interpretLoading.value = true
    interpretError.value = ''
    try {
      const result = await requestUserApi<{ reading: FortuneReading }>(
        '/api/fortune/interpret',
        'POST',
        { drawId: draw.value.drawId },
        INTERPRET_TIMEOUT,
      )
      reading.value = result.reading
    } catch {
      // 后端错误信息含厂商/URL 等技术细节，不直接展示，统一给友好文案。
      interpretError.value = '解签大师暂时忙碌，请稍后再试'
    } finally {
      interpretLoading.value = false
    }
  }

  /** 分享加次（每日 ≤2）。返回是否加次成功。 */
  async function claimShareBonus(): Promise<boolean> {
    try {
      quota.value = await requestUserApi<FortuneQuota>('/api/fortune/share-bonus', 'POST')
      return true
    } catch {
      return false
    }
  }

  /** 再抽一次 / 换签种：回到对应阶段，保留签种与问事。 */
  function drawAgain(): void {
    draw.value = null
    reading.value = null
    grailResult.value = null
    grailCastCount.value = 0
    stage.value = 'shake'
  }

  function restart(): void {
    draw.value = null
    reading.value = null
    grailResult.value = null
    grailCastCount.value = 0
    stage.value = 'deck'
  }

  return {
    stage,
    deck,
    category,
    question,
    quota,
    draw,
    reading,
    interpretLoading,
    interpretError,
    drawing,
    grailThrowing,
    grailResult,
    grailCups,
    grailCastCount,
    grailCastsLeft,
    isBook,
    loadQuota,
    selectDeck,
    backToDeck,
    beginShake,
    performDraw,
    castGrail,
    requestInterpret,
    claimShareBonus,
    drawAgain,
    restart,
  }
}

/** 历史分页加载（历史页用）。 */
export async function fetchFortuneHistory(page: number): Promise<{ items: FortuneHistoryItem[]; page: number; hasMore: boolean }> {
  return requestUserApi('/api/fortune/history', 'GET', { page })
}
