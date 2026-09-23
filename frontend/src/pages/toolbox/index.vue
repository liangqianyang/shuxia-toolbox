<template>
  <view class="toolbox">
    <view class="toolbox__pagehead">
      <text class="toolbox__kick">TOOLBOX</text>
      <text class="toolbox__title">工具箱</text>
      <text class="toolbox__sub">{{ tools.length }} 个已上架工具</text>
    </view>

    <AppSection v-if="tools.length" card>
      <ToolCard
        v-for="(tool, index) in tools"
        :key="tool.key"
        :icon="tool.icon"
        :pastel="tool.key"
        :title="tool.name"
        :description="toolDescription(tool)"
        :badge="toolBadge(tool)"
        :divided="index > 0"
        pressable
        @tap="openTool(tool)"
      >
        <template #right>
          <text v-if="selectedKeys.includes(tool.key)" class="tag tag--blue">已在首页</text>
        </template>
      </ToolCard>
    </AppSection>

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
import AppSection from '@/components/AppSection.vue'
import ToolCard from '@/components/ToolCard.vue'
import type { ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools } from '@/services/toolbox'
import { fetchAnniversaries } from '@/services/anniversary'
import type { AnniversarySummary } from '@/types/anniversary'
import { summarizeAnniversaries } from '@/utils/anniversary'

const tools = ref<ToolboxTool[]>([])
const selectedKeys = ref<string[]>([])
const anniversarySummary = ref<AnniversarySummary | null>(null)
const loading = ref(true)

onShow(() => {
  void loadTools()
})

async function loadTools() {
  loading.value = true
  try {
    const data = await fetchHomeTools()
    // 工具箱只展示工具类；游戏类在「游戏」tab
    tools.value = data.catalog.filter((item) => item.category !== 'game')
    selectedKeys.value = data.homeToolKeys
    await loadAnniversarySummary()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取工具箱失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openTool(tool: ToolboxTool) {
  uni.navigateTo({ url: tool.route })
}

async function loadAnniversarySummary() {
  anniversarySummary.value = null
  if (!tools.value.some((tool) => tool.key === 'anniversary')) return
  try {
    anniversarySummary.value = summarizeAnniversaries(await fetchAnniversaries())
  } catch (error) {
    console.warn('[toolbox] load anniversary summary failed:', error)
  }
}

function toolDescription(tool: ToolboxTool): string {
  if (tool.key !== 'anniversary' || !anniversarySummary.value) return tool.description
  const summary = anniversarySummary.value
  const parts: string[] = []
  if (summary.todayCount) parts.push(`今天 ${summary.todayCount} 个`)
  if (summary.upcomingCount) parts.push(`7天内 ${summary.upcomingCount} 个`)
  if (summary.nextMilestone) parts.push(`${summary.nextMilestone.remainingDays} 天到 ${summary.nextMilestone.label}`)
  return parts.length ? parts.join(' · ') : tool.description
}

function toolBadge(tool: ToolboxTool): string {
  if (tool.key !== 'anniversary' || !anniversarySummary.value) return ''
  const count = anniversarySummary.value.todayCount + anniversarySummary.value.upcomingCount
  return count > 0 ? String(count) : ''
}
</script>

<style lang="scss" scoped>
.toolbox {
  min-height: 100vh;
  padding: 24rpx 32rpx 200rpx;

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
