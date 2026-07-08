<template>
  <view class="shop card">
    <view class="shop__head">
      <text class="section-title">购物清单</text>
      <view class="shop__copy" @tap="onCopy">复制清单</view>
    </view>
    <text class="caption">
      共 {{ used.length }} 色 · {{ totalBeads }} 颗 · 约 {{ totalPacks }} 包（每包约 {{ perPack }} 颗）
    </text>
    <view class="shop__list">
      <view v-for="item in rows" :key="item.code" class="shop__row">
        <view class="shop__dot" :style="{ backgroundColor: item.hex }" />
        <text class="shop__code">{{ item.code }}</text>
        <text class="shop__count">{{ item.count }} 颗</text>
        <text class="shop__packs">{{ item.packs }} 包</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UsedColor } from '@/types/beads'
import { BEADS_PER_PACK } from '@/types/beads'
import { displayCode } from '@/utils/format'

const props = defineProps<{
  used: UsedColor[]
}>()

const perPack = BEADS_PER_PACK

const totalBeads = computed(() => props.used.reduce((sum, item) => sum + item.count, 0))

const rows = computed(() =>
  props.used.map((item) => ({
    code: displayCode(item.color.code),
    hex: item.color.hex,
    count: item.count,
    packs: Math.max(1, Math.ceil(item.count / perPack)),
  })),
)

const totalPacks = computed(() => rows.value.reduce((sum, r) => sum + r.packs, 0))

function onCopy() {
  const lines = rows.value.map((r) => `${r.code}  ${r.count}颗  ${r.packs}包`)
  const text =
    `拼豆购物清单\n共${props.used.length}色 · ${totalBeads.value}颗 · 约${totalPacks.value}包\n` +
    lines.join('\n')
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '清单已复制', icon: 'success' }),
    fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
  })
}
</script>

<style lang="scss" scoped>
.shop {
  display: flex;
  flex-direction: column;
  gap: 16rpx;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__copy {
    padding: 8rpx 28rpx;
    border-radius: 999rpx;
    background-color: $color-primary;
    color: #ffffff;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    margin-top: 8rpx;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 10rpx 0;
    border-bottom: 2rpx solid $color-bg;
  }

  &__dot {
    width: 32rpx;
    height: 32rpx;
    border-radius: 50%;
    border: 2rpx solid rgba(0, 0, 0, 0.12);
    flex-shrink: 0;
  }

  &__code {
    width: 120rpx;
    font-size: $font-body;
    font-weight: 600;
  }

  &__count {
    flex: 1;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__packs {
    font-size: $font-caption;
    color: $color-primary-dark;
    font-weight: 600;
  }
}
</style>
