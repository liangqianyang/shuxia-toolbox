<template>
  <view class="legend card">
    <view class="legend__header">
      <text class="section-title">用豆统计</text>
      <text class="caption">
        {{ activeIndex === null || activeIndex === undefined
          ? `共 ${used.length} 色 · ${totalBeads} 颗 · 点颜色在图上定位`
          : `已选中 ${activeCode} · ${activeCount} 格` }}
      </text>
    </view>
    <view class="legend__list">
      <view
        v-for="item in used"
        :key="item.color.code"
        class="legend__pill"
        :class="{ 'legend__pill--active': item.paletteIndex === activeIndex }"
        :style="{ backgroundColor: item.color.hex, color: textColorOn(item.color.rgb) }"
        @tap="onTap(item.paletteIndex)"
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
  /** 当前隔离高亮的色板下标；null/undefined = 无 */
  activeIndex?: number | null
}>()

const emit = defineEmits<{
  select: [paletteIndex: number]
}>()

const totalBeads = computed(() => props.used.reduce((sum, item) => sum + item.count, 0))

const activeItem = computed(() => props.used.find((item) => item.paletteIndex === props.activeIndex))
const activeCode = computed(() => (activeItem.value ? displayCode(activeItem.value.color.code) : ''))
const activeCount = computed(() => activeItem.value?.count ?? 0)

function onTap(paletteIndex: number) {
  emit('select', paletteIndex)
}
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

    &--active {
      // 隔离高亮选中：加粗主色描边 + 轻微上浮，与图纸里的暗纱聚焦呼应
      border: 4rpx solid $color-primary-dark;
      box-shadow: 0 0 0 4rpx rgba(200, 149, 108, 0.3);
      transform: translateY(-2rpx);
    }
  }
}
</style>
