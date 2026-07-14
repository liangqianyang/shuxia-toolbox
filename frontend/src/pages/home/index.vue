<template>
  <view class="home">
    <view class="home__header">
      <view class="home__header-copy">
        <text class="home__title">枫叶小屋</text>
        <text class="home__slogan">常用工具</text>
      </view>
      <view class="home__sort-btn" :class="{ 'home__sort-btn--active': sorting }" @tap="toggleSortMode">
        {{ sorting ? '完成' : '排序' }}
      </view>
    </view>

    <view v-if="sorting" class="home__sort-state">长按卡片后上下拖动排序，完成后自动保存</view>

    <view v-if="tools.length" class="home__tools">
      <view
        v-for="tool in tools"
        :key="tool.key"
        class="home__tool-card card"
        :class="{ 'home__tool-card--dragging': draggingToolKey === tool.key, 'home__tool-card--sorting': sorting }"
        @tap.stop="onToolTap(tool)"
        @longpress.stop="beginSort(tool.key)"
        @touchmove.stop="onToolDragMove($event)"
        @touchend.stop="endToolDrag"
        @touchcancel.stop="endToolDrag"
      >
        <view class="home__tool-icon">{{ tool.icon }}</view>
        <view class="home__tool-body">
          <text class="home__tool-title">{{ tool.name }}</text>
          <text class="home__tool-desc">{{ tool.description }}</text>
        </view>
        <text class="home__tool-order" v-if="sorting">↕</text>
        <text class="home__tool-arrow" v-else>›</text>
      </view>
    </view>

    <view v-else-if="!loading" class="home__empty">
      <text class="home__empty-icon">🍁</text>
      <text>暂时没有可展示的工具</text>
    </view>
    <AppBottomNav active="home" />
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppBottomNav from '@/components/AppBottomNav.vue'
import type { ToolboxHomeData, ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools, saveHomeTools } from '@/services/toolbox'

interface ToolPosition {
  top: number
  height: number
}

const FALLBACK_TOOLS: ToolboxTool[] = [
  { key: 'beads', name: '拼豆图纸生成器', description: '上传图片，生成拼豆图纸和用豆量统计', icon: '🧩', route: '/pages/beads/index' },
  { key: 'travel', name: '旅游攻略图生成器', description: '编辑行程，生成可分享的旅游攻略图', icon: '🗺️', route: '/pages/travel/index' },
  { key: 'food', name: '今天吃什么', description: '选地点和偏好，随机抽一家附近美食或常吃店', icon: '🍜', route: '/pages/food/index' },
  { key: 'lottery', name: '枫叶签筒', description: '抽奖品、随机抽取、随机分组，规则由你设置', icon: '🍁', route: '/pages/lottery/index' },
]

const tools = ref<ToolboxTool[]>([])
const loading = ref(true)
const sorting = ref(false)
const draggingToolKey = ref('')
const toolPositions = ref<ToolPosition[]>([])

onShow(() => {
  void loadTools()
})

async function loadTools() {
  loading.value = true
  try {
    const data = await fetchHomeTools()
    tools.value = homeToolsFrom(data)
  } catch (error) {
    if (tools.value.length === 0) tools.value = [...FALLBACK_TOOLS]
    console.warn('[home] load tool preferences failed:', error)
  } finally {
    loading.value = false
  }
}

function homeToolsFrom(data: ToolboxHomeData): ToolboxTool[] {
  const catalog = new Map(data.catalog.map((tool) => [tool.key, tool]))
  return data.homeToolKeys.map((key) => catalog.get(key)).filter((tool): tool is ToolboxTool => Boolean(tool))
}

function onToolTap(tool: ToolboxTool) {
  if (sorting.value) return
  uni.navigateTo({ url: tool.route })
}

function toggleSortMode() {
  if (sorting.value) {
    finishSort()
    return
  }
  sorting.value = true
  void refreshToolPositions()
}

function beginSort(toolKey: string) {
  sorting.value = true
  draggingToolKey.value = toolKey
  void refreshToolPositions()
}

function onToolDragMove(event: TouchEvent) {
  if (!sorting.value || !draggingToolKey.value) return
  const pointerY = event.touches?.[0]?.clientY
  if (typeof pointerY !== 'number' || toolPositions.value.length !== tools.value.length) return

  const fromIndex = tools.value.findIndex((tool) => tool.key === draggingToolKey.value)
  if (fromIndex < 0) return
  const matchedIndex = toolPositions.value.findIndex((position) => pointerY < position.top + position.height / 2)
  const nextIndex = matchedIndex === -1 ? tools.value.length - 1 : matchedIndex
  if (nextIndex === fromIndex) return

  const nextTools = [...tools.value]
  const [dragged] = nextTools.splice(fromIndex, 1)
  nextTools.splice(nextIndex, 0, dragged)
  tools.value = nextTools
  void refreshToolPositions()
}

function endToolDrag() {
  draggingToolKey.value = ''
}

async function finishSort() {
  const wasSorting = sorting.value
  sorting.value = false
  endToolDrag()
  if (!wasSorting) return
  try {
    const data = await saveHomeTools(tools.value.map((tool) => tool.key))
    tools.value = homeToolsFrom(data)
    uni.showToast({ title: '首页顺序已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存排序失败', icon: 'none' })
    await loadTools()
  }
}

async function refreshToolPositions() {
  await nextTick()
  uni.createSelectorQuery()
    .selectAll('.home__tool-card')
    .boundingClientRect((rectangles) => {
      const rects = Array.isArray(rectangles) ? rectangles : []
      toolPositions.value = rects.map((rectangle) => ({ top: Number(rectangle.top ?? 0), height: Number(rectangle.height ?? 0) }))
    })
    .exec()
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
  padding: 48rpx 32rpx 180rpx;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
    padding: 40rpx 0 56rpx;
  }

  &__header-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
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

  &__sort-btn {
    min-width: 80rpx;
    padding: 12rpx 8rpx;
    color: $color-text-secondary;
    font-size: 24rpx;
    font-weight: 600;
    text-align: right;
    flex-shrink: 0;
  }

  &__sort-btn--active {
    color: $color-primary;
  }

  &__sort-state {
    margin: -28rpx 0 20rpx;
    color: $color-primary;
    font-size: 22rpx;
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
    transition: transform 160ms ease, opacity 160ms ease;
  }

  &__tool-card--sorting {
    border-color: rgba($color-primary, 0.35);
  }

  &__tool-card--dragging {
    transform: scale(0.98);
    opacity: 0.72;
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
    line-height: 1.45;
  }

  &__tool-arrow,
  &__tool-order {
    width: 40rpx;
    color: $color-text-secondary;
    font-size: 48rpx;
    text-align: center;
    flex-shrink: 0;
  }

  &__tool-order {
    color: $color-primary;
    font-size: 32rpx;
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
