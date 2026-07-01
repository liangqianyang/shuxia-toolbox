<template>
  <view class="home">
    <view class="home__header">
      <text class="home__title">枫叶小屋的工具箱</text>
      <text class="home__slogan">小工具，慢生活</text>
    </view>
    <view class="home__tools">
      <ToolCard
        icon="🧩"
        title="拼豆图纸生成器"
        description="上传图片，生成拼豆图纸和用豆量统计"
        @tap="goBeads"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import ToolCard from '@/components/ToolCard.vue'

function goBeads() {
  uni.navigateTo({ url: '/pages/beads/index' })
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
}
</style>
