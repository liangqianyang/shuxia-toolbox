<template>
  <view class="bottom-nav">
    <view
      v-for="item in items"
      :key="item.id"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': active === item.id }"
      @tap="go(item.id)"
    >
      <text class="bottom-nav__icon">{{ item.icon }}</text>
      <text class="bottom-nav__label">{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
type NavItemId = 'home' | 'toolbox' | 'mine'

defineProps<{ active: NavItemId }>()

const items: Array<{ id: NavItemId, label: string, icon: string, path: string }> = [
  { id: 'home', label: '首页', icon: '⌂', path: '/pages/home/index' },
  { id: 'toolbox', label: '工具箱', icon: '▦', path: '/pages/toolbox/index' },
  { id: 'mine', label: '我的', icon: '◉', path: '/pages/mine/index' },
]

function go(id: NavItemId) {
  const target = items.find((item) => item.id === id)
  if (!target) return
  uni.reLaunch({ url: target.path })
}
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  z-index: 100;
  right: 0;
  bottom: 0;
  left: 0;
  min-height: 126rpx;
  padding: 12rpx 28rpx calc(12rpx + env(safe-area-inset-bottom));
  border-top: 2rpx solid $color-border;
  background: #fffdf9;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  box-shadow: 0 -8rpx 24rpx rgba(168, 116, 75, 0.08);
  box-sizing: border-box;

  &__item {
    min-height: 90rpx;
    padding: 10rpx 8rpx;
    border-radius: $radius-md;
    color: $color-text-secondary;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6rpx;
    box-sizing: border-box;
  }

  &__item--active {
    background: $color-primary-light;
    color: $color-primary-dark;
  }

  &__icon {
    height: 38rpx;
    font-size: 38rpx;
    line-height: 1;
  }

  &__label {
    font-size: 24rpx;
    font-weight: 600;
  }
}
</style>
