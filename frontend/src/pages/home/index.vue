<template>
  <view class="home">
    <view class="home__header">
      <text class="home__title">枫叶小屋的工具箱</text>
      <text class="home__slogan">小工具，慢生活</text>
    </view>
    <view class="home__tools">
      <view v-for="tool in tools" :key="tool.url" class="home__tool-card card" @tap="goTool(tool.url)">
        <view class="home__tool-icon">{{ tool.icon }}</view>
        <view class="home__tool-body">
          <text class="home__tool-title">{{ tool.title }}</text>
          <text class="home__tool-desc">{{ tool.description }}</text>
        </view>
        <view class="home__tool-arrow">›</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const tools = [
  {
    icon: '🧩',
    title: '拼豆图纸生成器',
    description: '上传图片，生成拼豆图纸和用豆量统计',
    url: '/pages/beads/index',
  },
  {
    icon: '🗺️',
    title: '旅游攻略图生成器',
    description: '编辑行程，生成可分享的旅游攻略图',
    url: '/pages/travel/index',
  },
  {
    icon: '🍜',
    title: '今天吃什么',
    description: '选地点和偏好，随机抽一家附近美食或常吃店',
    url: '/pages/food/index',
  },
]

function goTool(url: string) {
  uni.navigateTo({ url })
}
</script>

<style lang="scss" scoped>
.home {
  padding: 48rpx 32rpx;

  &__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    padding: 40rpx 0 64rpx;
  }

  &__title {
    font-size: 44rpx;
    font-weight: 700;
    color: $color-text;
    letter-spacing: 4rpx;
  }

  &__slogan {
    font-size: $font-caption;
    color: $color-text-secondary;
    letter-spacing: 8rpx;
  }

  &__tools {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__tool-card {
    display: flex;
    align-items: center;
    gap: 28rpx;
  }

  &__tool-icon {
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

  &__tool-body {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    flex: 1;
    min-width: 0;
  }

  &__tool-title {
    font-size: $font-title;
    font-weight: 600;
    color: $color-text;
  }

  &__tool-desc {
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__tool-arrow {
    font-size: 48rpx;
    color: $color-text-secondary;
    flex-shrink: 0;
  }
}
</style>
