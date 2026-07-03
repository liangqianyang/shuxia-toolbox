<template>
  <view class="travel">
    <!-- 输入：出发地 + 目的地 + 出行方式 + 天数/时长 + 偏好 -->
    <view class="card travel__ai">
      <view class="travel__ai-head">
        <text class="section-title">AI 规划行程</text>
        <text class="caption">填出发地、目的地和出行方式，AI 联网生成路线 + 多张攻略图（约 10-30s）</text>
      </view>

      <input class="travel__ai-input" v-model="aiOrigin" placeholder="出发地（可选），如「杭州东站」" />
      <input class="travel__ai-input" v-model="aiDestination" placeholder="目的地，如「杭州」" />

      <view class="travel__modes">
        <view
          v-for="m in TRAVEL_MODE_ORDER"
          :key="m"
          class="travel__mode"
          :class="{ 'travel__mode--active': aiMode === m }"
          @tap="aiMode = m"
        >
          <text class="travel__mode-icon">{{ TRAVEL_MODE_META[m].icon }}</text>
          <text class="travel__mode-label">{{ TRAVEL_MODE_META[m].label }}</text>
        </view>
      </view>

      <view class="travel__ai-row">
        <view class="travel__ai-num">
          <text class="caption">天数</text>
          <view class="travel__ai-stepper">
            <text class="travel__ai-step" @tap="setDays(Math.max(1, aiDays - 1))">−</text>
            <text class="travel__ai-step-val">{{ aiDays }}</text>
            <text class="travel__ai-step" @tap="setDays(Math.min(30, aiDays + 1))">+</text>
          </view>
        </view>
        <view class="travel__ai-num">
          <text class="caption">行程</text>
          <view class="travel__ai-seg">
            <text
              class="travel__ai-seg-item"
              :class="{ 'travel__ai-seg-item--active': !aiRoundTrip }"
              @tap="aiRoundTrip = false"
              >单程</text
            >
            <text
              class="travel__ai-seg-item"
              :class="{ 'travel__ai-seg-item--active': aiRoundTrip }"
              @tap="aiRoundTrip = true"
              >往返</text
            >
          </view>
        </view>
      </view>

      <view class="travel__ai-hours">
        <text class="caption">每天时长</text>
        <view class="travel__ai-hours-list">
          <view v-for="(h, i) in aiHoursPerDay" :key="i" class="travel__ai-hour">
            <text class="travel__ai-hour-lab">D{{ i + 1 }}</text>
            <view class="travel__ai-stepper travel__ai-stepper--sm">
              <text class="travel__ai-step" @tap="decHour(i)">−</text>
              <text class="travel__ai-step-val">{{ h }}h</text>
              <text class="travel__ai-step" @tap="incHour(i)">+</text>
            </view>
          </view>
        </view>
      </view>

      <textarea
        class="travel__ai-pref"
        v-model="aiPreferences"
        placeholder="偏好（可选），如「亲子、自然景观、必吃美食、避开人流」"
        :auto-height="true"
      />

      <view v-if="planError" class="travel__ai-err caption">{{ planError }}</view>
      <view
        class="btn-primary travel__ai-go"
        :class="{ disabled: planning || !aiDestination.trim() }"
        @tap="onPlan"
      >
        {{ planning ? 'AI 联网规划中…' : 'AI 生成攻略' }}
      </view>
    </view>

    <!-- 行程标题 -->
    <view class="card travel__head">
      <input
        class="travel__title-input"
        v-model="trip.title"
        placeholder="给行程起个名字，如「3 天杭州行」"
        @input="markDirty"
      />
    </view>

    <!-- 按天编辑 -->
    <view v-for="day in trip.days" :key="day.id" class="card travel__day">
      <view class="travel__day-head">
        <text class="travel__day-badge">Day {{ day.index }}</text>
        <input
          class="travel__day-title"
          v-model="day.title"
          :placeholder="`Day ${day.index} 副标题（如「西湖」）`"
          @input="markDirty"
        />
        <text v-if="trip.days.length > 1" class="travel__day-del" @tap="removeDay(day.id)">删除</text>
      </view>

      <view class="travel__stops">
        <TravelStopCard
          v-for="stop in day.stops"
          :key="stop.id"
          :stop="stop"
          :on-geocode="(q) => geocodeStop(day.id, stop.id, q)"
          @update="(patch) => updateStop(day.id, stop.id, patch)"
          @remove="removeStop(day.id, stop.id)"
          @move="(dir) => moveStop(day.id, stop.id, dir)"
        />
      </view>

      <view class="travel__add-stop" @tap="addStop(day.id)">+ 添加地点</view>
    </view>

    <view class="travel__add-day" @tap="addDay()">+ 添加一天</view>

    <!-- 图片画廊：每张独立图 = 一个 canvas + 保存 -->
    <view v-if="rendered" class="card travel__gallery">
      <view class="travel__gallery-head">
        <text class="section-title">攻略图（{{ cards.length }} 张，可单独保存）</text>
        <view class="btn-primary travel__save-all" @tap="onSaveAll">全部保存</view>
      </view>

      <view v-for="(card, i) in cards" :key="card.key" class="travel__gitem">
        <view class="travel__gitem-head">
          <text class="travel__gitem-label">{{ card.label }}</text>
          <view class="travel__gitem-tools">
            <text class="travel__gitem-bg" @tap="onPickBg(i)">{{ cardBgs[i] ? '换底图' : '自定义底图' }}</text>
            <text v-if="cardBgs[i]" class="travel__gitem-bgclear" @tap="onClearBg(i)">清除</text>
            <text class="travel__gitem-save" @tap="onSaveOne(i)">保存本张</text>
          </view>
        </view>
        <canvas
          :id="`guide-canvas-${i}`"
          type="2d"
          class="travel__gcanvas"
          :style="{ width: cssWidth + 'px', height: cssHeight + 'px' }"
        ></canvas>
      </view>
    </view>

    <!-- 小红书文案卡 -->
    <view v-if="rendered && (trip.xhs.title || trip.xhs.body)" class="card travel__xhs">
      <view class="travel__xhs-head">
        <text class="section-title">小红书文案</text>
        <view class="btn-primary travel__xhs-copy" @tap="onCopyXhs">复制文案</view>
      </view>
      <text v-if="trip.xhs.title" class="travel__xhs-title">{{ trip.xhs.title }}</text>
      <text class="travel__xhs-body">{{ trip.xhs.body }}</text>
      <view v-if="trip.xhs.tags.length" class="travel__xhs-tags">
        <text v-for="(t, ti) in trip.xhs.tags" :key="ti" class="travel__xhs-tag">{{ t }}</text>
      </view>
    </view>

    <!-- 底部操作 -->
    <view class="travel__dock">
      <view class="travel__dock-hint caption">{{ dirty ? '有未保存改动' : '草稿已保存' }}</view>
      <view class="travel__dock-actions">
        <view class="btn-ghost" @tap="onSave">保存草稿</view>
        <view class="btn-primary" @tap="onGenerate">{{ rendered ? '重新生成图' : '生成攻略图' }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import TravelStopCard from '@/components/TravelStopCard.vue'
import { useTravelEditor } from '@/composables/useTravelEditor'
import { useTravelImages } from '@/composables/useTravelImages'
import { TRAVEL_MODE_META, TRAVEL_MODE_ORDER, type TravelMode } from '@/types/travel'
import { chooseImage } from '@/utils/canvasAdapter'

const {
  trip,
  dirty,
  markDirty,
  addDay,
  removeDay,
  addStop,
  updateStop,
  removeStop,
  moveStop,
  geocodeStop,
  planWithAi,
  loadFromStorage,
  saveToStorage,
} = useTravelEditor()

const aiOrigin = ref('')
const aiDestination = ref('')
const aiMode = ref<TravelMode>('walking')
const aiDays = ref(3)
// 每天时长：按天数组，与 aiDays 同步（增天补 8、减天截断）
const aiHoursPerDay = ref<number[]>([8, 8, 8])
const aiRoundTrip = ref(false)
const aiPreferences = ref('')
const planning = ref(false)
const planError = ref('')

function setDays(n: number): void {
  aiDays.value = n
  const arr = aiHoursPerDay.value.slice(0, n)
  while (arr.length < n) arr.push(8)
  aiHoursPerDay.value = arr
}
function decHour(i: number): void {
  aiHoursPerDay.value[i] = Math.max(2, aiHoursPerDay.value[i] - 1)
}
function incHour(i: number): void {
  aiHoursPerDay.value[i] = Math.min(16, aiHoursPerDay.value[i] + 1)
}

const { cards, cssWidth, cssHeight, rendered, renderAll, saveOne, saveAll, release } = useTravelImages()
const instance = getCurrentInstance()?.proxy
// 每张卡的自定义底图临时路径（下标 → 路径）；未设置则用内置水彩主题
const cardBgs = ref<Record<number, string>>({})

async function onPickBg(i: number): Promise<void> {
  try {
    const path = await chooseImage()
    cardBgs.value = { ...cardBgs.value, [i]: path }
    await renderAll(trip, instance, cardBgs.value)
  } catch {
    /* 用户取消选图 */
  }
}
function onClearBg(i: number): void {
  const next = { ...cardBgs.value }
  delete next[i]
  cardBgs.value = next
  void renderAll(trip, instance, cardBgs.value)
}

onMounted(() => {
  loadFromStorage()
})

function onSave(): void {
  saveToStorage()
  uni.showToast({ title: '已保存草稿', icon: 'success' })
}

async function onPlan(): Promise<void> {
  if (planning.value) return
  if (!aiDestination.value.trim()) {
    uni.showToast({ title: '请填目的地', icon: 'none' })
    return
  }
  planning.value = true
  planError.value = ''
  release()
  // AI 联网规划可能要 10-60s，给全屏 loading（mask 防误点）让用户知道在跑
  uni.showLoading({ title: 'AI 联网规划中…', mask: true })
  try {
    const r = await planWithAi({
      origin: aiOrigin.value.trim(),
      destination: aiDestination.value.trim(),
      travelMode: aiMode.value,
      days: aiDays.value,
      dailyHours: aiHoursPerDay.value.slice(),
      roundTrip: aiRoundTrip.value,
      preferences: aiPreferences.value.trim(),
    })
    if (r.ok) {
      uni.hideLoading()
      uni.showToast({ title: `已生成 ${trip.days.length} 天行程`, icon: 'success' })
      await nextTick()
      await renderAll(trip, instance, cardBgs.value)
      dirty.value = false
    } else {
      showPlanFailed(r.error)
    }
  } catch (e) {
    showPlanFailed(e instanceof Error ? e.message : '')
  } finally {
    planning.value = false
  }
}

/** AI 规划失败的友好提示：识别超时给更贴切文案，其余按「繁忙/网络」处理并附原始原因 */
function showPlanFailed(detail?: string): void {
  const d = (detail || '').trim()
  const isTimeout = /timeout|超时|abort/i.test(d)
  planError.value = isTimeout ? 'AI 规划超时，请重试' : d || '规划失败'
  const reason = isTimeout
    ? 'AI 规划超时了——联网搜索偶有波动，再点一次「AI 生成攻略」通常就好。'
    : '可能是网络不稳定或 AI 当前繁忙，请稍后点「AI 生成攻略」重试。'
  uni.hideLoading()
  uni.showModal({
    title: '规划未能完成',
    content: reason + (d && !isTimeout ? `\n（${d}）` : ''),
    showCancel: false,
    confirmText: '知道了',
  })
}

async function onGenerate(): Promise<void> {
  const totalStops = trip.days.reduce((sum, d) => sum + d.stops.length, 0)
  if (totalStops === 0) {
    uni.showToast({ title: '请先添加至少一个地点', icon: 'none' })
    return
  }
  try {
    await renderAll(trip, instance, cardBgs.value)
    dirty.value = false
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '生成失败', icon: 'none' })
  }
}

