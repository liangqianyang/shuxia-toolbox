<template>
  <view class="anniversary">
    <view class="anniversary__header">
      <view class="anniversary__header-copy">
        <text class="anniversary__eyebrow">时光纪念卡</text>
        <text class="anniversary__title">{{ headerTitle }}</text>
      </view>
      <view class="anniversary__header-action" @tap="openCreate()">新建</view>
    </view>

    <view v-if="loading" class="anniversary__loading">正在读取重要日子…</view>

    <template v-else>
      <template v-if="panel === 'home'">
        <view v-if="events.length === 0" class="anniversary__empty card">
          <text class="anniversary__empty-title">还没有记录重要日子</text>
          <text class="caption">从生日、旅行、纪念日或坚持一件事开始。</text>
          <view class="btn-primary anniversary__empty-action" @tap="openCreate()">记录第一个日子</view>
        </view>

        <template v-else>
          <view
            v-if="summary.nextEvent"
            class="anniversary__hero card"
            :class="{ 'anniversary__hero--today': heroIsToday }"
          >
            <view class="anniversary__hero-top">
              <view>
                <text class="caption">{{ heroIsToday ? '就是今天' : '下一个重要日子' }}</text>
                <text class="anniversary__hero-title">{{ summary.nextEvent.title }}</text>
              </view>
              <view class="anniversary__hero-tag">{{ heroIsToday ? '🎉' : '' }}{{ sceneName(summary.nextEvent.sceneType) }}</view>
            </view>
            <view class="anniversary__hero-number">
              <text class="anniversary__hero-days">{{ heroIsToday ? '今天' : computeOccurrence(summary.nextEvent).label }}</text>
            </view>
            <text class="anniversary__hero-detail">{{ computeOccurrence(summary.nextEvent).detail }}</text>
            <view class="anniversary__hero-actions">
              <view class="btn-ghost anniversary__small-btn" @tap="addToCalendar(summary.nextEvent)">写入日历</view>
              <view class="btn-primary anniversary__small-btn" @tap="openCard(summary.nextEvent)">{{ heroIsToday ? '马上纪念' : '生成卡片' }}</view>
            </view>
          </view>

          <view class="anniversary__stats">
            <view class="anniversary__stat card">
              <text class="anniversary__stat-value">{{ summary.todayCount }}</text>
              <text class="caption">今天</text>
            </view>
            <view class="anniversary__stat card">
              <text class="anniversary__stat-value">{{ summary.upcomingCount }}</text>
              <text class="caption">7 天内</text>
            </view>
            <view class="anniversary__stat card">
              <text class="anniversary__stat-value">{{ summary.nextMilestone?.remainingDays ?? '-' }}</text>
              <text class="caption">天到里程碑</text>
            </view>
          </view>

          <view v-if="summary.today.length" class="anniversary__section">
            <view class="anniversary__section-head">
              <text class="section-title">今天</text>
              <text class="caption">{{ summary.today.length }} 个</text>
            </view>
            <view v-for="event in summary.today" :key="`today-${event.id}`" class="anniversary__event card" @tap="openCard(event)">
              <view class="anniversary__date-badge">
                <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
              </view>
              <view class="anniversary__event-body">
                <text class="anniversary__event-title">{{ event.title }}</text>
                <text class="caption">{{ eventDateLabel(event) }} · {{ computeOccurrence(event).detail }}</text>
              </view>
              <text class="anniversary__event-count">今天</text>
            </view>
          </view>

          <view v-if="summary.upcoming.length" class="anniversary__section">
            <view class="anniversary__section-head">
              <text class="section-title">即将到来</text>
              <text class="caption">7 天内</text>
            </view>
            <view v-for="event in summary.upcoming" :key="`upcoming-${event.id}`" class="anniversary__event card" @tap="openCard(event)">
              <view class="anniversary__date-badge">
                <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
              </view>
              <view class="anniversary__event-body">
                <text class="anniversary__event-title">{{ event.title }}</text>
                <text class="caption">{{ eventDateLabel(event) }} · {{ computeOccurrence(event).detail }}</text>
              </view>
              <text class="anniversary__event-count">{{ computeOccurrence(event).daysUntil }} 天</text>
            </view>
          </view>

          <view v-if="summary.nextMilestone" class="anniversary__section">
            <view class="anniversary__section-head">
              <text class="section-title">下一个里程碑</text>
              <text class="caption">{{ summary.nextMilestone.date.replace(/-/g, '.') }}</text>
            </view>
            <view class="anniversary__milestone card" @tap="openCard(summary.nextMilestone.event)">
              <text class="anniversary__milestone-title">{{ summary.nextMilestone.event.title }}</text>
              <text class="anniversary__milestone-main">还有 {{ summary.nextMilestone.remainingDays }} 天，就是 {{ summary.nextMilestone.label }}</text>
            </view>
          </view>

          <view class="anniversary__section">
            <view class="anniversary__section-head">
              <text class="section-title">全部日子</text>
              <text class="caption">{{ events.length }} 个</text>
            </view>

            <!-- 搜索与场景筛选 -->
            <view class="anniversary__filter">
              <input v-model="searchQuery" class="anniversary__search" placeholder="搜索纪念日…" maxlength="40" />
              <scroll-view scroll-x class="anniversary__scene-filter">
                <view
                  v-for="scene in filterSceneOptions"
                  :key="scene.key"
                  class="anniversary__scene-chip"
                  :class="{ 'anniversary__scene-chip--active': filterScene === scene.key }"
                  @tap="filterScene = filterScene === scene.key ? '' : scene.key"
                >
                  {{ scene.name }}
                </view>
              </scroll-view>
            </view>

            <view v-for="event in filteredEvents" :key="event.id" class="anniversary__event card" @tap="openCard(event)">
              <view class="anniversary__date-badge">
                <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
              </view>
              <view class="anniversary__event-body">
                <view class="anniversary__event-title-row">
                  <text class="anniversary__event-title">{{ event.title }}</text>
                  <text v-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已提醒</text>
                </view>
                <text class="caption">{{ eventDateLabel(event) }} · {{ computeOccurrence(event).label }}</text>
              </view>
              <text class="anniversary__event-count">{{ computeOccurrence(event).daysUntil >= 0 ? computeOccurrence(event).daysUntil + ' 天' : '已过' }}</text>
            </view>

            <view v-if="filteredEvents.length === 0 && searchQuery" class="anniversary__empty">
              <text>没有找到匹配的纪念日</text>
            </view>
          </view>
        </template>
      </template>

      <template v-else-if="panel === 'form'">
        <view class="anniversary__tabs">
          <view
            v-for="scene in SCENE_OPTIONS"
            :key="scene.key"
            class="anniversary__scene"
            :class="{ 'anniversary__scene--active': form.sceneType === scene.key }"
            @tap="selectScene(scene.key)"
          >
            <text>{{ scene.name }}</text>
            <text class="caption">{{ scene.hint }}</text>
          </view>
        </view>

        <view class="anniversary__form card">
          <text class="section-title">基本信息</text>
          <view class="anniversary__field">
            <text class="caption">名称</text>
            <input v-model="form.title" class="anniversary__input" maxlength="80" placeholder="这个日子叫什么" />
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.calendarType === 'solar' }" @tap="setCalendarType('solar')">公历</view>
            <view :class="{ active: form.calendarType === 'lunar' }" @tap="setCalendarType('lunar')">农历</view>
          </view>

          <view v-if="form.calendarType === 'solar'" class="anniversary__field">
            <text class="caption">日期</text>
            <picker mode="date" :value="form.eventDate" @change="onSolarDateChange">
              <view class="anniversary__picker">{{ form.eventDate }}</view>
            </picker>
          </view>

          <view v-else class="anniversary__lunar-grid">
            <view class="anniversary__field">
              <text class="caption">农历年</text>
              <picker mode="selector" :range="lunarYearLabels" :value="lunarYearIndex" @change="onLunarYearChange">
                <view class="anniversary__picker">{{ form.lunarYear }} 年</view>
              </picker>
            </view>
            <view class="anniversary__field">
              <text class="caption">农历月</text>
              <picker mode="selector" :range="lunarMonthLabels" :value="lunarMonthIndex" @change="onLunarMonthChange">
                <view class="anniversary__picker">{{ currentLunarMonthLabel }}</view>
              </picker>
            </view>
            <view class="anniversary__field">
              <text class="caption">农历日</text>
              <picker mode="selector" :range="lunarDayLabels" :value="lunarDayIndex" @change="onLunarDayChange">
                <view class="anniversary__picker">{{ currentLunarDayLabel }}</view>
              </picker>
            </view>
            <text class="caption anniversary__lunar-hint">对应公历：{{ form.eventDate }}</text>
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.countMode === 'countdown' }" @tap="form.countMode = 'countdown'">倒数</view>
            <view :class="{ active: form.countMode === 'countup' }" @tap="form.countMode = 'countup'">正计时</view>
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.repeatType === 'none' }" @tap="form.repeatType = 'none'">不重复</view>
            <view :class="{ active: form.repeatType === 'yearly' }" @tap="form.repeatType = 'yearly'">每年重复</view>
          </view>
        </view>

        <view class="anniversary__form card">
          <text class="section-title">提醒与卡片</text>
          <view class="anniversary__field">
            <text class="caption">日历提醒</text>
            <picker mode="selector" :range="remindLabels" :value="remindIndex" @change="onRemindChange">
              <view class="anniversary__picker">{{ remindLabels[remindIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__field">
            <text class="caption">默认模板</text>
            <picker mode="selector" :range="templateLabels" :value="templateIndex" @change="onTemplateChange">
              <view class="anniversary__picker">{{ templateLabels[templateIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__field">
            <text class="caption">卡片风格</text>
            <picker mode="selector" :range="toneLabels" :value="toneIndex" :key="'tone-' + (form.id || 0)" @change="onToneChange">
              <view class="anniversary__picker">{{ toneLabels[toneIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__cover" @tap="chooseCoverForForm">
            <view v-if="form.coverImage" class="anniversary__cover-image-wrap">
              <image class="anniversary__cover-image" :src="form.coverImage" mode="aspectFit" />
              <view class="anniversary__cover-remove" @tap.stop="removeCover">✕</view>
            </view>
            <view v-else class="anniversary__cover-empty">
              <text>添加本机封面图</text>
              <text class="caption">设为卡片背景，让纪念卡更有温度</text>
            </view>
          </view>
        </view>

        <view class="anniversary__actions">
          <view class="btn-ghost anniversary__action" @tap="goHome">取消</view>
          <view class="btn-primary anniversary__action" :class="{ disabled: saving }" @tap="saveForm">保存</view>
        </view>
      </template>

      <template v-else-if="panel === 'card' && cardEvent">
        <view
          class="anniversary__card-preview card"
          :class="[
            `anniversary__card-preview--${cardEvent.cardTemplate}`,
            `anniversary__card-preview--${cardEvent.cardTone}`,
            {
              'anniversary__card-preview--has-cover': hasCoverBackground,
              'anniversary__card-preview--photo-bg': usesPhotoBackground,
            },
          ]"
        >
          <image v-if="hasCoverBackground" class="anniversary__preview-bg" :src="cardEvent.coverImage" mode="aspectFill" />
          <view v-if="hasCoverBackground" class="anniversary__preview-overlay" />

          <!-- 证书印章 -->
          <view v-if="cardEvent.cardTemplate === 'certificate'" class="anniversary__preview-stamp">纪</view>

          <!-- 进度环 -->
          <view v-if="cardEvent.cardTemplate === 'progress'" class="anniversary__preview-ring-wrap">
            <view class="anniversary__preview-ring" />
            <text class="anniversary__preview-ring-text">{{ cardEvent.countMode === 'countup' ? '...' : Math.max(0, computeOccurrence(cardEvent).daysUntil) + '天' }}</text>
          </view>

          <!-- 节日星星 -->
          <template v-if="cardEvent.cardTemplate === 'festival'">
            <view class="anniversary__preview-star" style="top: 100rpx; right: 160rpx; width: 32rpx; height: 32rpx;" />
            <view class="anniversary__preview-star" style="top: 180rpx; right: 100rpx; width: 20rpx; height: 20rpx;" />
            <view class="anniversary__preview-star" style="top: 140rpx; left: 80rpx; width: 24rpx; height: 24rpx;" />
            <view class="anniversary__preview-dot" style="top: 120rpx; right: 130rpx;" />
            <view class="anniversary__preview-dot" style="top: 210rpx; right: 180rpx;" />
            <view class="anniversary__preview-dot" style="top: 160rpx; left: 120rpx;" />
          </template>

          <view class="anniversary__preview-labels">
            <text class="anniversary__preview-label">{{ templateName(cardEvent.cardTemplate) }}</text>
            <text class="anniversary__preview-label anniversary__preview-label--tone">{{ toneName(cardEvent.cardTone) }}</text>
          </view>
          <view class="anniversary__preview-number">
            <text>{{ previewNumber }}</text>
            <text class="anniversary__preview-unit">{{ previewUnit }}</text>
          </view>
          <text class="anniversary__preview-title">{{ cardEvent.title }}</text>
          <text class="anniversary__preview-copy">{{ defaultCopyForEvent(cardEvent) }}</text>
          <text class="anniversary__preview-date">{{ eventDateLabel(cardEvent) }}</text>
        </view>

        <view v-if="cardEvent.calendarAddedAt" class="anniversary__reminder-status card">
          <text>📅 已写入手机日历</text>
          <text class="caption">{{ cardEvent.remindDaysBefore > 0 ? `提前 ${cardEvent.remindDaysBefore} 天提醒` : '当天提醒' }}</text>
        </view>

        <view class="anniversary__section">
          <view class="anniversary__section-head">
            <text class="section-title">模板</text>
            <text class="caption">保存图片时使用</text>
          </view>
          <view class="anniversary__chip-grid">
            <view
              v-for="template in TEMPLATE_OPTIONS"
              :key="template.key"
              class="anniversary__chip"
              :class="{ 'anniversary__chip--active': cardTemplate === template.key }"
              @tap="selectCardTemplate(template.key)"
            >
              <text>{{ template.name }}</text>
              <text class="caption">{{ template.hint }}</text>
            </view>
          </view>
        </view>

        <view class="anniversary__section">
          <view class="anniversary__section-head">
            <text class="section-title">风格</text>
            <text class="caption">{{ toneName(cardTone) }} · {{ toneHint(cardTone) }}</text>
          </view>
          <view class="anniversary__tone-row">
            <view
              v-for="tone in TONE_OPTIONS"
              :key="tone.key"
              class="anniversary__tone"
              :class="{ 'anniversary__tone--active': cardTone === tone.key }"
              @tap="selectCardTone(tone.key)"
            >
              <text>{{ tone.name }}</text>
              <text class="caption">{{ tone.hint }}</text>
            </view>
          </view>
        </view>

        <view class="anniversary__actions anniversary__actions--wrap">
          <view class="btn-ghost anniversary__action" @tap="panel = 'home'">返回</view>
          <view class="btn-ghost anniversary__action" @tap="openEdit(cardEvent)">编辑</view>
          <view class="btn-ghost anniversary__action" @tap="chooseCoverForCard">换图</view>
          <view class="btn-ghost anniversary__action" @tap="addToCalendar(cardEvent)">写入日历</view>
          <view class="btn-ghost anniversary__action" @tap="shareCard">分享</view>
          <view class="btn-primary anniversary__action" :class="{ disabled: exporting }" @tap="exportCard">保存图片</view>
        </view>

        <view class="anniversary__delete" @tap="removeCurrent">删除这个日子</view>
      </template>
    </template>

    <canvas id="anniversary-export-canvas" type="2d" class="anniversary__export-canvas" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { onShareAppMessage, onShow } from '@dcloudio/uni-app'
import type {
  AnniversaryCalendarType,
  AnniversaryCardTemplate,
  AnniversaryCardTone,
  AnniversaryDraft,
  AnniversaryEvent,
  AnniversarySceneType,
} from '@/types/anniversary'
import { deleteAnniversary, fetchAnniversaries, markAnniversaryCalendarAdded, saveAnniversary, subscribeAnniversaryReminder } from '@/services/anniversary'
import {
  SCENE_OPTIONS,
  TEMPLATE_OPTIONS,
  TONE_OPTIONS,
  computeOccurrence,
  dateFromString,
  defaultCopyForEvent,
  draftFromEvent,
  emptyAnniversaryDraft,
  eventDateLabel,
  formatDate,
  recommendedTemplateForScene,
  sceneName,
  summarizeAnniversaries,
} from '@/utils/anniversary'
import { lunarDayLabel, lunarLeapDays, lunarLeapMonth, lunarMonthDays, lunarMonthLabel, lunarToSolar, solarToLunar } from '@/utils/lunar'
import { canvasToFile, chooseImage, getCanvasNode, openAuthSetting, saveImageToAlbum } from '@/utils/canvasAdapter'
import { renderAnniversaryCard } from '@/utils/anniversaryCard'

type Panel = 'home' | 'form' | 'card'

const instance = getCurrentInstance()?.proxy
const events = ref<AnniversaryEvent[]>([])
const loading = ref(true)
const saving = ref(false)
const exporting = ref(false)
const panel = ref<Panel>('home')
const form = ref<AnniversaryDraft>(emptyAnniversaryDraft())
const selectedId = ref<number | null>(null)
const cardTemplate = ref<AnniversaryCardTemplate>('minimal')
const cardTone = ref<AnniversaryCardTone>('warm')
const cardCoverImage = ref('')

const remindValues = [0, 1, 3, 7, 14, 30]
const remindLabels = ['当天提醒', '提前 1 天', '提前 3 天', '提前 7 天', '提前 14 天', '提前 30 天']
const lunarYears = Array.from({ length: 201 }, (_, index) => 1900 + index)
const lunarYearLabels = lunarYears.map((year) => `${year} 年`)

const summary = computed(() => summarizeAnniversaries(events.value))
const heroIsToday = computed(() => {
  if (!summary.value.nextEvent) return false
  return computeOccurrence(summary.value.nextEvent).daysUntil === 0
})

const previewOccurrence = computed(() => cardEvent.value ? computeOccurrence(cardEvent.value) : null)
const previewNumber = computed(() => {
  if (!previewOccurrence.value) return 0
  const { elapsedDays, daysUntil } = previewOccurrence.value
  const notStarted = cardEvent.value?.countMode === 'countup' && elapsedDays === 0
  return notStarted ? Math.max(0, daysUntil) : cardEvent.value?.countMode === 'countup' ? elapsedDays : Math.max(0, daysUntil)
})
const previewUnit = computed(() => {
  if (!previewOccurrence.value) return '天'
  const { elapsedDays, daysUntil } = previewOccurrence.value
  const notStarted = cardEvent.value?.countMode === 'countup' && elapsedDays === 0
  if (notStarted) return '天后出发'
  if (cardEvent.value?.countMode === 'countup') return '天'
  return daysUntil === 0 ? '今天' : '天'
})
const sortedEvents = computed(() => [...events.value].sort((a, b) => computeOccurrence(a).daysUntil - computeOccurrence(b).daysUntil || a.sortOrder - b.sortOrder))
const searchQuery = ref('')
const filterScene = ref('')
const filterSceneOptions = computed(() => [{ key: '', name: '全部' }, ...SCENE_OPTIONS])
const filteredEvents = computed(() => {
  let list = sortedEvents.value
  if (filterScene.value) {
    list = list.filter((event) => event.sceneType === filterScene.value)
  }
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((event) => event.title.toLowerCase().includes(query))
  }
  return list
})
const headerTitle = computed(() => panel.value === 'form' ? '记录重要日子' : panel.value === 'card' ? '生成纪念卡' : '重要日子')
const selectedEvent = computed(() => events.value.find((event) => event.id === selectedId.value) ?? summary.value.nextEvent ?? events.value[0] ?? null)
const cardEvent = computed<AnniversaryEvent | null>(() => selectedEvent.value ? {
  ...selectedEvent.value,
  cardTemplate: cardTemplate.value,
  cardTone: cardTone.value,
  coverImage: cardCoverImage.value,
} : null)
const hasCoverBackground = computed(() => Boolean(cardEvent.value?.coverImage))
const usesPhotoBackground = computed(() => Boolean(cardEvent.value?.coverImage && cardEvent.value.cardTemplate === 'photo'))
const remindIndex = computed(() => Math.max(0, remindValues.indexOf(form.value.remindDaysBefore)))
const templateLabels = computed(() => TEMPLATE_OPTIONS.map((item) => item.name))
const templateIndex = computed(() => Math.max(0, TEMPLATE_OPTIONS.findIndex((item) => item.key === form.value.cardTemplate)))
const toneLabels = computed(() => TONE_OPTIONS.map((item) => `${item.name} · ${item.hint}`))
const toneIndex = computed(() => Math.max(0, TONE_OPTIONS.findIndex((item) => item.key === form.value.cardTone)))
const lunarYearIndex = computed(() => Math.max(0, lunarYears.indexOf(form.value.lunarYear || new Date().getFullYear())))
const lunarMonthOptions = computed(() => {
  const year = form.value.lunarYear || new Date().getFullYear()
  const leap = lunarLeapMonth(year)
  const options: Array<{ month: number, isLeap: boolean, label: string }> = []
  for (let month = 1; month <= 12; month += 1) {
    options.push({ month, isLeap: false, label: lunarMonthLabel(month) })
    if (leap === month) options.push({ month, isLeap: true, label: lunarMonthLabel(month, true) })
  }
  return options
})
const lunarMonthLabels = computed(() => lunarMonthOptions.value.map((item) => item.label))
const lunarMonthIndex = computed(() => {
  const index = lunarMonthOptions.value.findIndex((item) => item.month === form.value.lunarMonth && item.isLeap === form.value.isLunarLeapMonth)
  return Math.max(0, index)
})
const lunarDayOptions = computed(() => {
  const year = form.value.lunarYear || new Date().getFullYear()
  const month = form.value.lunarMonth || 1
  const max = form.value.isLunarLeapMonth ? lunarLeapDays(year) : lunarMonthDays(year, month)
  return Array.from({ length: max || 30 }, (_, index) => index + 1)
})
const lunarDayLabels = computed(() => lunarDayOptions.value.map((day) => lunarDayLabel(day)))
const lunarDayIndex = computed(() => Math.max(0, lunarDayOptions.value.indexOf(form.value.lunarDay || 1)))
const currentLunarMonthLabel = computed(() => lunarMonthLabel(form.value.lunarMonth || 1, form.value.isLunarLeapMonth))
const currentLunarDayLabel = computed(() => lunarDayLabel(form.value.lunarDay || 1))

onShow(() => {
  void loadEvents()
})

onShareAppMessage(() => {
  if (selectedEvent.value) {
    return {
      title: `${selectedEvent.value.title} · 时光纪念卡`,
      path: '/pages/anniversary/index',
      imageUrl: selectedEvent.value.coverImage || '',
    }
  }
  return {
    title: '时光纪念卡 — 记住每一个重要的日子',
    path: '/pages/anniversary/index',
  }
})

async function loadEvents() {
  loading.value = true
  try {
    events.value = await fetchAnniversaries()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取纪念日失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openCreate(sceneType: AnniversarySceneType = 'birthday') {
  form.value = emptyAnniversaryDraft(sceneType)
  syncLunarFromSolar()
  panel.value = 'form'
}

function openEdit(event: AnniversaryEvent) {
  form.value = draftFromEvent(event)
  panel.value = 'form'
}

function goHome() {
  if (panel.value === 'form' && form.value.title.trim()) {
    uni.showModal({
      title: '放弃编辑？',
      content: '当前填写的内容尚未保存，确定离开吗？',
      confirmText: '离开',
      confirmColor: '#e06a5a',
      success: (result) => {
        if (result.confirm) {
          form.value = emptyAnniversaryDraft()
          panel.value = 'home'
        }
      },
    })
    return
  }
  panel.value = 'home'
}

function selectScene(sceneType: AnniversarySceneType) {
  const next = emptyAnniversaryDraft(sceneType)
  form.value = {
    ...next,
    id: form.value.id,
    title: form.value.title && form.value.title !== '生日' ? form.value.title : next.title,
    eventDate: form.value.eventDate,
    calendarType: form.value.calendarType,
    lunarYear: form.value.lunarYear,
    lunarMonth: form.value.lunarMonth,
    lunarDay: form.value.lunarDay,
    isLunarLeapMonth: form.value.isLunarLeapMonth,
    coverImage: form.value.coverImage,
  }
}

function setCalendarType(type: AnniversaryCalendarType) {
  form.value.calendarType = type
  if (type === 'lunar') {
    syncLunarFromSolar()
  }
}

function onSolarDateChange(event: { detail: { value: string } }) {
  form.value.eventDate = event.detail.value
  if (form.value.calendarType === 'lunar') syncLunarFromSolar()
}

function onLunarYearChange(event: { detail: { value: number | string } }) {
  form.value.lunarYear = lunarYears[Number(event.detail.value)] ?? new Date().getFullYear()
  normalizeLunarMonth()
  applyLunarToSolar()
}

function onLunarMonthChange(event: { detail: { value: number | string } }) {
  const option = lunarMonthOptions.value[Number(event.detail.value)] ?? lunarMonthOptions.value[0]
  form.value.lunarMonth = option.month
  form.value.isLunarLeapMonth = option.isLeap
  normalizeLunarDay()
  applyLunarToSolar()
}

function onLunarDayChange(event: { detail: { value: number | string } }) {
  form.value.lunarDay = lunarDayOptions.value[Number(event.detail.value)] ?? 1
  applyLunarToSolar()
}

function onRemindChange(event: { detail: { value: number | string } }) {
  form.value.remindDaysBefore = remindValues[Number(event.detail.value)] ?? 1
}

function onTemplateChange(event: { detail: { value: number | string } }) {
  form.value.cardTemplate = TEMPLATE_OPTIONS[Number(event.detail.value)]?.key ?? 'minimal'
}

function onToneChange(event: { detail: { value: number | string } }) {
  form.value.cardTone = TONE_OPTIONS[Number(event.detail.value)]?.key ?? 'warm'
}

function syncLunarFromSolar() {
  const lunar = solarToLunar(dateFromString(form.value.eventDate))
  if (!lunar) return
  form.value.lunarYear = lunar.year
  form.value.lunarMonth = lunar.month
  form.value.lunarDay = lunar.day
  form.value.isLunarLeapMonth = lunar.isLeap
}

function applyLunarToSolar() {
  const solar = lunarToSolar(
    form.value.lunarYear || new Date().getFullYear(),
    form.value.lunarMonth || 1,
    form.value.lunarDay || 1,
    form.value.isLunarLeapMonth,
  )
  if (solar) {
    form.value.eventDate = formatDate(solar)
  }
}

function normalizeLunarMonth() {
  const matched = lunarMonthOptions.value.find((item) => item.month === form.value.lunarMonth && item.isLeap === form.value.isLunarLeapMonth)
  if (!matched) {
    const first = lunarMonthOptions.value[0]
    form.value.lunarMonth = first.month
    form.value.isLunarLeapMonth = first.isLeap
  }
}

function normalizeLunarDay() {
  const max = lunarDayOptions.value[lunarDayOptions.value.length - 1] ?? 30
  if (!form.value.lunarDay || form.value.lunarDay > max) form.value.lunarDay = max
}

async function chooseCoverForForm() {
  try {
    form.value.coverImage = await chooseImage()
  } catch (error) {
    if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
      uni.showToast({ title: '选图失败', icon: 'none' })
    }
  }
}

function removeCover() {
  form.value.coverImage = ''
}

async function chooseCoverForCard() {
  if (!cardEvent.value) return
  try {
    cardCoverImage.value = await chooseImage()
    await saveCardPreference(false)
  } catch (error) {
    if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
      uni.showToast({ title: '选图失败', icon: 'none' })
    }
  }
}

async function saveForm() {
  if (saving.value) return
  if (!form.value.title.trim()) {
    uni.showToast({ title: '先写一个名称', icon: 'none' })
    return
  }
  saving.value = true
  try {
    if (form.value.calendarType === 'lunar') applyLunarToSolar()
    const event = await saveAnniversary(form.value)
    upsertEvent(event)
    openCard(event)
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function openCard(event: AnniversaryEvent) {
  selectedId.value = event.id
  cardTemplate.value = event.cardTemplate || recommendedTemplateForScene(event.sceneType)
  cardTone.value = event.cardTone || 'warm'
  cardCoverImage.value = event.coverImage || ''
  panel.value = 'card'
}

function selectCardTemplate(template: AnniversaryCardTemplate) {
  cardTemplate.value = template
  void saveCardPreference(false)
}

function selectCardTone(tone: AnniversaryCardTone) {
  cardTone.value = tone
  void saveCardPreference(false)
}

async function saveCardPreference(showToast = true) {
  if (!selectedEvent.value) return
  const event = await saveAnniversary({
    ...draftFromEvent(selectedEvent.value),
    cardTemplate: cardTemplate.value,
    cardTone: cardTone.value,
    coverImage: cardCoverImage.value,
  })
  upsertEvent(event)
  selectedId.value = event.id
  if (showToast) uni.showToast({ title: '卡片偏好已保存', icon: 'success' })
}

const SUBSCRIBE_TMPL_ID = 'Jy26nV_9a4EbDPNzccPmnZ_ojRZ4EYSu5rjzmD1CYfc'

async function addToCalendar(event: AnniversaryEvent) {
  const target = event.id === selectedEvent.value?.id && cardEvent.value ? cardEvent.value : event
  try {
    await writePhoneCalendar(target)
    const updated = await markAnniversaryCalendarAdded(target.id, target.repeatType)
    upsertEvent(updated)
    uni.showToast({ title: '已写入手机日历', icon: 'success' })

    // 顺便请求订阅消息授权，作为日历被删后的兜底提醒
    await requestSubscribeReminder(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : '写入日历失败'
    if (!/cancel/i.test(message)) uni.showToast({ title: message, icon: 'none' })
  }
}

async function requestSubscribeReminder(event: AnniversaryEvent) {
  const api = typeof wx !== 'undefined' ? wx : null
  if (!api || typeof api.requestSubscribeMessage !== 'function') return

  try {
    const result = await new Promise<{ errMsg: string; [tmplId: string]: string }>((resolve, reject) => {
      api.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TMPL_ID],
        success: resolve,
        fail: reject,
      })
    })

    if (result[SUBSCRIBE_TMPL_ID] === 'accept') {
      const nextDate = computeOccurrence(event).date
      await subscribeAnniversaryReminder(event.id, SUBSCRIBE_TMPL_ID, nextDate)
    }
  } catch {
    // 用户拒绝或出错，静默忽略
  }
}

function writePhoneCalendar(event: AnniversaryEvent): Promise<void> {
  const occurrence = computeOccurrence(event)
  const [year, month, day] = occurrence.date.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const payload = {
    title: event.title,
    startTime: Math.floor(start.getTime() / 1000),
    allDay: true,
    alarm: true,
    alarmOffset: event.remindDaysBefore * 86400,
    description: `来自枫叶小屋 · 时光纪念卡\n${defaultCopyForEvent(event, occurrence)}`,
  }
  return new Promise((resolve, reject) => {
    const api = typeof wx !== 'undefined' ? wx : null
    if (!api) {
      reject(new Error('当前平台暂不支持写入手机日历'))
      return
    }
    const success = () => resolve()
    const fail = (err: { errMsg?: string }) => reject(new Error(err.errMsg || '写入日历失败'))
    if (event.repeatType === 'yearly' && typeof api.addPhoneRepeatCalendar === 'function') {
      api.addPhoneRepeatCalendar({ ...payload, repeatInterval: 'year', success, fail })
      return
    }
    if (typeof api.addPhoneCalendar === 'function') {
      api.addPhoneCalendar({ ...payload, success, fail })
      return
    }
    reject(new Error('当前微信版本不支持写入手机日历'))
  })
}

async function exportCard() {
  if (!cardEvent.value || exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成卡片…', mask: true })
  try {
    await saveCardPreference(false)
    await nextTick()
    const { canvas, ctx } = await getCanvasNode('#anniversary-export-canvas', instance)
    canvas.width = 1080
    canvas.height = 1440
    await renderAnniversaryCard(canvas, ctx, cardEvent.value, 1080, 1440)
    const filePath = await canvasToFile(canvas, 1080, 1440)
    canvas.width = 1
    canvas.height = 1
    await saveImageToAlbum(filePath)
    uni.hideLoading()
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (error) {
    uni.hideLoading()
    const message = error instanceof Error ? error.message : '保存失败'
    if (/auth|deny|denied/i.test(message)) {
      uni.showModal({
        title: '需要相册权限',
        content: '保存纪念卡需要相册权限，请在设置中开启。',
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

async function shareCard() {
  if (!cardEvent.value || exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成卡片…', mask: true })
  try {
    await saveCardPreference(false)
    await nextTick()
    const { canvas, ctx } = await getCanvasNode('#anniversary-export-canvas', instance)
    canvas.width = 1080
    canvas.height = 1440
    await renderAnniversaryCard(canvas, ctx, cardEvent.value, 1080, 1440)
    const filePath = await canvasToFile(canvas, 1080, 1440)
    canvas.width = 1
    canvas.height = 1
    uni.hideLoading()

    // 微信原生图片分享（需要基础库 ≥ 2.14.1）
    const api = typeof wx !== 'undefined' ? wx as Record<string, any> : null
    const sdkSupported = api && typeof api.showShareImageMenu === 'function'

    if (sdkSupported) {
      api.showShareImageMenu({
        path: filePath,
        fail: (err: { errMsg?: string }) => {
          if (!/cancel/i.test(err.errMsg || '')) {
            uni.showToast({ title: '分享失败', icon: 'none' })
          }
        },
      })
    } else {
      // 降级：先存到相册，提示用户手动分享
      await saveImageToAlbum(filePath)
      uni.showToast({ title: '已存相册，可从相册分享', icon: 'none' })
    }
  } catch (error) {
    uni.hideLoading()
    const message = error instanceof Error ? error.message : '分享失败'
    if (!/cancel/i.test(message)) {
      uni.showToast({ title: message, icon: 'none' })
    }
  } finally {
    exporting.value = false
  }
}

function removeCurrent() {
  if (!selectedEvent.value) return
  uni.showModal({
    title: '删除纪念日',
    content: `确定删除「${selectedEvent.value.title}」吗？`,
    confirmText: '删除',
    confirmColor: '#e06a5a',
    success: (result) => {
      if (!result.confirm || !selectedEvent.value) return
      void deleteAnniversary(selectedEvent.value.id).then(() => {
        events.value = events.value.filter((event) => event.id !== selectedEvent.value?.id)
        selectedId.value = null
        panel.value = 'home'
        uni.showToast({ title: '已删除', icon: 'success' })
      })
    },
  })
}

function upsertEvent(event: AnniversaryEvent) {
  const index = events.value.findIndex((item) => item.id === event.id)
  if (index >= 0) {
    events.value.splice(index, 1, event)
  } else {
    events.value.push(event)
  }
}

function badgeMonth(event: AnniversaryEvent): string {
  return `${Number(computeOccurrence(event).date.slice(5, 7))}月`
}

function badgeDay(event: AnniversaryEvent): string {
  return String(Number(computeOccurrence(event).date.slice(-2)))
}

function templateName(template: AnniversaryCardTemplate): string {
  return TEMPLATE_OPTIONS.find((item) => item.key === template)?.name ?? '极简'
}

function toneName(tone: AnniversaryCardTone): string {
  return TONE_OPTIONS.find((item) => item.key === tone)?.name ?? '温柔'
}

function toneHint(tone: AnniversaryCardTone): string {
  return TONE_OPTIONS.find((item) => item.key === tone)?.hint ?? '暖棕调'
}
</script>

<style lang="scss" scoped>
.anniversary {
  min-height: 100vh;
  padding: 48rpx 32rpx 180rpx;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20rpx;
    padding: 40rpx 0 36rpx;
  }

  &__header-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__eyebrow {
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__title {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  &__header-action {
    min-width: 104rpx;
    padding: 14rpx 20rpx;
    border-radius: $radius-md;
    background: $color-primary;
    color: #fff;
    font-size: 26rpx;
    font-weight: 600;
    text-align: center;
  }

  &__loading,
  &__empty {
    min-height: 360rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18rpx;
    color: $color-text-secondary;
    text-align: center;
  }

  &__empty-title {
    color: $color-text;
    font-size: 34rpx;
    font-weight: 700;
  }

  &__empty-action {
    width: 320rpx;
    margin-top: 18rpx;
  }

  &__hero {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
    margin-bottom: 24rpx;
    background: linear-gradient(135deg, #fff, #fff7ef);
  }

  &__hero--today {
    background: linear-gradient(135deg, #fff5f0, #ffe8d6);
    border-color: #f0c8a0;
  }

  &__hero--today &__hero-days {
    color: #d4855e;
  }

  &__hero--today &__hero-tag {
    background: #fde8d0;
    color: #c07040;
  }

  &__hero-top,
  &__section-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20rpx;
  }

  &__hero-title {
    display: block;
    margin-top: 8rpx;
    color: $color-text;
    font-size: 36rpx;
    font-weight: 700;
  }

  &__hero-tag {
    padding: 8rpx 14rpx;
    border-radius: $radius-sm;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 22rpx;
    flex-shrink: 0;
  }

  &__hero-number {
    display: flex;
    align-items: baseline;
  }

  &__hero-days {
    color: $color-text;
    font-size: 74rpx;
    font-weight: 700;
  }

  &__hero-detail {
    color: $color-text-secondary;
    font-size: 26rpx;
  }

  &__hero-actions,
  &__actions {
    display: flex;
    gap: 18rpx;
  }

  &__small-btn,
  &__action {
    flex: 1;
    font-size: 26rpx;
    padding: 18rpx 0;
  }

  &__actions {
    margin-top: 24rpx;
  }

  &__actions--wrap {
    flex-wrap: wrap;
  }

  &__actions--wrap &__action {
    min-width: 200rpx;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16rpx;
    margin-bottom: 32rpx;
  }

  &__stat {
    padding: 24rpx 16rpx;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__stat-value {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  /* ---- filter & search ---- */

  &__filter {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-bottom: 20rpx;
  }

  &__search {
    height: 76rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    padding: 0 22rpx;
    background: #fffdfb;
    color: $color-text;
    font-size: 26rpx;
  }

  &__scene-filter {
    white-space: nowrap;
  }

  &__scene-chip {
    display: inline-block;
    padding: 10rpx 20rpx;
    margin-right: 12rpx;
    border: 2rpx solid $color-border;
    border-radius: 999rpx;
    background: $color-card;
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__scene-chip--active {
    border-color: $color-primary;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-weight: 600;
  }

  /* ---- reminder badge ---- */

  &__event-title-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__event-reminder-badge {
    padding: 2rpx 10rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 20rpx;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__reminder-status {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-bottom: 8rpx;
    padding: 18rpx 24rpx;
    color: $color-text;
    font-size: 26rpx;
    background: #f0f7f0;
    border-color: #c8dcc8;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-bottom: 32rpx;
  }

  &__event {
    display: grid;
    grid-template-columns: 76rpx 1fr auto;
    align-items: center;
    gap: 20rpx;
    padding: 24rpx;
  }

  &__date-badge {
    width: 76rpx;
    height: 76rpx;
    border-radius: $radius-md;
    background: $color-primary-light;
    color: $color-primary-dark;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  &__date-badge-month {
    font-size: 18rpx;
    line-height: 1.1;
  }

  &__date-badge-day {
    margin-top: 4rpx;
    font-size: 30rpx;
    line-height: 1;
  }

  &__event-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__event-title {
    color: $color-text;
    font-size: 30rpx;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__event-count {
    color: $color-primary-dark;
    font-size: 24rpx;
    font-weight: 700;
    white-space: nowrap;
  }

  &__milestone {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__milestone-title {
    color: $color-text;
    font-size: 30rpx;
    font-weight: 600;
  }

  &__milestone-main {
    color: $color-primary-dark;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__tabs,
  &__chip-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16rpx;
    margin-bottom: 24rpx;
  }

  &__scene,
  &__chip {
    min-height: 118rpx;
    padding: 20rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    background: $color-card;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    color: $color-text;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__scene--active,
  &__chip--active {
    border-color: $color-primary;
    background: $color-primary;
    color: #ffffff;
    font-weight: 600;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 22rpx;
    margin-bottom: 24rpx;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__input,
  &__picker {
    min-height: 84rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    padding: 0 22rpx;
    background: #fffdfb;
    color: $color-text;
    font-size: 28rpx;
    display: flex;
    align-items: center;
  }

  &__segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8rpx;
    padding: 8rpx;
    border-radius: $radius-md;
    background: #f9eee3;
  }

  &__segmented view {
    padding: 16rpx 10rpx;
    border-radius: $radius-sm;
    text-align: center;
    color: $color-text-secondary;
    font-size: 26rpx;
  }

  &__segmented .active {
    background: #fff;
    color: $color-primary-dark;
    font-weight: 700;
    box-shadow: 0 4rpx 12rpx rgba($color-primary, 0.12);
  }

  &__lunar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18rpx;
  }

  &__lunar-hint {
    grid-column: 1 / -1;
  }

  &__cover {
    min-height: 220rpx;
    border: 2rpx dashed $color-border;
    border-radius: $radius-md;
    overflow: hidden;
    background: #fffdfb;
  }

  &__cover-image-wrap {
    position: relative;
    width: 100%;
    height: 280rpx;
  }

  &__cover-image {
    width: 100%;
    height: 100%;
    display: block;
  }

  &__cover-remove {
    position: absolute;
    top: 12rpx;
    right: 12rpx;
    width: 48rpx;
    height: 48rpx;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__cover-empty {
    min-height: 220rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10rpx;
    color: $color-primary-dark;
  }

  &__card-preview {
    min-height: 760rpx;
    margin-bottom: 28rpx;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    background: linear-gradient(150deg, #fff8f0, #fef5ea);
    border: 2rpx solid $color-border;
  }

  &__card-preview--warm {
    background: linear-gradient(150deg, #fff8f0, #fef5ea);
  }

  &__card-preview--fresh {
    background: linear-gradient(150deg, #eef8f5, #edfaf5);
  }

  &__card-preview--classic {
    background: linear-gradient(150deg, #f6f3ee, #f5f1ea);
  }

  &__card-preview--rose {
    background: linear-gradient(150deg, #fff3f4, #fef0f1);
  }

  &__card-preview--ink {
    background: linear-gradient(150deg, #f7f7f4, #f4f6f2);
  }

  &__card-preview--certificate {
    border: 6rpx double $color-primary;
  }

  &__card-preview--boarding {
    border-radius: 24rpx;
  }

  &__preview-media {
    height: 280rpx;
    border-radius: $radius-md;
    margin-bottom: 24rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  &__preview-media image {
    width: 100%;
    height: 100%;
  }

  &__preview-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    opacity: 0.78;
  }

  &__preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(150deg, rgba(255, 248, 240, 0.42), rgba(255, 255, 255, 0.32));
  }

  &__card-preview--fresh &__preview-overlay {
    background: linear-gradient(150deg, rgba(238, 248, 245, 0.42), rgba(255, 255, 255, 0.32));
  }

  &__card-preview--classic &__preview-overlay {
    background: linear-gradient(150deg, rgba(246, 243, 238, 0.44), rgba(255, 255, 255, 0.34));
  }

  &__card-preview--rose &__preview-overlay {
    background: linear-gradient(150deg, rgba(255, 243, 244, 0.42), rgba(255, 255, 255, 0.32));
  }

  &__card-preview--ink &__preview-overlay {
    background: linear-gradient(150deg, rgba(247, 247, 244, 0.42), rgba(255, 255, 255, 0.32));
  }

  &__card-preview--has-cover {
    position: relative;
  }

  &__card-preview--has-cover &__preview-labels,
  &__card-preview--has-cover &__preview-number,
  &__card-preview--has-cover &__preview-title,
  &__card-preview--has-cover &__preview-copy,
  &__card-preview--has-cover &__preview-date {
    position: relative;
    z-index: 2;
  }

  &__card-preview--photo-bg &__preview-bg {
    opacity: 1;
  }

  &__card-preview--photo-bg &__preview-overlay {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.08) 12%, rgba(0, 0, 0, 0.22) 55%, rgba(0, 0, 0, 0.42) 100%);
  }

  &__card-preview--photo-bg &__preview-label,
  &__card-preview--photo-bg &__preview-number,
  &__card-preview--photo-bg &__preview-title,
  &__card-preview--photo-bg &__preview-copy,
  &__card-preview--photo-bg &__preview-date,
  &__card-preview--photo-bg &__preview-unit {
    position: relative;
    z-index: 2;
    color: #ffffff;
    text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.28);
  }

  &__card-preview--photo-bg &__preview-label {
    background: rgba(255, 255, 255, 0.28);
    color: #ffffff;
  }

  &__preview-labels {
    display: flex;
    gap: 12rpx;
    align-self: flex-start;
    position: relative;
    z-index: 2;
  }

  &__preview-label {
    align-self: flex-start;
    padding: 8rpx 16rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 22rpx;
  }

  &__preview-label--tone {
    background: rgba($color-primary, 0.1);
    color: $color-text-secondary;
  }

  &__preview-number {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
    margin-top: 56rpx;
    color: $color-text;
  }

  &__preview-number > text:first-child {
    font-size: 112rpx;
    font-weight: 700;
    line-height: 1;
  }

  &__preview-unit {
    font-size: 32rpx;
    color: $color-text-secondary;
  }

  &__preview-title {
    margin-top: 24rpx;
    color: $color-text;
    font-size: 42rpx;
    font-weight: 700;
  }

  &__preview-copy {
    margin-top: 20rpx;
    color: $color-text-secondary;
    font-size: 26rpx;
    line-height: 1.6;
  }

  &__preview-date {
    margin-top: 56rpx;
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  /* ---- preview decorations matching exported card ---- */

  &__preview-stamp {
    position: absolute;
    bottom: 280rpx;
    right: 70rpx;
    width: 108rpx;
    height: 108rpx;
    border: 5rpx solid #c0392b;
    border-radius: 50%;
    color: #c0392b;
    font-size: 44rpx;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(-16deg);
    box-shadow: inset 0 0 0 12rpx #fff, inset 0 0 0 16rpx #c0392b;
    z-index: 2;
  }

  &__preview-ring-wrap {
    position: absolute;
    bottom: 340rpx;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  &__preview-ring {
    width: 140rpx;
    height: 140rpx;
    border-radius: 50%;
    border: 14rpx solid $color-border;
    border-top-color: $color-primary;
    transform: rotate(45deg);
  }

  &__preview-ring-text {
    position: absolute;
    color: $color-primary;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__preview-star {
    position: absolute;
    z-index: 2;
    background: $color-primary;
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    opacity: 0.5;
  }

  &__preview-dot {
    position: absolute;
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: $color-primary;
    opacity: 0.45;
    z-index: 2;
  }

  &__tone-row {
    display: flex;
    gap: 14rpx;
    flex-wrap: wrap;
  }

  &__tone {
    min-width: 104rpx;
    padding: 14rpx 22rpx;
    border: 2rpx solid $color-border;
    border-radius: 999rpx;
    background: $color-card;
    text-align: center;
    color: $color-text-secondary;
    font-size: 24rpx;
    display: flex;
    flex-direction: column;
    gap: 2rpx;
  }

  &__tone--active {
    border-color: $color-primary;
    background: $color-primary;
    color: #ffffff;
    font-weight: 600;
  }

  &__tone--active .caption {
    color: rgba(255, 255, 255, 0.75);
  }

  &__delete {
    margin: 48rpx 0 36rpx;
    padding: 24rpx 0;
    border: 2rpx solid $color-danger;
    border-radius: $radius-md;
    color: $color-danger;
    font-size: 28rpx;
    font-weight: 600;
    text-align: center;
  }

  &__export-canvas {
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 1px;
    height: 1px;
  }
}
</style>
