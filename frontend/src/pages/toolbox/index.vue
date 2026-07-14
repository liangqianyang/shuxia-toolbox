<template>
  <view class="toolbox">
    <view class="toolbox__heading">
      <text class="toolbox__eyebrow">枫叶小屋</text>
      <text class="toolbox__title">工具箱</text>
      <text class="toolbox__subtitle">{{ tools.length }} 个已上架工具</text>
    </view>

    <view v-if="tools.length" class="toolbox__list">
      <view v-for="tool in tools" :key="tool.key" class="toolbox__card card" @tap="openTool(tool)">
        <view class="toolbox__icon">{{ tool.icon }}</view>
        <view class="toolbox__copy">
          <view class="toolbox__name-row">
            <text class="toolbox__name">{{ tool.name }}</text>
            <text v-if="selectedKeys.includes(tool.key)" class="toolbox__selected">已在首页</text>
          </view>
          <text class="toolbox__description">{{ tool.description }}</text>
        </view>
        <text class="toolbox__arrow">›</text>
      </view>
    </view>

    <view v-else-if="!loading" class="toolbox__empty">
      <text class="toolbox__empty-icon">🍁</text>
      <text>暂时没有可用工具</text>
    </view>
    <AppBottomNav active="toolbox" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppBottomNav from '@/components/AppBottomNav.vue'
import type { ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools } from '@/services/toolbox'

const tools = ref<ToolboxTool[]>([])
const selectedKeys = ref<string[]>([])
const loading = ref(true)

onShow(() => {
  void loadTools()
})

async function loadTools() {
  loading.value = true
  try {
    const data = await fetchHomeTools()
    tools.value = data.catalog
    selectedKeys.value = data.homeToolKeys
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取工具箱失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openTool(tool: ToolboxTool) {
  uni.navigateTo({ url: tool.route })
}
</script>

<style lang="scss" scoped>
.toolbox {
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
