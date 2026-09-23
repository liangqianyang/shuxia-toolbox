<template>
  <view class="tool-library">
    <view class="tool-library__pagehead">
      <text class="tool-library__kick">PERSONAL</text>
      <text class="tool-library__title">工具集</text>
      <text class="tool-library__sub">{{ selectedKeys.length }} 个工具显示在首页</text>
    </view>

    <template v-if="groups.length">
      <AppSection v-for="group in groups" :key="group.category" :title="group.title" card>
        <ToolCard
          v-for="(tool, index) in group.tools"
          :key="tool.key"
          :icon="tool.icon"
          :pastel="tool.key"
          :title="tool.name"
          :description="tool.description"
          size="sm"
          :chevron="false"
          :divided="index > 0"
        >
          <template #right>
            <switch
              :checked="selectedKeys.includes(tool.key)"
              color="#58A6DC"
              @change="toggleTool(tool.key, $event)"
            />
          </template>
        </ToolCard>
      </AppSection>
    </template>

    <view v-else-if="!loading" class="tool-library__empty">
      <text class="tool-library__empty-icon">🍁</text>
      <text>暂时没有可选择的工具</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import type { ToolCategory, ToolboxTool } from '@/types/toolbox'
import AppSection from '@/components/AppSection.vue'
import ToolCard from '@/components/ToolCard.vue'
import { fetchHomeTools, saveHomeTools } from '@/services/toolbox'

type SwitchEvent = { detail: { value: boolean } }

const CATEGORY_TITLES: Record<ToolCategory, string> = { tool: '工具', game: '游戏' }

const tools = ref<ToolboxTool[]>([])
const selectedKeys = ref<string[]>([])
const loading = ref(true)

/** 按 工具/游戏 分组展示，组内保持目录排序 */
const groups = computed(() =>
  (Object.keys(CATEGORY_TITLES) as ToolCategory[])
    .map((category) => ({
      category,
      title: CATEGORY_TITLES[category],
      tools: tools.value.filter((tool) => (tool.category || 'tool') === category),
    }))
    .filter((group) => group.tools.length > 0),
)

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
  padding: 24rpx 32rpx 80rpx;

  &__pagehead {
    display: flex;
    flex-direction: column;
    padding: 20rpx 4rpx 8rpx;
  }

  &__kick {
    font-size: 20rpx;
    letter-spacing: 5rpx;
    color: $blue-deep;
    font-weight: 700;
    margin-bottom: 8rpx;
  }

  &__title {
    font-size: 46rpx;
    font-weight: 700;
    color: $ink;
    line-height: 1.2;
  }

  &__sub {
    font-size: 24rpx;
    color: $ink2;
    margin-top: 10rpx;
  }

  &__empty {
    min-height: 360rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16rpx;
    color: $ink2;
    font-size: 26rpx;
  }

  &__empty-icon {
    font-size: 44rpx;
  }
}
</style>
