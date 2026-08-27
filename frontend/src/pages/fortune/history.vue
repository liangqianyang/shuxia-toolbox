<template>
  <view class="history">
    <view v-if="items.length === 0 && !loading" class="history__empty">
      <text class="history__empty-icon">🎋</text>
      <text class="history__empty-text">还没有抽过签，去抽今日第一签吧</text>
      <button class="history__empty-btn" @tap="goDraw">去抽签</button>
    </view>

    <view v-else class="history__list">
      <view v-for="item in items" :key="item.drawId" class="history__item card" @tap="toggle(item.drawId)">
        <view class="history__item-head">
          <view class="history__item-title-row">
            <text class="history__item-deck" :style="{ color: deckColor(item.deck) }">{{ item.deckName }}</text>
            <text v-if="item.stick.level" class="history__item-level" :style="{ background: sealColor(item.stick.level) }">{{ item.stick.level }}</text>
          </view>
          <text class="history__item-date">{{ formatDate(item.createdAt) }}</text>
        </view>

        <text class="history__item-summary">{{ summaryOf(item) }}</text>
        <text v-if="item.question" class="history__item-question">所问：{{ item.question }}</text>

        <!-- 展开详情 -->
        <view v-if="expanded === item.drawId" class="history__detail">
          <template v-if="item.deck !== 'book'">
            <view class="history__verse">
              <text v-for="(line, i) in item.stick.verse" :key="i" class="history__verse-line">{{ line }}</text>
            </view>
            <text v-if="item.stick.interpretation" class="history__detail-text">{{ item.stick.interpretation }}</text>
          </template>
          <template v-if="item.reading">
            <view class="history__reading">
              <text class="history__reading-label">签意</text>
              <text class="history__detail-text">{{ item.reading.meaning }}</text>
              <text class="history__reading-label">对你所问</text>
              <text class="history__detail-text">{{ item.reading.forYou }}</text>
              <text class="history__reading-label">行动建议</text>
              <text class="history__detail-text">{{ item.reading.action }}</text>
              <text class="history__reading-lucky">✦ {{ item.reading.luckyHint }}</text>
            </view>
          </template>
        </view>
      </view>

      <view v-if="hasMore" class="history__more" @tap="loadMore">
        <text class="history__more-text">{{ loading ? '加载中…' : '加载更多' }}</text>
      </view>
      <text v-else-if="items.length > 0" class="history__end">—— 到底啦 ——</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { fetchFortuneHistory } from '@/composables/useFortune'
import { DECK_THEMES, levelSeal } from '@/utils/fortune/theme'
import type { FortuneHistoryItem } from '@/types/fortune'

const items = ref<FortuneHistoryItem[]>([])
const page = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const expanded = ref<number | null>(null)

onShow(() => {
  items.value = []
  page.value = 0
  void loadMore()
})

async function loadMore(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    const result = await fetchFortuneHistory(page.value + 1)
    items.value = [...items.value, ...result.items]
    page.value = result.page
    hasMore.value = result.hasMore
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function toggle(drawId: number): void {
  expanded.value = expanded.value === drawId ? null : drawId
}

function summaryOf(item: FortuneHistoryItem): string {
  if (item.deck === 'book') return `书中回答：${item.stick.answer ?? ''}`
  const title = item.stick.title ? ` · ${item.stick.title}` : ''
  return `第 ${item.stick.no} 签${title}${item.stick.gist ? `（${item.stick.gist}）` : ''}`
}

function deckColor(deck: string): string {
  return DECK_THEMES[deck as keyof typeof DECK_THEMES]?.primary ?? '#4a3f35'
}

function sealColor(level: string): string {
  return levelSeal(level).color
}

function formatDate(raw: string): string {
  return raw.slice(5, 16)
}

function goDraw(): void {
  uni.navigateBack({ delta: 1 })
}
</script>

<style lang="scss" scoped>
.history {
  min-height: 100vh;
  padding: 32rpx;

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 200rpx;
  }

  &__empty-icon { font-size: 88rpx; }
  &__empty-text { color: $color-text-secondary; font-size: 28rpx; margin: 24rpx 0 40rpx; }

  &__empty-btn {
    border-radius: 999rpx;
    background: $color-primary;
    color: #fff;
    font-size: 28rpx;
    padding: 0 64rpx;

    &::after { border: none; }
  }

  &__list { display: flex; flex-direction: column; gap: 24rpx; }

  &__item { padding: 28rpx 32rpx; }

  &__item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__item-title-row { display: flex; align-items: center; gap: 16rpx; }

  &__item-deck {
    font-size: 30rpx;
    font-weight: 700;
    font-family: "Songti SC", "STSong", serif;
  }

  &__item-level {
    color: #fff;
    font-size: 20rpx;
    border-radius: 8rpx;
    padding: 4rpx 12rpx;
  }

  &__item-date { font-size: 22rpx; color: $color-text-secondary; font-variant-numeric: tabular-nums; }

  &__item-summary { display: block; font-size: 28rpx; color: $color-text; margin-top: 12rpx; }

  &__item-question { display: block; font-size: 24rpx; color: $color-text-secondary; margin-top: 8rpx; }

  &__detail {
    margin-top: 20rpx;
    border-top: 2rpx solid $color-border;
    padding-top: 20rpx;
  }

  &__verse { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 16rpx; }

  &__verse-line {
    font-size: 30rpx;
    font-family: "Songti SC", "STSong", serif;
    text-align: center;
    letter-spacing: 4rpx;
    color: $color-text;
  }

  &__detail-text { display: block; font-size: 26rpx; color: $color-text-secondary; line-height: 1.8; margin-bottom: 12rpx; }

  &__reading { margin-top: 8rpx; }

  &__reading-label { display: block; font-size: 24rpx; color: $color-primary-dark; font-weight: 600; margin: 8rpx 0 4rpx; }

  &__reading-lucky { display: block; font-size: 26rpx; color: #A67C00; margin-top: 12rpx; }

  &__more { text-align: center; padding: 24rpx 0; }
  &__more-text { font-size: 26rpx; color: $color-primary-dark; }

  &__end {
    display: block;
    text-align: center;
    font-size: 24rpx;
    color: $color-text-secondary;
    padding: 24rpx 0;
  }
}
</style>
