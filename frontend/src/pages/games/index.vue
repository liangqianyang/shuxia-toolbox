<template>
  <view class="games">
    <view class="games__pagehead">
      <text class="games__kick">GAMES</text>
      <text class="games__title">游戏</text>
      <text class="games__sub">{{ games.length }} 个已上架游戏</text>
    </view>

    <template v-if="games.length">
      <AppSection title="派对联机" count="房间码同玩" card>
        <ToolCard
          v-for="(game, index) in onlineGames"
          :key="game.key"
          :icon="game.icon"
          :pastel="game.key"
          :title="game.name"
          :description="game.description"
          :divided="index > 0"
          :chevron="false"
          pressable
          @tap="openGame(game)"
        >
          <template #right>
            <view class="games__tags">
              <text v-if="selectedKeys.includes(game.key)" class="tag tag--blue">已在首页</text>
              <text class="tag tag--blue">联机</text>
            </view>
          </template>
        </ToolCard>
      </AppSection>

      <AppSection title="单机消遣" count="离线可玩" card>
        <ToolCard
          v-for="(game, index) in singleGames"
          :key="game.key"
          :icon="game.icon"
          :pastel="game.key"
          :title="game.name"
          :description="game.description"
          :divided="index > 0"
          :chevron="false"
          pressable
          @tap="openGame(game)"
        >
          <template #right>
            <view class="games__tags">
              <text v-if="selectedKeys.includes(game.key)" class="tag tag--blue">已在首页</text>
              <text class="tag tag--gray">单机</text>
            </view>
          </template>
        </ToolCard>
      </AppSection>
    </template>

    <view v-else-if="!loading" class="games__empty">
      <text class="games__empty-icon">🎮</text>
      <text>暂时没有可用游戏</text>
    </view>
    <AppBottomNav active="games" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import AppBottomNav from '@/components/AppBottomNav.vue'
import AppSection from '@/components/AppSection.vue'
import ToolCard from '@/components/ToolCard.vue'
import type { ToolboxTool } from '@/types/toolbox'
import { fetchHomeTools } from '@/services/toolbox'

/** 联机白名单（纯前端分组，不改 tool_catalog）：不在名单里的一律按单机展示（安全默认） */
const ONLINE_KEYS = ['gomoku', 'uno', 'ludo', 'adventure', 'jungle', 'junqi', 'xiangqi', 'tictactoe']

const games = ref<ToolboxTool[]>([])
const selectedKeys = ref<string[]>([])
const loading = ref(true)

const onlineGames = computed(() => games.value.filter((game) => ONLINE_KEYS.includes(game.key)))
const singleGames = computed(() => games.value.filter((game) => !ONLINE_KEYS.includes(game.key)))

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

  &__tags {
    display: flex;
    align-items: center;
    gap: 8rpx;
    flex-shrink: 0;
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
