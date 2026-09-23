<template>
  <!-- 拖动排序时锁定页面滚动（page-meta 是配置节点、不渲染内容，页面内容必须放在它外面） -->
  <page-meta :page-style="draggingToolKey ? 'overflow: hidden;' : ''" />
  <view class="home">
      <view class="home__pagehead">
        <view class="home__pagehead-copy">
          <text class="home__kick">MAPLE HOUSE · 枫叶小屋</text>
          <text class="home__title">常用工具</text>
          <text class="home__sub">长按卡片可拖动排序</text>
        </view>
        <view class="home__iconbtn" :class="{ 'home__iconbtn--active': sorting }" hover-class="press" @tap="toggleSortMode">
          <text>{{ sorting ? '完成' : '↕' }}</text>
        </view>
      </view>

      <view v-if="sorting" class="hintline home__sorthint">长按卡片后上下拖动排序，完成后自动保存</view>

      <AppSection v-if="toolItems.length" title="工具" card>
        <ToolCard
          v-for="(tool, index) in toolItems"
          :key="tool.key"
          class="home__tool-card"
          :class="{ 'home__tool-card--dragging': draggingToolKey === tool.key }"
          :icon="tool.icon"
          :pastel="tool.key"
          :title="tool.name"
          :description="toolDescription(tool)"
          :badge="toolBadge(tool)"
          :divided="index > 0"
          :pressable="!sorting"
          @tap.stop="onToolTap(tool)"
          @longpress.stop="beginSort(tool.key)"
          @touchmove="onToolDragMove($event)"
          @touchend.stop="endToolDrag"
          @touchcancel.stop="endToolDrag"
        />
      </AppSection>

      <AppSection v-if="gameItems.length" title="游戏" card>
        <ToolCard
          v-for="(game, index) in gameItems"
          :key="game.key"
          class="home__game-card"
          :class="{ 'home__game-card--dragging': draggingToolKey === game.key }"
          :icon="game.icon"
          :pastel="game.key"
          :title="game.name"
          :description="game.description"
          :divided="index > 0"
          :pressable="!sorting"
          @tap.stop="onToolTap(game)"
          @longpress.stop="beginSort(game.key)"
          @touchmove="onToolDragMove($event)"
          @touchend.stop="endToolDrag"
          @touchcancel.stop="endToolDrag"
        >
          <template #right>
            <text class="tag tag--blue">已在首页</text>
          </template>
        </ToolCard>
      </AppSection>

      <view v-if="!toolItems.length && !gameItems.length && !loading" class="home__empty">
        <text class="home__empty-icon">🍁</text>
        <text>暂时没有可展示的工具</text>
      </view>
      <AppBottomNav active="home" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppBottomNav from '@/components/AppBottomNav.vue'
import AppSection from '@/components/AppSection.vue'
import ToolCard from '@/components/ToolCard.vue'
import type { ToolboxHomeData, ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools, saveHomeTools } from '@/services/toolbox'
import { fetchAnniversaries } from '@/services/anniversary'
import type { AnniversarySummary } from '@/types/anniversary'
import { summarizeAnniversaries } from '@/utils/anniversary'

interface ToolPosition {
  top: number
  height: number
}

const FALLBACK_TOOLS: ToolboxTool[] = [
  { key: 'beads', category: 'tool', name: '拼豆图纸生成器', description: '上传图片，生成拼豆图纸和用豆量统计', icon: '🧩', route: '/pages/beads/index' },
  { key: 'travel', category: 'tool', name: '旅游攻略图生成器', description: '编辑行程，生成可分享的旅游攻略图', icon: '🗺️', route: '/pages/travel/index' },
  { key: 'food', category: 'tool', name: '今天吃什么', description: '选地点和偏好，随机抽一家附近美食或常吃店', icon: '🍜', route: '/pages/food/index' },
  { key: 'lottery', category: 'tool', name: '枫叶抽奖', description: '抽奖品、随机抽取、随机分组，规则由你设置', icon: '🎉', route: '/pages/lottery/index' },
  { key: 'anniversary', category: 'tool', name: '时光纪念卡', description: '记录纪念日、倒数提醒，生成可保存的纪念卡', icon: '📅', route: '/pages/anniversary/index' },
  { key: 'fortune', category: 'tool', name: '每日灵签', description: '观音关帝月老灵签 + 答案之书，摇一摇抽签，每日三签', icon: '🎋', route: '/pages/fortune/index' },
  { key: 'gomoku', category: 'game', name: '五子棋', description: '创建房间，邀请好友联机对弈', icon: '⚫', route: '/pages-games/gomoku/index' },
  { key: 'tetris', category: 'game', name: '俄罗斯方块', description: '经典方块 · 手势操作 · 等级挑战与排行榜', icon: '🧱', route: '/pages-games/tetris/index' },
]

