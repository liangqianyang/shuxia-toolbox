<template>
  <view class="fortune" :style="{ background: pageBackground }">
    <!-- 页头：标题 / 剩余次数 / 历史入口 -->
    <view class="fortune__header">
      <view class="fortune__header-side">
        <text v-if="quota" class="fortune__quota">今日剩 {{ quota.remaining }} 签</text>
      </view>
      <text class="fortune__title">每日灵签</text>
      <view class="fortune__header-side fortune__header-side--right" @tap="goHistory">
        <text class="fortune__history-link">我的签文</text>
      </view>
    </view>

    <!-- 阶段一：选签种 -->
    <view v-if="stage === 'deck'" class="fortune__stage">
      <text class="fortune__slogan">心诚则灵 · 每日三签</text>
      <view class="fortune__decks">
        <view
          v-for="d in DECK_LIST"
          :key="d.key"
          class="fortune__deck-card"
          :style="{ background: `linear-gradient(150deg, ${d.primary}, ${d.primaryDeep})` }"
          @tap="selectDeck(d.key)"
        >
          <text class="fortune__deck-icon">{{ d.icon }}</text>
          <view class="fortune__deck-text">
            <text class="fortune__deck-name">{{ d.name }}</text>
            <text class="fortune__deck-tagline">{{ d.tagline }}</text>
          </view>
          <text class="fortune__deck-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 阶段二：问事 -->
    <view v-else-if="stage === 'ask'" class="fortune__stage">
      <view class="fortune__ask-head">
        <text class="fortune__back" @tap="backToDeck">‹ 换签种</text>
        <text class="fortune__ask-title" :style="{ color: theme.primaryDeep }">{{ theme.icon }} {{ theme.name }}</text>
      </view>

      <text class="fortune__ask-label">所问何事</text>
      <view class="fortune__categories">
        <view
          v-for="c in FORTUNE_CATEGORIES"
          :key="c.key"
          class="fortune__category"
          :class="{ 'fortune__category--active': category === c.key }"
          :style="category === c.key ? { background: theme.primary, borderColor: theme.primary } : {}"
          @tap="category = c.key"
        >
          <text>{{ c.icon }} {{ c.label }}</text>
        </view>
      </view>

      <text class="fortune__ask-label">默念你的问题（选填，AI 解签会结合它）</text>
      <textarea
        v-model="question"
        class="fortune__question"
        :placeholder="isBook ? '例如：我该接受这个新机会吗？' : '例如：最近的事业调动顺利吗？'"
        maxlength="100"
      />

      <button class="fortune__primary-btn" :style="{ background: theme.primary }" @tap="beginShake">
        诚心求签
      </button>
    </view>

    <!-- 阶段三：摇签 -->
    <view v-else-if="stage === 'shake'" class="fortune__stage fortune__stage--center">
      <!-- 次数用完：明日再来 + 分享加签 -->
      <template v-if="quotaExhausted">
        <text class="fortune__exhausted-icon">🌙</text>
        <text class="fortune__exhausted-title">今日三签已用完</text>
        <text class="fortune__exhausted-desc">{{ resetCountdown }} 后重置，明日再来</text>
        <button
          v-if="quota && quota.bonusLeft > 0"
          class="fortune__primary-btn"
          :style="{ background: theme.primary }"
          open-type="share"
        >
          分享给好友 +1 签（今日还可加 {{ quota.bonusLeft }} 次）
        </button>
        <button class="fortune__ghost-btn" @tap="backToDeck">看看别的签种</button>
      </template>

      <!-- 答案之书：长按翻书 -->
      <template v-else-if="isBook">
        <view
          class="fortune__book"
          :class="{ 'fortune__book--flipping': shakeAnimating }"
          :style="{ background: `linear-gradient(150deg, ${theme.primary}, ${theme.primaryDeep})` }"
          @longpress="triggerDraw"
          @tap="triggerDraw"
        >
          <view class="fortune__book-pages" />
          <text class="fortune__book-title">答案之书</text>
          <text class="fortune__book-sub">THE BOOK OF ANSWERS</text>
        </view>
        <text class="fortune__shake-hint">{{ shakeAnimating ? '书页翻动中…' : theme.shakeHint }}</text>
      </template>

      <!-- 灵签：摇签筒 -->
      <template v-else>
        <view
          class="fortune__tube"
          :class="{ 'fortune__tube--shaking': shakeAnimating }"
          @longpress="triggerDraw"
          @tap="triggerDraw"
        >
          <view class="fortune__tube-sticks" :style="{ background: theme.primary }">
            <view v-for="i in 7" :key="i" class="fortune__tube-stick" :style="{ background: i % 2 ? theme.primary : theme.primaryDeep }" />
          </view>
          <view class="fortune__tube-body" :style="{ background: `linear-gradient(160deg, ${theme.primary}, ${theme.primaryDeep})` }">
            <text class="fortune__tube-word">签</text>
          </view>
        </view>
        <text class="fortune__shake-hint">{{ shakeAnimating ? '灵签跃动中…' : theme.shakeHint }}</text>
      </template>
    </view>

    <!-- 阶段四：出签（页面原生滚动，不用 scroll-view —— 它在小程序里需要显式高度） -->
    <view v-else-if="stage === 'reveal' && draw" class="fortune__stage fortune__reveal">
      <!-- 上上签洒金 -->
      <view v-if="topStick" class="fortune__confetti">
        <view
          v-for="p in confetti"
          :key="p.key"
          class="fortune__confetti-dot"
          :style="{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, background: p.color }"
        />
      </view>

      <!-- 灵签签面 -->
      <view v-if="!isBook" class="fortune__stick-card" :style="{ background: theme.paper, borderColor: theme.primaryDeep }">
        <view class="fortune__stick-head">
          <text class="fortune__stick-no" :style="{ color: theme.ink }">第 {{ draw.stick.no }} 签</text>
          <view class="fortune__seal" :style="{ background: seal.color }">
            <text class="fortune__seal-text">{{ seal.label.replace('签', '') }}</text>
          </view>
        </view>
        <text v-if="draw.stick.title" class="fortune__stick-title" :style="{ color: theme.primaryDeep }">{{ draw.stick.title }}</text>
        <view class="fortune__verse">
          <text v-for="(line, i) in draw.stick.verse" :key="i" class="fortune__verse-line" :style="{ color: theme.ink }">{{ line }}</text>
        </view>
        <text v-if="draw.stick.gist" class="fortune__gist" :style="{ color: theme.primary }">【 {{ draw.stick.gist }} 】</text>
        <text v-if="draw.stick.interpretation" class="fortune__interpretation">{{ draw.stick.interpretation }}</text>
      </view>

      <!-- 答案之书答案 -->
      <view v-else class="fortune__stick-card fortune__stick-card--book" :style="{ background: theme.paper, borderColor: theme.primaryDeep }">
        <text v-if="question" class="fortune__book-question">「 {{ question }} 」</text>
        <text class="fortune__book-answer" :style="{ color: theme.primaryDeep }">{{ draw.stick.answer }}</text>
        <text class="fortune__book-page">—— 第 {{ draw.stick.no }} 页 ——</text>
      </view>

      <!-- 掷杯请示（灵签限定） -->
      <view v-if="!isBook" class="fortune__grail">
        <view class="fortune__grail-cups">
          <view
            v-for="(up, i) in grailCups"
            :key="i"
            class="fortune__grail-cup"
            :class="{
              'fortune__grail-cup--throwing': grailThrowing,
              'fortune__grail-cup--flat': !grailThrowing && grailResult && up,
            }"
          />
        </view>
        <text v-if="grailResult" class="fortune__grail-result" :style="{ color: theme.primaryDeep }">
          {{ GRAIL_COPY[grailResult].title }} · {{ GRAIL_COPY[grailResult].desc }}
        </text>
        <button class="fortune__ghost-btn" :disabled="grailThrowing" @tap="castGrail">
          {{ grailResult ? '再掷一次' : '掷杯请示神明' }}
        </button>
      </view>

      <!-- AI 大师解签 -->
      <view class="fortune__reading">
        <template v-if="reading">
          <text class="fortune__reading-title" :style="{ color: theme.primaryDeep }">大师详解</text>
          <view class="fortune__reading-block">
            <text class="fortune__reading-label">签意</text>
            <text class="fortune__reading-text">{{ reading.meaning }}</text>
          </view>
          <view class="fortune__reading-block">
            <text class="fortune__reading-label">对你所问</text>
            <text class="fortune__reading-text">{{ reading.forYou }}</text>
          </view>
          <view class="fortune__reading-block">
            <text class="fortune__reading-label">行动建议</text>
            <text class="fortune__reading-text">{{ reading.action }}</text>
          </view>
          <view class="fortune__reading-lucky" :style="{ background: theme.primaryDeep }">
            <text class="fortune__reading-lucky-text">✦ {{ reading.luckyHint }}</text>
          </view>
        </template>
        <button
          v-else
          class="fortune__primary-btn"
          :style="{ background: theme.primary }"
          :disabled="interpretLoading"
          @tap="requestInterpret"
        >
          {{ interpretLoading ? '大师解签中…' : '请大师详解（AI）' }}
        </button>
        <text v-if="interpretError" class="fortune__reading-error" @tap="requestInterpret">{{ interpretError }}，点我重试</text>
      </view>

      <!-- 操作区 -->
      <view class="fortune__actions">
        <button class="fortune__primary-btn" :style="{ background: theme.primary }" :disabled="exporting" @tap="saveCard">
          {{ exporting ? '生成中…' : '保存签卡' }}
        </button>
        <button class="fortune__primary-btn fortune__primary-btn--share" :style="{ background: theme.primaryDeep }" :disabled="exporting" @tap="shareCard">
          分享签卡
        </button>
      </view>
      <view class="fortune__actions">
        <button v-if="quota && quota.remaining > 0" class="fortune__ghost-btn" @tap="drawAgain">再抽一次（剩 {{ quota.remaining }} 次）</button>
        <button class="fortune__ghost-btn" @tap="restart">换个签种</button>
      </view>
    </view>

    <!-- 隐藏导出画布（勿在导出前 resize/重画，导出后缩为 1×1 释放内存） -->
    <canvas id="fortune-export-canvas" type="2d" class="fortune__export-canvas" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from 'vue'
