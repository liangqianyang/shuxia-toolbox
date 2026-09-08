<!-- 空态：icon（emoji）+ 标题 + 说明 + 默认插槽（放动作按钮）。
     inline = 页面中部的小空态（浅高度），否则整屏空态。 -->
<template>
  <view class="app-empty" :class="{ 'app-empty--inline': inline }">
    <text v-if="icon" class="app-empty__icon">{{ icon }}</text>
    <text class="app-empty__title">{{ title }}</text>
    <text v-if="hint" class="app-empty__hint">{{ hint }}</text>
    <slot />
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  hint?: string
  /** 页面中部小空态（200rpx 高），默认整屏空态（360rpx） */
  inline?: boolean
}>(), { icon: '', hint: '', inline: false })
</script>

<style lang="scss" scoped>
.app-empty {
  min-height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $space-2;
  color: $color-text-secondary;
  text-align: center;

  &--inline {
    min-height: 200rpx;
  }

  &__icon {
    font-size: 56rpx;
    line-height: 1;
  }

  &__title {
    color: $color-text;
    font-size: 34rpx;
    font-weight: 700;
  }

  &__hint {
    font-size: $font-caption;
    color: $color-text-secondary;
  }
}
</style>
