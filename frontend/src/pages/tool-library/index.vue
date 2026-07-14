<template>
  <view class="tool-library">
    <view class="tool-library__heading">
      <text class="tool-library__eyebrow">个人配置</text>
      <text class="tool-library__title">工具集</text>
      <text class="tool-library__subtitle">{{ selectedKeys.length }} 个工具显示在首页</text>
    </view>

    <view v-if="tools.length" class="tool-library__list">
      <view v-for="tool in tools" :key="tool.key" class="tool-library__item">
        <view class="tool-library__icon">{{ tool.icon }}</view>
        <view class="tool-library__copy">
          <text class="tool-library__name">{{ tool.name }}</text>
          <text class="tool-library__desc">{{ tool.description }}</text>
        </view>
        <switch
          :checked="selectedKeys.includes(tool.key)"
          color="#c64f3d"
          @change="toggleTool(tool.key, $event)"
        />
      </view>
    </view>

    <view v-else-if="!loading" class="tool-library__empty">
      <text class="tool-library__empty-icon">🍁</text>
      <text>暂时没有可选择的工具</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import type { ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools, saveHomeTools } from '@/services/toolbox'

type SwitchEvent = { detail: { value: boolean } }

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
    uni.showToast({ title: error instanceof Error ? error.message : '读取工具集失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function toggleTool(toolKey: string, event: Event) {
  const selected = (event as unknown as SwitchEvent).detail.value
  const nextKeys = selected
    ? [...selectedKeys.value, toolKey]
    : selectedKeys.value.filter((key) => key !== toolKey)
  if (nextKeys.length === 0) {
    uni.showToast({ title: '首页至少保留一个工具', icon: 'none' })
    return
  }

  try {
    const data = await saveHomeTools(nextKeys)
    selectedKeys.value = data.homeToolKeys
    uni.showToast({ title: selected ? '已添加到首页' : '已从首页移除', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
}
</script>

<style lang="scss" scoped>
.tool-library {
  min-height: 100vh;
  padding: 48rpx 32rpx 80rpx;

  &__heading {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    padding: 32rpx 0 54rpx;
  }

  &__eyebrow,
  &__subtitle {
    font-size: 24rpx;
    color: $color-text-secondary;
  }

  &__title {
    font-size: 44rpx;
    font-weight: 700;
    color: $color-text;
  }

  &__list {
    display: flex;
    flex-direction: column;
  }

  &__item {
    min-height: 130rpx;
    padding: 18rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    gap: 20rpx;
  }

  &__icon {
    width: 72rpx;
    height: 72rpx;
    border-radius: $radius-sm;
    background: $color-primary-light;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38rpx;
    flex-shrink: 0;
  }

  &__copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__name {
    color: $color-text;
    font-size: 29rpx;
    font-weight: 600;
  }

  &__desc {
    color: $color-text-secondary;
    font-size: 22rpx;
    line-height: 1.45;
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
