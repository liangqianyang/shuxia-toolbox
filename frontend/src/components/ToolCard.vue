<template>
  <view class="tool-card card">
    <view class="tool-card__icon">{{ icon }}</view>
    <view class="tool-card__body">
      <text class="tool-card__title">{{ title }}</text>
      <text class="tool-card__desc">{{ description }}</text>
    </view>
    <view class="tool-card__arrow">›</view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description: string
}>()
</script>

<style lang="scss" scoped>
.tool-card {
  display: flex;
  align-items: center;
  gap: 28rpx;

  &__icon {
    width: 96rpx;
    height: 96rpx;
    border-radius: $radius-md;
    background-color: $color-primary-light;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 52rpx;
    flex-shrink: 0;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: $font-title;
    font-weight: 600;
    color: $color-text;
  }

  &__desc {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__arrow {
    font-size: 48rpx;
    color: $color-text-secondary;
    flex-shrink: 0;
  }
}
</style>
