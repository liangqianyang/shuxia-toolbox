<template>
  <view class="admin">
    <view class="admin__pagehead">
      <text class="admin__kick">ADMIN</text>
      <text class="admin__title">工具运营台</text>
      <text class="admin__sub">上架工具会出现在用户的工具集中</text>
    </view>

    <!-- 全局功能开关：AI 关闭时服务端硬拦截所有 AI 接口，前端同步隐藏入口 -->
    <AppSection v-if="!accessError" title="功能开关" card>
      <view v-for="(flag, index) in flags" :key="flag.key" class="admin__flag" :class="{ 'admin__flag--divided': index > 0 }">
        <view class="admin__flag-chip" :style="{ background: flag.chipBg, color: flag.chipFg }">{{ flag.icon }}</view>
        <view class="admin__flag-body">
          <text class="admin__flag-name">{{ flag.name }}</text>
          <text class="admin__flag-desc">{{ flag.desc }}</text>
        </view>
        <switch :checked="flag.value" color="#58A6DC" @change="flag.onChange" />
      </view>
    </AppSection>

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
            <switch :checked="tool.isPublished" color="#58A6DC" @change="changePublication(tool.key, $event)" />
          </template>
          <template #bottom>
            <view class="admin__tool-bottom">
              <text class="admin__status" :class="{ 'admin__status--off': !tool.isPublished }">
                {{ tool.isPublished ? '已上架' : '已下架' }}
              </text>
              <view class="admin__order">
                <view
                  class="admin__order-btn"
                  :class="{ 'admin__order-btn--disabled': index === 0 }"
                  hover-class="press"
                  @tap="moveTool(tool, -1)"
                >↑</view>
                <view
                  class="admin__order-btn"
                  :class="{ 'admin__order-btn--disabled': index === group.tools.length - 1 }"
                  hover-class="press"
                  @tap="moveTool(tool, 1)"
                >↓</view>
              </view>
            </view>
          </template>
        </ToolCard>
      </AppSection>
    </template>

    <view v-else-if="accessError" class="admin__empty">
      <text class="admin__empty-icon">🍁</text>
      <text>{{ accessError }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import type { AdminTool, ToolCategory } from '@/types/toolbox'
import AppSection from '@/components/AppSection.vue'
import ToolCard from '@/components/ToolCard.vue'
import { fetchAdminFeatures, fetchAdminTools, saveAdminToolOrder, setAdminAiEnabled, setAdminGameRankEnabled, setAdminUnoChatTextEnabled, setAdminToolPublication } from '@/services/toolbox'

type SwitchEvent = { detail: { value: boolean } }

const CATEGORY_TITLES: Record<ToolCategory, string> = { tool: '工具', game: '游戏' }

const tools = ref<AdminTool[]>([])
const aiEnabled = ref(false)
const unoChatTextEnabled = ref(true)
const gameRankEnabled = ref(false)
const accessError = ref('')

/** 按 工具/游戏 分组展示；排序仍在全量列表上进行（sort_order 全局），组内相邻即全局同分类相邻 */
const groups = computed(() =>
  (Object.keys(CATEGORY_TITLES) as ToolCategory[])
    .map((category) => ({
      category,
      title: CATEGORY_TITLES[category],
      tools: tools.value.filter((tool) => (tool.category || 'tool') === category),
    }))
    .filter((group) => group.tools.length > 0),
)

/** 功能开关行（chip 底色照原型 admin 屏：AI 红 tint / 聊天蓝 tint / 榜单琥珀 tint，均属淡彩小方块用途） */
const flags = computed(() => [
  {
    key: 'ai',
    icon: '🤖',
    chipBg: '#FDEFEC',
    chipFg: '#E8806F',
    name: 'AI 功能总开关',
    desc: '控制 AI 解签、AI 行程规划等全部 AI 能力；关闭后所有 AI 接口立即不可用',
    value: aiEnabled.value,
    onChange: changeAiEnabled,
  },
  {
    key: 'chat',
    icon: '💬',
    chipBg: '#E8F3FB',
    chipFg: '#4E97CE',
    name: '牌局文字聊天',
    desc: '枫趣牌局房间的自由文字消息（全部经微信内容审核）；关闭后仅保留快捷句和表情',
    value: unoChatTextEnabled.value,
    onChange: changeUnoChatTextEnabled,
  },
  {
    key: 'rank',
    icon: '🏆',
    chipBg: '#FBF3E0',
    chipFg: '#B7862B',
    name: '游戏排行榜总开关',
    desc: '控制俄罗斯方块/推箱子等全部游戏榜单；关闭后榜单入口隐藏、榜单接口立即不可用，成绩仍正常记录',
    value: gameRankEnabled.value,
    onChange: changeGameRankEnabled,
  },
])

onShow(() => {
  void loadTools()
})

async function loadTools() {
  accessError.value = ''
  try {
    const [toolList, features] = await Promise.all([fetchAdminTools(), fetchAdminFeatures()])
    tools.value = toolList
    aiEnabled.value = features.aiEnabled
    if (typeof features.unoChatTextEnabled === 'boolean') unoChatTextEnabled.value = features.unoChatTextEnabled
    if (typeof features.gameRankEnabled === 'boolean') gameRankEnabled.value = features.gameRankEnabled
  } catch (error) {
    accessError.value = error instanceof Error ? error.message : '读取运营工具失败'
  }
}

async function changeGameRankEnabled(event: Event) {
  const next = (event as unknown as SwitchEvent).detail.value
  try {
    const features = await setAdminGameRankEnabled(next)
    if (typeof features.gameRankEnabled === 'boolean') gameRankEnabled.value = features.gameRankEnabled
    uni.showToast({ title: features.gameRankEnabled ? '游戏排行榜已开启' : '游戏排行榜已关闭', icon: 'none' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '更新失败', icon: 'none' })
    await loadTools()
  }
}

async function changeAiEnabled(event: Event) {
  const next = (event as unknown as SwitchEvent).detail.value
  try {
    const features = await setAdminAiEnabled(next)
    aiEnabled.value = features.aiEnabled
    uni.showToast({ title: features.aiEnabled ? 'AI 功能已开启' : 'AI 功能已关闭', icon: 'none' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '更新失败', icon: 'none' })
    await loadTools()
  }
}

async function changeUnoChatTextEnabled(event: Event) {
  const next = (event as unknown as SwitchEvent).detail.value
  try {
    const features = await setAdminUnoChatTextEnabled(next)
    if (typeof features.unoChatTextEnabled === 'boolean') unoChatTextEnabled.value = features.unoChatTextEnabled
    uni.showToast({ title: unoChatTextEnabled.value ? '文字聊天已开启' : '文字聊天已关闭', icon: 'none' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '更新失败', icon: 'none' })
    await loadTools()
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

/** 组内上下移：在全量列表中与同分类的相邻项交换位置，保持跨分类相对顺序不变 */
async function moveTool(tool: AdminTool, direction: number) {
  const category = tool.category || 'tool'
  const sameCategory = tools.value.filter((item) => (item.category || 'tool') === category)
  const groupIndex = sameCategory.findIndex((item) => item.key === tool.key)
  const neighbor = sameCategory[groupIndex + direction]
  if (!neighbor) return

  const nextTools = [...tools.value]
  const a = nextTools.findIndex((item) => item.key === tool.key)
  const b = nextTools.findIndex((item) => item.key === neighbor.key)
  ;[nextTools[a], nextTools[b]] = [nextTools[b], nextTools[a]]
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

  &__flag {
    display: flex;
    align-items: center;
    gap: 20rpx;
    padding: 24rpx 28rpx;
  }

  &__flag--divided {
    border-top: 2rpx solid $line;
  }

  &__flag-chip {
    width: 60rpx;
    height: 60rpx;
    border-radius: 18rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30rpx;
    flex-shrink: 0;
  }

  &__flag-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__flag-name {
    font-size: 26rpx;
    font-weight: 600;
    color: $ink;
  }

  &__flag-desc {
    font-size: 20rpx;
    color: $ink3;
    line-height: 1.5;
  }

  &__tool-bottom {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__status {
    color: $green;
    font-size: 22rpx;
  }

  &__status--off {
    color: $ink3;
  }

  &__order {
    display: flex;
    gap: 12rpx;
  }

  &__order-btn {
    width: 56rpx;
    height: 52rpx;
    border: 2rpx solid $line-strong;
    border-radius: 16rpx;
    background: $card;
    color: $blue-deep;
    font-size: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  &__order-btn--disabled {
    color: $line-strong;
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
    text-align: center;
  }

  &__empty-icon {
    font-size: 44rpx;
  }
}
</style>