import { onHide, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { useFortune } from '@/composables/useFortune'
import { useFortuneShake } from '@/composables/useFortuneShake'
import { canvasToFile, getCanvasNode, openAuthSetting, saveImageToAlbum } from '@/utils/canvasAdapter'
import { renderFortuneCard } from '@/utils/fortune/cardRenderer'
import { DECK_LIST, FORTUNE_CATEGORIES, GRAIL_COPY, isTopStick, levelSeal } from '@/utils/fortune/theme'
import type { FortuneCategory } from '@/types/fortune'

const instance = getCurrentInstance()

const {
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
} = useFortune()

const theme = computed(() => DECK_LIST.find((d) => d.key === deck.value) ?? DECK_LIST[0])
const seal = computed(() => levelSeal(String(draw.value?.stick.level ?? '')))
const topStick = computed(() => !isBook.value && isTopStick(draw.value?.stick.level))
const quotaExhausted = computed(() => quota.value !== null && quota.value.remaining <= 0)
const pageBackground = computed(() =>
  stage.value === 'deck' ? '#FFF8F0' : `linear-gradient(180deg, ${theme.value.primaryDeep}14, #FFF8F0 40%)`,
)

const categoryName = computed(() => FORTUNE_CATEGORIES.find((c) => c.key === category.value)?.label ?? '其他')

// ---------- 摇签（摇手机 / 长按 / 点按） ----------

const shakeAnimating = ref(false)

async function triggerDraw(): Promise<void> {
  if (shakeAnimating.value || drawing.value || quotaExhausted.value) return
  shakeAnimating.value = true
  try {
    uni.vibrateShort({})
  } catch {}
  const minAnim = new Promise((resolve) => setTimeout(resolve, 1400))
  try {
    await Promise.all([performDraw(), minAnim])
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '抽签失败，请再试', icon: 'none' })
  } finally {
    shakeAnimating.value = false
  }
}

