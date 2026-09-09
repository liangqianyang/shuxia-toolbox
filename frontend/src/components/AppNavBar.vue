<!-- 自定义导航栏：状态栏占位 + 返回箭头 + 可选标题。
     页面需在 pages.json 开 "navigationStyle": "custom"；返回逻辑不内聚——
     页内多面板的页面先回主面板，顶级页面 navigateBack，由 @back 自己决定。 -->
<template>
  <view class="app-navbar" :style="bleed ? { margin: `0 -${bleed}rpx` } : undefined">
    <view class="app-navbar__status" :style="{ height: statusBarHeight + 'px' }" />
    <view class="app-navbar__row">
      <view class="app-navbar__back" hover-class="press" @tap="emit('back')">
        <view class="app-navbar__chevron" />
      </view>
      <text v-if="title" class="app-navbar__title">{{ title }}</text>
      <view class="app-navbar__right">
        <slot name="right" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  /** 导航栏标题（可选，页面有自己的大标题时留空） */
  title?: string
  /** 负边距出血值（rpx）：页面有水平 padding 时传同值让导航栏满幅，默认不出血 */
  bleed?: number
}>(), { title: '', bleed: 0 })

const emit = defineEmits<{ (e: 'back'): void }>()

const statusBarHeight = (() => {
  try {
    return uni.getSystemInfoSync().statusBarHeight || 44
  } catch {
    return 44
  }
})()
</script>

<style lang="scss" scoped>
.app-navbar {
  &__row {
    height: 88rpx;
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: 0 $space-3;
  }

  &__back {
    width: 64rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-pill;
    background: $color-primary-light;
  }

  &__chevron {
    width: 18rpx;
    height: 18rpx;
    border-left: 4rpx solid $color-text;
    border-bottom: 4rpx solid $color-text;
    transform: rotate(45deg);
    margin-left: 6rpx;
  }

  &__title {
    font-size: $font-title;
    font-weight: 600;
    color: $color-text;
  }

  &__right {
    margin-left: auto;
  }
}
</style>