async function onSaveOne(index: number): Promise<void> {
  await saveOne(index, instance)
}

async function onSaveAll(): Promise<void> {
  await saveAll(instance)
}

function onCopyXhs(): void {
  const { title, body, tags } = trip.xhs
  const text = [title, body, tags.join(' ')].filter(Boolean).join('\n\n')
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '文案已复制', icon: 'success' }),
  })
}
</script>

<style lang="scss" scoped>
.travel {
  // 底部留白须盖过固定 dock（dock 自身含 safe-area-inset-bottom），否则滚动到底会被遮挡
  padding: 32rpx 32rpx calc(240rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 24rpx;

  &__head {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__ai {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__ai-head {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__ai-input {
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    font-weight: 600;
  }

  &__modes {
    display: flex;
    gap: 12rpx;
  }

  &__mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 14rpx 0;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    color: $color-text-secondary;

    &--active {
      border-color: $color-primary;
      background-color: #fff3e6;
      color: $color-primary-dark;
      font-weight: 600;
    }
  }

  &__mode-icon {
    font-size: 40rpx;
  }

  &__mode-label {
    font-size: $font-caption;
  }

  &__ai-row {
    display: flex;
    gap: 32rpx;
  }

  &__ai-num {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__ai-stepper {
    display: flex;
    align-items: center;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
  }

  &__ai-step {
    width: 64rpx;
    height: 64rpx;
    line-height: 64rpx;
    text-align: center;
    background-color: $color-bg;
    color: $color-primary-dark;
    font-size: 36rpx;
  }

  &__ai-step-val {
    min-width: 72rpx;
    text-align: center;
    font-size: $font-body;
    font-weight: 600;
  }

  &__ai-stepper--sm {
    .travel__ai-step {
      width: 48rpx;
      height: 48rpx;
      line-height: 48rpx;
      font-size: 30rpx;
    }

    .travel__ai-step-val {
      min-width: 56rpx;
      font-size: $font-caption;
    }
  }

  &__ai-seg {
    display: flex;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    overflow: hidden;
  }

  &__ai-seg-item {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    color: $color-text-secondary;
    background-color: $color-bg;
  }

  &__ai-seg-item--active {
    background-color: $color-primary;
    color: #ffffff;
    font-weight: 600;
  }

  &__ai-hours {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__ai-hours-list {
    display: flex;
    flex-wrap: wrap;
    gap: 14rpx 18rpx;
  }

  &__ai-hour {
    display: flex;
    align-items: center;
    gap: 10rpx;
  }

  &__ai-hour-lab {
    font-size: $font-caption;
    color: $color-text-secondary;
    font-weight: 600;
  }

  &__ai-pref {
    width: 100%;
    box-sizing: border-box;
    padding: 16rpx 24rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
    // auto-height 只随「内容」增高、不随 placeholder，故给够两行高度让长占位文完整显示
    min-height: 132rpx;
  }

  &__ai-err {
    color: #d9534f;
  }

  &__ai-go {
    padding: 20rpx 0;
    font-size: $font-body;
  }

  &__title-input {
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: 36rpx;
    font-weight: 700;
  }

  &__day {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__day-head {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__day-badge {
    padding: 8rpx 20rpx;
    border-radius: 999rpx;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-caption;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__day-title {
    flex: 1;
    padding: 12rpx 20rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__day-del {
    color: #d9534f;
    font-size: $font-caption;
    flex-shrink: 0;
  }

  &__stops {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
  }

  &__add-stop {
    padding: 20rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-border;
    text-align: center;
    color: $color-text-secondary;
    font-size: $font-body;
  }

  &__add-day {
    padding: 24rpx;
    border-radius: $radius-md;
    border: 2rpx dashed $color-primary;
    text-align: center;
    color: $color-primary;
    font-size: $font-body;
    font-weight: 600;
  }

  &__gallery {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__gallery-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__save-all {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    font-weight: 600;
    border-radius: $radius-md;
  }

  &__gitem {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__gitem-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__gitem-label {
    font-size: $font-body;
    font-weight: 600;
    color: $color-text;
  }

  &__gitem-tools {
    display: flex;
    align-items: center;
    gap: 18rpx;
  }

  &__gitem-bg {
    color: $color-text-secondary;
    font-size: $font-caption;
  }

  &__gitem-bgclear {
    color: #d9534f;
    font-size: $font-caption;
  }

  &__gitem-save {
    color: $color-primary;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__gcanvas {
    border-radius: $radius-md;
    border: 2rpx solid $color-border;
    background-color: #fff;
  }

  &__xhs {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__xhs-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__xhs-copy {
    padding: 12rpx 28rpx;
    font-size: $font-caption;
    font-weight: 600;
    border-radius: $radius-md;
  }

  &__xhs-title {
    font-size: 34rpx;
    font-weight: 700;
    color: $color-text;
  }

  &__xhs-body {
    font-size: $font-body;
    color: $color-text-secondary;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  &__xhs-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__xhs-tag {
    padding: 6rpx 18rpx;
    border-radius: 999rpx;
    background-color: #fff3e6;
    color: $color-primary-dark;
    font-size: $font-caption;
  }

  &__dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background-color: #fff8f0;
    border-top: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24rpx;
  }

  &__dock-actions {
    display: flex;
    gap: 16rpx;

    .btn-primary,
    .btn-ghost {
      padding: 10rpx 28rpx;
      font-size: $font-caption;
      font-weight: 600;
      line-height: 1.2;
      border-radius: $radius-md;
      white-space: nowrap; // 单行，且按钮按内容自适应宽度，避免「生成攻略图」被截成…
      text-align: center;
    }
  }
}
</style>
