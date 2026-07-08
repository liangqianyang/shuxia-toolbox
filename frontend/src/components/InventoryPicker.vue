<template>
  <view class="inv card">
    <view class="inv__head">
      <text class="section-title">我的库存</text>
      <text class="caption">已选 {{ ownedCount }} / {{ colors.length }} 色</text>
    </view>
    <view class="inv__bulk">
      <view class="inv__bulk-btn" @tap="onSelectAll">全选</view>
      <view class="inv__bulk-btn" @tap="onClear">清空</view>
    </view>
    <scroll-view class="inv__scroll" scroll-y enhanced>
      <view class="inv__grid">
        <view
          v-for="c in colors"
          :key="c.code"
          class="inv__swatch"
          :class="{ 'inv__swatch--on': owned.has(c.code) }"
          :style="{ backgroundColor: c.hex, color: textColorOn(c.rgb) }"
          @tap="onToggle(c.code)"
        >
          <text class="inv__code">{{ displayCode(c.code) }}</text>
          <text v-if="owned.has(c.code)" class="inv__check">✓</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PaletteKey } from '@/types/beads'
import { getPalette } from '@/utils/beadPalette'
import { useBeadInventory } from '@/composables/useBeadInventory'
import { textColorOn } from '@/utils/color'
import { displayCode } from '@/utils/format'

const props = defineProps<{
  paletteKey: PaletteKey
}>()

const emit = defineEmits<{
  change: []
}>()

const { ownedCodes, ownedCount, toggle, selectAll, clear, ensureLoaded } = useBeadInventory()

ensureLoaded(props.paletteKey)

const colors = computed(() => getPalette(props.paletteKey).colors)
const owned = computed(() => ownedCodes.value)

function onToggle(code: string) {
  toggle(props.paletteKey, code)
  emit('change')
}

function onSelectAll() {
  selectAll(props.paletteKey)
  emit('change')
}

function onClear() {
  clear(props.paletteKey)
  emit('change')
}
</script>

<style lang="scss" scoped>
.inv {
  display: flex;
  flex-direction: column;
  gap: 20rpx;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__bulk {
    display: flex;
    gap: 16rpx;
  }

  &__bulk-btn {
    padding: 8rpx 28rpx;
    border-radius: 999rpx;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__scroll {
    max-height: 560rpx;
  }

  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__swatch {
    position: relative;
    width: 96rpx;
    height: 64rpx;
    border-radius: $radius-sm;
    border: 4rpx solid rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;

    &--on {
      opacity: 1;
      border-color: $color-primary-dark;
      box-shadow: 0 0 0 2rpx rgba(200, 149, 108, 0.35);
    }
  }

  &__code {
    font-size: 22rpx;
    font-weight: 700;
  }

  &__check {
    position: absolute;
    top: 2rpx;
    right: 6rpx;
    font-size: 20rpx;
    font-weight: 700;
  }
}
</style>