const tools = ref<ToolboxTool[]>([])
const anniversarySummary = ref<AnniversarySummary | null>(null)
const loading = ref(true)
const sorting = ref(false)
const draggingToolKey = ref('')
const toolPositions = ref<ToolPosition[]>([])

/** v4 分组列表：工具/游戏分组展示；tools 顺序 = 工具组顺序 + 游戏组顺序（保存顺序随之） */
const toolItems = computed(() => tools.value.filter((tool) => (tool.category || 'tool') !== 'game'))
const gameItems = computed(() => tools.value.filter((tool) => tool.category === 'game'))

onShow(() => {
  void loadTools()
})

async function loadTools() {
  loading.value = true
  try {
    const data = await fetchHomeTools()
    tools.value = homeToolsFrom(data)
    await loadAnniversarySummary(tools.value)
  } catch (error) {
    if (tools.value.length === 0) tools.value = [...FALLBACK_TOOLS]
    await loadAnniversarySummary(tools.value)
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

async function loadAnniversarySummary(currentTools: ToolboxTool[]) {
  anniversarySummary.value = null
  if (!currentTools.some((tool) => tool.key === 'anniversary')) return
  try {
    anniversarySummary.value = summarizeAnniversaries(await fetchAnniversaries())
  } catch (error) {
    console.warn('[home] load anniversary summary failed:', error)
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

/** 被拖动项所属分组（拖动只在组内重排，两组测量选择器也因此分开） */
function dragGroupIsGame(): boolean {
  const dragged = tools.value.find((tool) => tool.key === draggingToolKey.value)
  return dragged?.category === 'game'
}

function onToolDragMove(event: TouchEvent) {
  if (!sorting.value || !draggingToolKey.value) return
  const pointerY = event.touches?.[0]?.clientY
  if (typeof pointerY !== 'number') return

  const groupIsGame = dragGroupIsGame()
  const group = groupIsGame ? gameItems.value : toolItems.value
  if (group.length !== toolPositions.value.length) return

  const fromIndex = group.findIndex((tool) => tool.key === draggingToolKey.value)
  if (fromIndex < 0) return
  const matchedIndex = toolPositions.value.findIndex((position) => pointerY < position.top + position.height / 2)
  const nextIndex = matchedIndex === -1 ? group.length - 1 : matchedIndex
  if (nextIndex === fromIndex) return

  const nextGroup = [...group]
  const [dragged] = nextGroup.splice(fromIndex, 1)
  nextGroup.splice(nextIndex, 0, dragged)
  tools.value = groupIsGame ? [...toolItems.value, ...nextGroup] : [...nextGroup, ...gameItems.value]
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
  const selector = dragGroupIsGame() ? '.home__game-card' : '.home__tool-card'
  uni.createSelectorQuery()
    .selectAll(selector)
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
  padding: 24rpx 32rpx 200rpx;

  &__pagehead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20rpx;
    padding: 20rpx 4rpx 8rpx;
  }

  &__pagehead-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
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

  &__iconbtn {
    width: 72rpx;
    height: 72rpx;
    border-radius: 24rpx;
    background: $card;
    border: 2rpx solid $line-strong;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $ink2;
    font-size: 30rpx;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  &__iconbtn--active {
    background: $blue-tint;
    border-color: $blue;
    color: $blue-deep;
    font-weight: 600;
  }

  &__sorthint {
    margin: 20rpx 0 24rpx;
  }

  &__tool-card--dragging,
  &__game-card--dragging {
    transform: scale(0.98);
    opacity: 0.72;
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