const shake = useFortuneShake(() => {
  if (stage.value === 'shake') void triggerDraw()
})

watch(stage, (value) => {
  if (value === 'shake') {
    shake.start()
  } else {
    shake.stop()
  }
})

onShow(() => {
  void loadQuota()
  if (stage.value === 'shake') shake.start()
})

onHide(() => {
  shake.stop()
})

onUnmounted(() => {
  shake.stop()
})

// ---------- 次数用完：重置倒计时 ----------

const now = ref(Date.now())
const countdownTimer = setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(countdownTimer))

const resetCountdown = computed(() => {
  if (!quota.value) return ''
  const resetAt = new Date(quota.value.resetAt.replace(/-/g, '/')).getTime()
  const ms = Math.max(0, resetAt - now.value)
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  return `${h}:${m}:${s}`
})

// ---------- 上上签洒金 ----------

interface ConfettiDot { key: number; left: string; delay: string; duration: string; color: string }
const confetti = ref<ConfettiDot[]>([])

watch(topStick, (value) => {
  if (!value) {
    confetti.value = []
    return
  }
  const colors = ['#C9A227', '#E5C15D', '#B03A2E', '#F0D68A']
  confetti.value = Array.from({ length: 26 }, (_, i) => ({
    key: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2.5}s`,
    duration: `${2.6 + Math.random() * 2}s`,
    color: colors[i % colors.length],
  }))
})

// ---------- 分享 ----------

onShareAppMessage(() => {
  // 次数用完时的「分享加签」按钮也走这里：发起分享即加次（小程序无法校验真实分享结果，行规做法）。
  if (quotaExhausted.value && quota.value && quota.value.bonusLeft > 0) {
    void claimShareBonus().then((ok) => {
      if (ok) uni.showToast({ title: '加签成功，+1 次', icon: 'none' })
    })
  }
  const stickInfo = draw.value && !isBook.value
    ? `我抽到了${theme.value.name}第${draw.value.stick.no}签「${seal.value.label}」`
    : '观音关帝月老灵签 + 答案之书，摇一摇抽签，AI 大师解签'
  return {
    title: `${stickInfo}，来测测你今日运势`,
    path: '/pages/fortune/index',
  }
})

// ---------- 签卡导出 / 分享（anniversary 模式） ----------

const exporting = ref(false)

async function renderCardToFile(): Promise<string> {
  if (!draw.value) throw new Error('还没有抽签')
  await nextTick()
  const { canvas, ctx } = await getCanvasNode('#fortune-export-canvas', instance)
  canvas.width = 1080
  canvas.height = 1440
  await renderFortuneCard(canvas, ctx, {
    deck: theme.value,
    stick: draw.value.stick,
    categoryName: categoryName.value,
    question: question.value.trim() || null,
    luckyHint: reading.value?.luckyHint,
    date: new Date().toISOString().slice(0, 10),
  }, 1080, 1440)
  const filePath = await canvasToFile(canvas, 1080, 1440)
  canvas.width = 1
  canvas.height = 1
  return filePath
}

async function saveCard(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成签卡…', mask: true })
  try {
    const filePath = await renderCardToFile()
    await saveImageToAlbum(filePath)
    uni.hideLoading()
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (error) {
    uni.hideLoading()
    const message = error instanceof Error ? error.message : '保存失败'
    if (/auth|deny|denied/i.test(message)) {
      uni.showModal({
        title: '需要相册权限',
        content: '保存签卡需要相册权限，请在设置中开启。',
        confirmText: '去设置',
        success: (result) => {
          if (result.confirm) openAuthSetting()
        },
      })
    } else if (!/cancel/i.test(message)) {
      uni.showToast({ title: message, icon: 'none' })
    }
  } finally {
    exporting.value = false
  }
}

async function shareCard(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成签卡…', mask: true })
  try {
    const filePath = await renderCardToFile()
    uni.hideLoading()
    const api = typeof wx !== 'undefined' ? wx as unknown as Record<string, any> : null
    if (api && typeof api.showShareImageMenu === 'function') {
      api.showShareImageMenu({
        path: filePath,
        fail: (err: { errMsg?: string }) => {
          if (!/cancel/i.test(err.errMsg || '')) {
            uni.showToast({ title: '分享失败', icon: 'none' })
          }
        },
      })
    } else {
      await saveImageToAlbum(filePath)
      uni.showToast({ title: '已存相册，可从相册分享', icon: 'none' })
    }
  } catch (error) {
    uni.hideLoading()
    uni.showToast({ title: error instanceof Error ? error.message : '分享失败', icon: 'none' })
  } finally {
    exporting.value = false
  }
}

function goHistory(): void {
  uni.navigateTo({ url: '/pages/fortune/history' })
}
</script>

<style lang="scss" scoped>
.fortune {
  min-height: 100vh;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 32rpx 8rpx;
  }

  &__header-side {
    width: 180rpx;
    &--right { text-align: right; }
  }

  &__quota {
    font-size: 24rpx;
    color: $color-text-secondary;
    background: $color-card;
    border-radius: 999rpx;
    padding: 8rpx 20rpx;
    box-shadow: $shadow-card;
  }

  &__title {
    font-size: 40rpx;
    font-weight: 700;
    color: $color-text;
    font-family: "Songti SC", "STSong", serif;
  }

  &__history-link {
    font-size: 24rpx;
    color: $color-primary-dark;
  }

  &__stage {
    flex: 1;
    padding: 32rpx;

    &--center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
  }

  &__slogan {
    display: block;
    text-align: center;
    color: $color-text-secondary;
    font-size: 26rpx;
    margin: 16rpx 0 40rpx;
    letter-spacing: 4rpx;
  }

  // ---------- 签种卡 ----------

  &__decks {
    display: flex;
    flex-direction: column;
    gap: 28rpx;
  }

  &__deck-card {
    display: flex;
    align-items: center;
    border-radius: $radius-lg;
    padding: 36rpx 32rpx;
    box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.12);
  }

  &__deck-icon { font-size: 64rpx; margin-right: 24rpx; }

  &__deck-text { flex: 1; display: flex; flex-direction: column; }

  &__deck-name {
    color: #fff;
    font-size: 36rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    letter-spacing: 4rpx;
  }

  &__deck-tagline { color: rgba(255, 255, 255, 0.85); font-size: 24rpx; margin-top: 8rpx; }

  &__deck-arrow { color: rgba(255, 255, 255, 0.7); font-size: 48rpx; }

  // ---------- 问事 ----------

  &__ask-head { display: flex; align-items: center; margin-bottom: 32rpx; }

  &__back { font-size: 26rpx; color: $color-text-secondary; width: 160rpx; }

  &__ask-title {
    flex: 1;
    text-align: center;
    font-size: 34rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    margin-right: 160rpx;
  }

  &__ask-label {
    display: block;
    font-size: 26rpx;
    color: $color-text-secondary;
    margin: 32rpx 0 16rpx;
  }

  &__categories {
    display: flex;
    flex-wrap: wrap;
    gap: 20rpx;
  }

  &__category {
    padding: 14rpx 32rpx;
    border-radius: 999rpx;
    border: 2rpx solid $color-border;
    background: $color-card;
    font-size: 26rpx;
    color: $color-text;

    &--active { color: #fff; }
  }

  &__question {
    width: 100%;
    box-sizing: border-box;
    background: $color-card;
    border-radius: $radius-md;
    border: 2rpx solid $color-border;
    padding: 24rpx;
    font-size: 28rpx;
    min-height: 140rpx;
  }

  // ---------- 按钮 ----------

  &__primary-btn {
    margin-top: 48rpx;
    width: 100%;
    border-radius: 999rpx;
    color: #fff;
    font-size: 30rpx;
    font-weight: 600;
    padding: 8rpx 0;

    &::after { border: none; }
    &--share { margin-top: 20rpx; }
  }

  &__ghost-btn {
    margin-top: 24rpx;
    width: 100%;
    border-radius: 999rpx;
    background: transparent;
    color: $color-text-secondary;
    font-size: 28rpx;
    border: 2rpx solid $color-border;

    &::after { border: none; }
  }

  // ---------- 摇签 ----------

  &__tube {
    width: 320rpx;
    height: 420rpx;
    position: relative;
    transform-origin: 50% 90%;

    &--shaking { animation: tube-shake 0.28s linear infinite; }
  }

  @keyframes tube-shake {
    0% { transform: rotate(-10deg) translateY(0); }
    25% { transform: rotate(8deg) translateY(-12rpx); }
    50% { transform: rotate(-6deg) translateY(4rpx); }
    75% { transform: rotate(10deg) translateY(-8rpx); }
    100% { transform: rotate(-10deg) translateY(0); }
  }

  &__tube-sticks {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    width: 200rpx;
    height: 130rpx;
    display: flex;
    justify-content: center;
    gap: 8rpx;
    padding-top: 6rpx;
    background: transparent !important;
  }

  &__tube-stick {
    width: 18rpx;
    height: 120rpx;
    border-radius: 6rpx;
  }

  &__tube-body {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 320rpx;
    border-radius: 40rpx 40rpx 60rpx 60rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.2);
  }

  &__tube-word {
    color: rgba(255, 255, 255, 0.9);
    font-size: 96rpx;
    font-family: "Songti SC", "STSong", serif;
    font-weight: 700;
  }

  &__book {
    width: 340rpx;
    height: 460rpx;
    border-radius: 16rpx 32rpx 32rpx 16rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.25);
    position: relative;
    overflow: hidden;

    &--flipping { animation: book-flip 0.5s ease-in-out infinite; }
  }

  @keyframes book-flip {
    0% { transform: perspective(800rpx) rotateY(0); }
    50% { transform: perspective(800rpx) rotateY(-18deg); }
    100% { transform: perspective(800rpx) rotateY(0); }
  }

  &__book-pages {
    position: absolute;
    left: 24rpx;
    top: 20rpx;
    bottom: 20rpx;
    width: 8rpx;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 4rpx;
  }

  &__book-title {
    color: #E9C767;
    font-size: 52rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    letter-spacing: 8rpx;
  }

  &__book-sub { color: rgba(255, 255, 255, 0.55); font-size: 18rpx; margin-top: 12rpx; letter-spacing: 2rpx; }

  &__shake-hint { margin-top: 48rpx; color: $color-text-secondary; font-size: 26rpx; letter-spacing: 2rpx; }

  // ---------- 次数用完 ----------

  &__exhausted-icon { font-size: 88rpx; }
  &__exhausted-title { font-size: 36rpx; font-weight: 700; color: $color-text; margin-top: 24rpx; }
  &__exhausted-desc { font-size: 26rpx; color: $color-text-secondary; margin-top: 12rpx; font-variant-numeric: tabular-nums; }

  // ---------- 出签 ----------

  &__reveal { padding: 16rpx 32rpx 64rpx; }

  &__stick-card {
    border-radius: $radius-lg;
    border: 3rpx solid;
    padding: 48rpx 40rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: $shadow-card;

    &--book { padding: 64rpx 40rpx; }
  }

  &__stick-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__stick-no {
    font-size: 40rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
  }

  &__seal {
    width: 96rpx;
    height: 96rpx;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(-4deg);
  }

  &__seal-text {
    color: #fff;
    font-size: 36rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    writing-mode: vertical-rl;
    letter-spacing: 4rpx;
  }

  &__stick-title {
    font-size: 30rpx;
    margin-top: 16rpx;
    font-family: "Songti SC", "STSong", serif;
  }

  &__verse { margin: 40rpx 0 24rpx; display: flex; flex-direction: column; gap: 16rpx; }

  &__verse-line {
    font-size: 38rpx;
    font-family: "Songti SC", "STSong", serif;
    text-align: center;
    letter-spacing: 6rpx;
  }

  &__gist { font-size: 28rpx; font-weight: 600; margin-bottom: 24rpx; }

  &__interpretation { font-size: 26rpx; color: $color-text-secondary; line-height: 1.8; }

  &__book-question { font-size: 26rpx; color: $color-text-secondary; margin-bottom: 40rpx; }

  &__book-answer {
    font-size: 56rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    text-align: center;
    line-height: 1.6;
    letter-spacing: 4rpx;
  }

  &__book-page { font-size: 24rpx; color: $color-text-secondary; margin-top: 48rpx; }

  // ---------- 掷杯 ----------

  &__grail {
    margin-top: 32rpx;
    background: $color-card;
    border-radius: $radius-lg;
    padding: 32rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: $shadow-card;
  }

  &__grail-cups { display: flex; gap: 40rpx; margin-bottom: 16rpx; }

  &__grail-cup {
    width: 110rpx;
    height: 72rpx;
    background: linear-gradient(180deg, #B03A2E, #7B241C);
    border-radius: 110rpx 110rpx 16rpx 16rpx;
    box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.2);

    &--flat {
      border-radius: 16rpx 16rpx 110rpx 110rpx;
      background: linear-gradient(0deg, #B03A2E, #7B241C);
    }

    &--throwing { animation: cup-roll 0.3s linear infinite; }
  }

  @keyframes cup-roll {
    0% { transform: rotate(0) translateY(0); }
    50% { transform: rotate(180deg) translateY(-24rpx); }
    100% { transform: rotate(360deg) translateY(0); }
  }

  &__grail-result { font-size: 26rpx; line-height: 1.7; text-align: center; margin: 8rpx 0 4rpx; }

  // ---------- AI 解签 ----------

  &__reading {
    margin-top: 32rpx;
    background: $color-card;
    border-radius: $radius-lg;
    padding: 32rpx;
    box-shadow: $shadow-card;
  }

  &__reading-title {
    display: block;
    font-size: 32rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
    margin-bottom: 24rpx;
  }

  &__reading-block { margin-bottom: 20rpx; display: flex; flex-direction: column; }

  &__reading-label { font-size: 24rpx; color: $color-primary-dark; font-weight: 600; margin-bottom: 8rpx; }

  &__reading-text { font-size: 28rpx; color: $color-text; line-height: 1.8; }

  &__reading-lucky {
    margin-top: 24rpx;
    border-radius: $radius-md;
    padding: 20rpx 24rpx;
  }

  &__reading-lucky-text { color: #F5D98A; font-size: 26rpx; }

  &__reading-error { display: block; text-align: center; color: $color-danger; font-size: 26rpx; margin-top: 16rpx; }

  // ---------- 洒金 ----------

  &__confetti { position: fixed; inset: 0; pointer-events: none; z-index: 20; }

  &__confetti-dot {
    position: absolute;
    top: -24rpx;
    width: 14rpx;
    height: 20rpx;
    border-radius: 4rpx;
    opacity: 0.9;
    animation: confetti-fall 3s linear infinite;
  }

  @keyframes confetti-fall {
    0% { transform: translateY(0) rotate(0); opacity: 1; }
    100% { transform: translateY(110vh) rotate(540deg); opacity: 0.3; }
  }

  &__actions { display: flex; flex-direction: column; }

  &__export-canvas {
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 1px;
    height: 1px;
  }
}
</style>
