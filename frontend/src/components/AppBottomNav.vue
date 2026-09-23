<template>
  <view class="bottom-nav">
    <view
      v-for="item in items"
      :key="item.id"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': active === item.id }"
      hover-class="press"
      @tap="go(item.id)"
    >
      <text class="bottom-nav__icon">{{ item.icon }}</text>
      <text class="bottom-nav__label">{{ item.label }}</text>
      <text class="bottom-nav__dot" />
    </view>
  </view>
</template>

<script setup lang="ts">
type NavItemId = 'home' | 'toolbox' | 'games' | 'mine'

defineProps<{ active: NavItemId }>()

const items: Array<{ id: NavItemId, label: string, icon: string, path: string }> = [
  { id: 'home', label: '首页', icon: '⌂', path: '/pages/home/index' },
  { id: 'toolbox', label: '工具箱', icon: '▦', path: '/pages/toolbox/index' },
  { id: 'games', label: '游戏', icon: '♟', path: '/pages/games/index' },
  { id: 'mine', label: '我的', icon: '◉', path: '/pages/mine/index' },
]

function go(id: NavItemId) {
  const target = items.find((item) => item.id === id)
  if (!target) return
  uni.reLaunch({ url: target.path })
}
</script>

<style lang="scss" scoped>
/* v4 扁平白条：发丝顶线、蓝色选中、文字下小圆点指示；无投影无底色块 */
.bottom-nav {
  position: fixed;
  z-index: 100;
  right: 0;
  bottom: 0;
  left: 0;
  border-top: 2rpx solid $line;
  background: #fff;
  padding: 14rpx 16rpx calc(14rpx + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  box-sizing: border-box;

  &__item {
    padding: 8rpx 0 2rpx;
    color: $ink3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    box-sizing: border-box;
  }

  &__item--active {
    color: $blue-deep;
  }

  &__icon {
    height: 42rpx;
    font-size: 42rpx;
    line-height: 1;
  }

  &__label {
    font-size: 20rpx;
    font-weight: 500;
  }

  &__dot {
    width: 8rpx;
    height: 8rpx;
    border-radius: 4rpx;
    background: transparent;
  }

  &__item--active &__dot {
    background: $blue;
  }
}
</style>
