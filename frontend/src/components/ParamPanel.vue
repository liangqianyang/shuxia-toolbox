<template>
  <view class="param-panel card">
    <view class="param-panel__row">
      <text class="section-title">拼板规格</text>
      <view class="param-panel__options">
        <view
          v-for="preset in BOARD_PRESETS"
          :key="preset.key"
          class="param-panel__chip"
          :class="{ 'param-panel__chip--active': params.boardPresetKey === preset.key }"
          @tap="setBoardPreset(preset.key)"
        >
          {{ preset.label }}
        </view>
      </view>
      <text class="caption">默认自动按内容定格（见下）；也可手动指定板数</text>
    </view>

    <view v-if="params.boardPresetKey === 'auto'" class="param-panel__row">
      <view class="param-panel__inline-head">
        <view class="param-panel__switch-label">
          <text class="section-title">格子大小</text>
          <text class="caption">自动按内容定；复杂图（多部件/小细节）可关掉自动、手动调大</text>
        </view>
        <switch
          :checked="params.autoGridSize"
          :disabled="disabled"
          color="#C8956C"
          @change="onAutoGridChange"
        />
      </view>
      <view v-if="!params.autoGridSize" class="param-panel__slider-wrap">
        <text class="caption">长边 {{ params.gridLongSide }} 格</text>
        <slider
          :min="30"
          :max="104"
          :step="2"
          :value="params.gridLongSide"
          :disabled="disabled"
          activeColor="#C8956C"
          block-size="24"
          @change="onGridLongSideChange"
        />
      </view>
    </view>

    <view class="param-panel__row">
      <text class="section-title">色卡</text>
      <picker
        mode="selector"
        :range="paletteLabels"
        :value="paletteIndex"
        :disabled="disabled"
        @change="onPaletteChange"
      >
        <view class="param-panel__picker">
          <text>{{ paletteLabels[paletteIndex] }}</text>
          <text class="param-panel__picker-arrow">▾</text>
        </view>
      </picker>
    </view>

    <view class="param-panel__row param-panel__row--inline">
      <view class="param-panel__switch-label">
        <text class="section-title">去除背景</text>
        <text class="caption">清除边缘纯色/透明背景（白/浅色主体建议关闭）</text>
      </view>
      <switch
        :checked="params.removeBackground"
        :disabled="disabled"
        color="#C8956C"
        @change="onRemoveBackgroundChange"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BoardPresetKey, PatternParams } from '@/types/beads'
import { BOARD_PRESETS } from '@/types/beads'
import { PALETTE_OPTIONS } from '@/utils/beadPalette'

const props = defineProps<{
  params: PatternParams
  disabled?: boolean
}>()

const emit = defineEmits<{
  change: []
}>()

const paletteLabels = PALETTE_OPTIONS.map((option) => option.label)
const paletteIndex = computed(() =>
  Math.max(0, PALETTE_OPTIONS.findIndex((option) => option.key === props.params.paletteKey)),
)

function setBoardPreset(key: BoardPresetKey) {
  if (props.disabled) return
  props.params.boardPresetKey = key
  emit('change')
}

function onPaletteChange(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  props.params.paletteKey = PALETTE_OPTIONS[index]?.key ?? 'mard-221'
  emit('change')
}

// <switch> 与 SVG 同名标签类型冲突，事件参数手动标注
function onRemoveBackgroundChange(event: unknown) {
  props.params.removeBackground = (event as { detail: { value: boolean } }).detail.value
  emit('change')
}

function onAutoGridChange(event: unknown) {
  props.params.autoGridSize = (event as { detail: { value: boolean } }).detail.value
  emit('change')
}

function onGridLongSideChange(event: { detail: { value: number } }) {
  props.params.gridLongSide = event.detail.value
  emit('change')
}
</script>

<style lang="scss" scoped>
.param-panel {
  display: flex;
  flex-direction: column;
  gap: 40rpx;

  &__row {
    display: flex;
    flex-direction: column;
    gap: 20rpx;

    &--inline {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }

  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  &__chip {
    padding: 12rpx 28rpx;
    border-radius: 999rpx;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-caption;
    color: $color-text-secondary;
    transition: all 0.15s;

    &--active {
      background-color: $color-primary;
      border-color: $color-primary;
      color: #ffffff;
      font-weight: 600;
    }
  }

  &__picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20rpx 28rpx;
    border-radius: $radius-md;
    background-color: $color-bg;
    border: 2rpx solid $color-border;
    font-size: $font-body;
  }

  &__picker-arrow {
    color: $color-text-secondary;
  }

  &__switch-label {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__inline-head {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  &__slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }
}
</style>
