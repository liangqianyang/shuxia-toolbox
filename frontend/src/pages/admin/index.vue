<template>
  <view class="admin">
    <view class="admin__heading">
      <text class="admin__eyebrow">运营管理</text>
      <text class="admin__title">工具运营台</text>
      <text class="admin__subtitle">上架工具会出现在用户的工具集中</text>
    </view>

    <view v-if="tools.length" class="admin__list">
      <view v-for="(tool, index) in tools" :key="tool.key" class="admin__tool">
        <view class="admin__tool-top">
          <view class="admin__icon">{{ tool.icon }}</view>
          <view class="admin__copy">
            <text class="admin__name">{{ tool.name }}</text>
            <text class="admin__desc">{{ tool.description }}</text>
          </view>
          <switch :checked="tool.isPublished" color="#c64f3d" @change="changePublication(tool.key, $event)" />
        </view>
        <view class="admin__tool-bottom">
          <text class="admin__status" :class="{ 'admin__status--off': !tool.isPublished }">{{ tool.isPublished ? '已上架' : '已下架' }}</text>
          <view class="admin__order">
            <view class="admin__order-btn" :class="{ 'admin__order-btn--disabled': index === 0 }" @tap="moveTool(index, -1)">↑</view>
            <view class="admin__order-btn" :class="{ 'admin__order-btn--disabled': index === tools.length - 1 }" @tap="moveTool(index, 1)">↓</view>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="accessError" class="admin__empty">
      <text class="admin__empty-icon">🍁</text>
      <text>{{ accessError }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import type { AdminTool } from '@/types/toolbox'
import { fetchAdminTools, saveAdminToolOrder, setAdminToolPublication } from '@/services/toolbox'

type SwitchEvent = { detail: { value: boolean } }

const tools = ref<AdminTool[]>([])
const accessError = ref('')

onShow(() => {
  void loadTools()
})

async function loadTools() {
  accessError.value = ''
  try {
    tools.value = await fetchAdminTools()
  } catch (error) {
    accessError.value = error instanceof Error ? error.message : '读取运营工具失败'
  }
}

async function changePublication(toolKey: string, event: Event) {
  try {
    const updated = await setAdminToolPublication(toolKey, (event as unknown as SwitchEvent).detail.value)
    const index = tools.value.findIndex((tool) => tool.key === toolKey)
    if (index >= 0) tools.value.splice(index, 1, updated)
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '更新失败', icon: 'none' })
    await loadTools()
  }
}

async function moveTool(index: number, direction: number) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= tools.value.length) return
  const nextTools = [...tools.value]
  const [tool] = nextTools.splice(index, 1)
  nextTools.splice(nextIndex, 0, tool)
  tools.value = nextTools
  try {
    tools.value = await saveAdminToolOrder(nextTools.map((item) => item.key))
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存排序失败', icon: 'none' })
    await loadTools()
  }
}
</script>

<style lang="scss" scoped>
.admin {
  min-height: 100vh;
  padding: 48rpx 32rpx 80rpx;

  &__heading {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    padding: 32rpx 0 54rpx;
  }

  &__eyebrow,
  &__subtitle,
  &__desc {
    color: $color-text-secondary;
    font-size: 22rpx;
  }

  &__title {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  &__list {
    display: flex;
    flex-direction: column;
  }

  &__tool {
    padding: 22rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__tool-top,
  &__tool-bottom,
  &__order {
    display: flex;
    align-items: center;
  }

  &__tool-top {
    gap: 18rpx;
  }

  &__tool-bottom {
    justify-content: space-between;
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
    min-width: 0;
    flex: 1;
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
    line-height: 1.45;
  }

  &__status {
    color: #4f7658;
    font-size: 23rpx;
  }

  &__status--off {
    color: $color-text-secondary;
  }

  &__order {
    gap: 8rpx;
  }

  &__order-btn {
    width: 56rpx;
    height: 52rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    color: $color-primary;
    font-size: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  &__order-btn--disabled {
    color: $color-border;
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
    text-align: center;
  }

  &__empty-icon {
    font-size: 44rpx;
  }
}
</style>
