<template>
  <view class="games">
    <view class="games__heading">
      <text class="games__eyebrow">枫叶小屋</text>
      <text class="games__title">游戏</text>
      <text class="games__subtitle">{{ games.length }} 个已上架游戏</text>
    </view>

    <view v-if="games.length" class="games__list">
      <view v-for="game in games" :key="game.key" class="games__card card" @tap="openGame(game)">
        <ToolIcon class="games__icon" :icon="game.icon" />
        <view class="games__copy">
          <view class="games__name-row">
            <text class="games__name">{{ game.name }}</text>
            <text v-if="selectedKeys.includes(game.key)" class="games__selected">已在首页</text>
          </view>
          <text class="games__description">{{ game.description }}</text>
        </view>
        <text class="games__arrow">›</text>
      </view>
    </view>

    <view v-else-if="!loading" class="games__empty">
      <text class="games__empty-icon">🎮</text>
      <text>暂时没有可用游戏</text>
    </view>
    <AppBottomNav active="games" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppBottomNav from '@/components/AppBottomNav.vue'
import ToolIcon from '@/components/ToolIcon.vue'
import type { ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools } from '@/services/toolbox'

const games = ref<ToolboxTool[]>([])
const selectedKeys = ref<string[]>([])
const loading = ref(true)

onShow(() => {
  void loadGames()
})

async function loadGames() {
  loading.value = true
  try {
    const data = await fetchHomeTools()
    games.value = data.catalog.filter((item) => item.category === 'game')
    selectedKeys.value = data.homeToolKeys
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取游戏列表失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openGame(game: ToolboxTool) {
  uni.navigateTo({ url: game.route })
}
</script>

<style lang="scss" scoped>
.games {
  min-height: 100vh;
  padding: 48rpx 32rpx 180rpx;

  &__heading {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    padding: 40rpx 0 56rpx;
  }

  &__eyebrow,
  &__subtitle {
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__title {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }

  &__card {
    display: flex;
    align-items: center;
    gap: 24rpx;
  }

  &__icon {
    width: 88rpx;
    height: 88rpx;
    border-radius: $radius-md;
    background: $color-primary-light;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 46rpx;
    flex-shrink: 0;
  }

  &__copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 9rpx;
  }

  &__name-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    color: $color-text;
    font-size: 30rpx;
    font-weight: 600;
  }

  &__selected {
    padding: 5rpx 10rpx;
    border-radius: $radius-sm;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 20rpx;
    flex-shrink: 0;
  }

  &__description {
    color: $color-text-secondary;
    font-size: 22rpx;
    line-height: 1.45;
  }

  &__arrow {
    color: $color-text-secondary;
    font-size: 46rpx;
    flex-shrink: 0;
  }

  &__empty {
    min-height: 360rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16rpx;
    color: $color-text-secondary;
    font-size: 26rpx;
  }

  &__empty-icon {
    font-size: 44rpx;
  }
}
</style>
