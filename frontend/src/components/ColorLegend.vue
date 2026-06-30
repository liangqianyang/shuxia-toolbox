<template>
  <view class="legend card">
    <view class="legend__header">
      <text class="section-title">用豆统计</text>
      <text class="caption">共 {{ used.length }} 色 · {{ totalBeads }} 颗</text>
    </view>
    <view class="legend__list">
      <view
        v-for="item in used"
        :key="item.color.code"
        class="legend__pill"
        :style="{ backgroundColor: item.color.hex, color: textColorOn(item.color.rgb) }"
      >
        {{ displayCode(item.color.code) }} ({{ item.count }})
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UsedColor } from '@/types/beads'
import { textColorOn } from '@/utils/color'
import { displayCode } from '@/utils/format'

const props = defineProps<{
  used: UsedColor[]
}>()

const totalBeads = computed(() => props.used.reduce((sum, item) => sum + item.count, 0))
</script>

<style lang="scss" scoped>
.legend {
  display: flex;
  flex-direction: column;
  gap: 24rpx;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  &__pill {
    padding: 10rpx 24rpx;
    border-radius: $radius-sm;
    border: 2rpx solid rgba(0, 0, 0, 0.12);
    font-size: $font-caption;
    font-weight: 600;
  }
}
</style>
