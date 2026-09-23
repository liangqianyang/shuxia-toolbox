<template>
  <view class="tetris">
    <!-- ═══════════ 菜单面板（游戏主页,v4 小清新 · 照原型 lobby-tetris） ═══════════ -->
    <view v-if="panel === 'menu'" class="tetris__menu">
      <view class="tetris__hero">
        <view class="tetris__deco">
          <view
            v-for="(p, pi) in DECO_PIECES"
            :key="pi"
            class="tetris__deco-piece"
            :style="decoPieceStyle(p)"
          >
            <view
              v-for="(c, ci) in p.cells"
              :key="ci"
              class="tetris__deco-cell"
              :style="{ left: c[0] * 15 + 'px', top: c[1] * 15 + 'px', background: p.color }"
            ></view>
          </view>
        </view>
        <view class="tetris__title-row">
          <view class="tetris__title-copy">
            <text class="tetris__kicker">单机消遣 · 离线可玩</text>
            <text class="tetris__title">俄罗斯方块</text>
          </view>
          <view class="tetris__title-flex"></view>
          <view class="tetris__icon-btn" hover-class="press" @tap="toggleSound">
            <text>{{ soundOn ? '🔊' : '🔇' }}</text>
          </view>
          <view class="tetris__icon-btn" hover-class="press" @tap="showRules = true">
            <text>ⓘ</text>
          </view>
        </view>
        <text class="tetris__subtitle">经典方块 · 手势操作 · 冲榜挑战</text>
      </view>

      <view class="tetris__start-btn" hover-class="press" @tap="startGame">
        <text class="tetris__start-icon">▶</text>
        <text class="tetris__start-text">开始游戏</text>
      </view>

      <view class="tetris__card tetris__settings">
        <view class="tetris__opt">
          <text class="tetris__opt-label">下落速度</text>
          <view class="tetris__chiprow">
            <view
              class="tetris__chip"
              :class="{ 'is-active': speedMode === 'progressive' }"
              hover-class="press"
              @tap="pickSpeed('progressive')"
            >
              <text>越消越快</text>
            </view>
            <view
              class="tetris__chip"
              :class="{ 'is-active': speedMode === 'constant' }"
              hover-class="press"
              @tap="pickSpeed('constant')"
            >
              <text>恒定速度</text>
            </view>
          </view>
        </view>
        <text class="tetris__opt-note">恒定 = 全程同一速度,不随消行加速 · 选择会被记住</text>
        <view class="tetris__divider"></view>
        <view class="tetris__opt">
          <text class="tetris__opt-label">初始等级</text>
          <view class="tetris__chiprow">
            <view
              v-for="v in LEVEL_CHIPS"
              :key="v"
              class="tetris__chip tetris__chip--num"
              :class="{ 'is-active': startLevel === v }"
              hover-class="press"
              @tap="pickLevel(v)"
            >
              <text>{{ v }}</text>
            </view>
          </view>
        </view>
        <text class="tetris__opt-note">起始等级越高,开局速度与计分越高(1 ~ 15)</text>
      </view>

      <view class="tetris__card tetris__best">
        <view class="tetris__best-item">
          <text class="tetris__best-num">{{ bestView ? formatScore(bestView.score) : '0' }}</text>
          <text class="tetris__best-label">最高分</text>
        </view>
        <view class="tetris__best-item">
          <text class="tetris__best-num">{{ bestView ? bestView.lines : 0 }}</text>
          <text class="tetris__best-label">消行</text>
        </view>
        <view class="tetris__best-item">
          <text class="tetris__best-num">{{ bestView ? bestView.level : 1 }}</text>
          <text class="tetris__best-label">最高等级</text>
        </view>
        <view v-if="gameRankEnabled" class="tetris__rank-badge">
          <text class="tetris__rank-trophy">🏆</text>
          <text class="tetris__rank-text">{{ mineRankText }}</text>
        </view>
      </view>

      <view v-if="gameRankEnabled" class="tetris__board-list">
        <view v-if="leaderboardLoading" class="tetris__lb-hint">
          <text>加载中…</text>
        </view>
        <view v-else-if="leaderboardError" class="tetris__lb-hint">
          <text>{{ leaderboardError }}</text>
          <view class="tetris__lb-retry" hover-class="press" @tap="loadLeaderboard"><text>重试</text></view>
        </view>
        <view v-else-if="!leaderboard || leaderboard.entries.length === 0" class="tetris__lb-hint">
          <text>🏆 虚位以待,玩一局成为第一个上榜的枫友</text>
        </view>
        <view v-else class="tetris__card tetris__lb">
          <view class="tetris__lb-head">
            <text class="tetris__lb-title">排行榜</text>
            <text class="tetris__lb-count">{{ leaderboard.entries.length }} 人</text>
          </view>
          <view v-if="leaderboard.mine" class="tetris__lb-mine">
            <view class="tetris__lb-left">
              <view class="tetris__lb-avatar">
                <image v-if="myAvatar" class="tetris__lb-avatar-img" :src="myAvatar" mode="aspectFill" />
                <text v-else class="tetris__lb-avatar-char">{{ (myNickname || '我').slice(0, 1) }}</text>
              </view>
              <text class="tetris__lb-mine-name">我的成绩{{ myNickname ? ' · ' + myNickname : '' }}</text>
            </view>
            <text class="tetris__lb-mine-val">第 {{ leaderboard.mine.rank }} 名 · {{ formatScore(leaderboard.mine.score) }}</text>
          </view>
          <view
            v-for="entry in leaderboard.entries"
            :key="entry.rank"
            class="tetris__lb-row"
            :class="{ 'is-me': entry.nickname === myNickname }"
          >
            <view class="tetris__lb-left">
              <text class="tetris__lb-rank" :style="{ color: rankColor(entry.rank) }">{{ rankBadge(entry.rank) }}</text>
              <view class="tetris__lb-avatar">
                <image v-if="entry.avatarUrl" class="tetris__lb-avatar-img" :src="resolveAvatarUrl(entry.avatarUrl)" mode="aspectFill" />
                <text v-else class="tetris__lb-avatar-char">{{ entry.nickname.slice(0, 1) }}</text>
              </view>
              <text class="tetris__lb-name">{{ entry.nickname }}</text>
            </view>
            <text class="tetris__lb-score">{{ formatScore(entry.score) }}</text>
          </view>
        </view>
      </view>

      <view class="tetris__menu-flex"></view>
    </view>

    <!-- ═══════════ 游戏面板（v4 · 照原型 play-tetris） ═══════════ -->
    <view v-else class="tetris__game">
      <view class="tetris__battletop">
        <view class="tetris__statchip">
          <text class="tetris__statchip-v">{{ formatScore(view?.score ?? 0) }}</text>
          <text class="tetris__statchip-k">得分</text>
        </view>
        <view class="tetris__statchip">
          <text class="tetris__statchip-v">{{ view?.lines ?? 0 }}</text>
          <text class="tetris__statchip-k">行数</text>
        </view>
        <view class="tetris__statchip">
          <text class="tetris__statchip-v tetris__statchip-v--accent">{{ view?.level ?? startLevel }}</text>
          <text class="tetris__statchip-k">等级</text>
        </view>
        <view class="tetris__pause-btn" hover-class="press" @tap="pauseGame">
          <text>{{ paused ? '▶' : '⏸' }}</text>
        </view>
      </view>
      <view class="tetris__speedrow">
        <view
          class="tetris__speed-chip"
          :class="{ 'is-active': speedMode === 'progressive' }"
          hover-class="press"
          @tap="pickSpeed('progressive')"
        >
          <text>越消越快</text>
        </view>
        <view
          class="tetris__speed-chip"
          :class="{ 'is-active': speedMode === 'constant' }"
          hover-class="press"
          @tap="pickSpeed('constant')"
        >
          <text>恒定速度</text>
        </view>
      </view>

      <view class="tetris__stage">
        <view class="tetris__stage-inner" :style="{ width: layout.totalW + 'px', height: layout.totalH + 'px' }">
          <!-- 遮罩弹出时整体隐藏（v-show 保住 canvas 上下文）——根绝原生层级/遮挡变量 -->
          <canvas
            v-show="!paused && !gameOver"
            id="tetris-board"
            type="2d"
            class="tetris__canvas"
            :style="{ width: layout.totalW + 'px', height: layout.totalH + 'px' }"
          ></canvas>
          <!-- 手势层：catchtouchmove 防页面滚动抢走拖动（.stop 修饰符） -->
          <view
            v-show="!paused && !gameOver"
            class="tetris__hit"
            @touchstart="drag.onTouchStart"
            @touchmove.stop="drag.onTouchMove"
            @touchend="drag.onTouchEnd"
            @touchcancel="drag.onTouchCancel"
          ></view>
        </view>
      </view>

      <!-- 按钮排（原型序）：[←][→][旋转 accent][⤓直落 蓝实底]‖隔离‖[HOLD]——
           直落蓝色实底与高频白键视觉区分（防误触），HOLD 低频靠边缘 -->
      <view class="tetris__pad">
        <view
          class="tetris__key tetris__key--move"
          hover-class="press"
          @touchstart="onPadLeftDown"
          @touchend="endMove"
          @touchcancel="endMove"
        >
          <text class="tetris__key-icon">←</text>
        </view>
        <view
          class="tetris__key tetris__key--move"
          hover-class="press"
          @touchstart="onPadRightDown"
          @touchend="endMove"
          @touchcancel="endMove"
        >
          <text class="tetris__key-icon">→</text>
        </view>
        <view class="tetris__key tetris__key--accent" hover-class="press" @tap="rotatePiece">
          <text class="tetris__key-icon">↻</text>
          <text class="tetris__key-label">旋转</text>
        </view>
        <view class="tetris__key tetris__key--drop" hover-class="press" @tap="hardDropPiece">
          <text class="tetris__key-icon">⤓</text>
          <text class="tetris__key-label">直落</text>
        </view>
        <view class="tetris__pad-iso"></view>
        <view class="tetris__key" hover-class="press" @tap="holdPiece">
          <text class="tetris__key-label">HOLD</text>
        </view>
      </view>
      <view class="tetris__hint">
        <text>点按旋转 · 下滑软降 · 直落 = 快滑 或 蓝色实底键</text>
      </view>

      <!-- 遮罩挂在整个游戏面板上（挂 canvas 容器里会被画布高度裁住,结算卡比画布高） -->
      <!-- 暂停遮罩 -->
      <view v-if="paused" class="tetris__mask">
        <view class="tetris__mask-card">
          <text class="tetris__mask-title">已暂停</text>
          <view class="tetris__mask-btn tetris__mask-btn--primary" hover-class="press" @tap="resume"><text>继续</text></view>
          <view class="tetris__mask-btn" hover-class="press" @tap="restartGame"><text>重新开始</text></view>
          <view class="tetris__mask-btn" hover-class="press" @tap="exitToMenu"><text>退出</text></view>
        </view>
      </view>

      <!-- 结束遮罩 -->
      <view v-if="gameOver" class="tetris__mask">
        <view class="tetris__mask-card tetris__over-card">
          <view class="tetris__over-deco">
            <view
              v-for="(p, pi) in OVER_DECO"
              :key="pi"
              class="tetris__deco-piece"
              :style="decoPieceStyle(p)"
            >
              <view
                v-for="(c, ci) in p.cells"
                :key="ci"
                class="tetris__deco-cell tetris__deco-cell--sm"
                :style="{ left: c[0] * 12 + 'px', top: c[1] * 12 + 'px', background: p.color }"
              ></view>
            </view>
          </view>
          <text class="tetris__over-title">GAME OVER</text>
          <view v-if="isNewBest && (view?.score ?? 0) > 0" class="tetris__over-badge">
            <text>🎉 新纪录</text>
          </view>
          <text class="tetris__over-score">{{ formatScore(view?.score ?? 0) }}</text>
          <text class="tetris__over-sub">{{ view?.lines ?? 0 }} 行 · 等级 {{ view?.level ?? 1 }}</text>
          <view v-if="gameRankEnabled && submitRank !== null" class="tetris__over-rank">
            <text class="tetris__over-rank-trophy">🏆</text>
            <text class="tetris__over-rank-text">全服第 {{ submitRank }} 名</text>
          </view>
          <view class="tetris__mask-btn tetris__mask-btn--primary" hover-class="press" @tap="restartGame"><text>再来一局</text></view>
          <view v-if="gameRankEnabled" class="tetris__mask-btn" hover-class="press" @tap="viewLeaderboard"><text>看排行榜</text></view>
          <view class="tetris__mask-btn" hover-class="press" @tap="exitToMenu"><text>回菜单</text></view>
        </view>
      </view>
    </view>

    <GameRulesModal :visible="showRules" title="俄罗斯方块 · 玩法说明" :sections="rulesSections" @close="showRules = false" />
  </view>
</template>

<script setup lang="ts">
/**
 * 俄罗斯方块页（v4 小清新皮肤,布局照原型 lobby-tetris / play-tetris）：
 * 菜单 = 游戏主页（方块装饰 + 大标题 + 开始按钮 + 下落速度/初始等级设置卡 + 最高分 + 排行榜）;
 * 游戏 = 三枚 statchip + 速度切换行 + 弹性居中棋盘 + [←][→][旋转][⤓直落蓝实底]‖隔离‖[HOLD] 按钮排。
 * 引擎纯逻辑在 utils/tetris.ts,循环/输入在 composables/useTetris.ts,绘帧在 utils/tetrisRender.ts——
 * 页面只做：canvas 节点获取（照 gomoku 家法）、特效（events→音效/振动）、本地最高分与面板切换。
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'
import { onHide, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import GameRulesModal from '@/components/GameRulesModal.vue'
import { useTetris } from '@/pages-games/composables/useTetris'
import { useFeatures } from '@/composables/useFeatures'
import { resolveAvatarUrl, storedUser } from '@/services/toolbox'
import { fetchTetrisLeaderboard, submitTetrisScore, type TetrisLeaderboard } from '@/pages-games/services/tetris'
import { getCanvasNode, getWindowInfo, type CanvasNode } from '@/utils/canvasAdapter'
import { computeTetrisLayout, drawTetrisFrame, type TetrisLayout } from '@/pages-games/utils/tetrisRender'
import { createDragController, defaultDragConfig } from '@/pages-games/utils/touchGestures'
import { playTetrisSound, setTetrisSoundEnabled, tetrisSoundEnabled } from '@/pages-games/utils/tetrisSound'
import type { SpeedMode, TetrisState } from '@/pages-games/utils/tetris'

const BEST_KEY = 'shuxia_tetris_best_v1'
const LEVEL_KEY = 'shuxia_tetris_start_level'
const SPEED_KEY = 'shuxia_tetris_speed_mode'

interface BestRecord {
  score: number
  lines: number
  level: number
}

const LEVEL_CHIPS = [1, 3, 5, 10, 15]
/** 菜单顶部四色方块装饰（L/T/I/S,格 13px 步进 15px；色 = 渲染器同款马卡龙）。 */
const DECO_PIECES: { cells: Array<[number, number]>; color: string }[] = [
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#E8A06B' },
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#C3B2E4' },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#A9CFEA' },
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#9AD4B4' },
]
/** 结算卡顶部装饰（Z/I/S 小号）。 */
const OVER_DECO: { cells: Array<[number, number]>; color: string }[] = [
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#F5A99C' },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#A9CFEA' },
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#9AD4B4' },
]

const instance = getCurrentInstance()
const { gameRankEnabled, refreshFeatures } = useFeatures()
const panel = ref<'menu' | 'game'>('menu')
const showRules = ref(false)
const startLevel = ref(readStartLevel())
const speedMode = ref<SpeedMode>(readSpeedMode())
const best = ref<BestRecord | null>(readBest())
const soundOn = ref(tetrisSoundEnabled())
const gameOver = ref(false)
const isNewBest = ref(false)
const submitRank = ref<number | null>(null)

// ---------- 排行榜 ----------

const leaderboard = ref<TetrisLeaderboard | null>(null)
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const myNickname = computed(() => storedUser()?.nickname ?? '')
const myAvatar = computed(() => {
  const url = storedUser()?.avatarUrl ?? ''
  return url ? resolveAvatarUrl(url) : ''
})
const mineRankText = computed(() => {
  const mine = leaderboard.value?.mine
  return mine ? `第 ${mine.rank} 名` : '未上榜'
})

/** 统计行数据源：云端 mine 优先（换设备/清缓存后本地 best 会丢），本地 best 兜底；取分高者，消行/等级与最高分同属一局 */
const bestView = computed<BestRecord | null>(() => {
  const mine = leaderboard.value?.mine
  const remote: BestRecord | null = mine ? { score: mine.score, lines: mine.lines, level: mine.level } : null
  if (!best.value) return remote
  if (!remote) return best.value
  return remote.score > best.value.score ? remote : best.value
})

async function loadLeaderboard(): Promise<void> {
  if (!gameRankEnabled.value) return // 榜单总开关关闭：不发请求（服务端同样硬拦截兜底）
  leaderboardLoading.value = true
  leaderboardError.value = ''
  try {
    leaderboard.value = await fetchTetrisLeaderboard(50)
  } catch (error) {
    leaderboardError.value = error instanceof Error ? error.message : '排行榜加载失败'
  } finally {
    leaderboardLoading.value = false
  }
}

/** 结束自动上报：fire-and-forget,失败只记 warn——离线/未登录不影响本地纪录。 */
async function submitScore(state: TetrisState): Promise<void> {
  if (state.score <= 0) return
  try {
    const result = await submitTetrisScore(state.score, state.lines, state.level)
    submitRank.value = result.rank
    if (leaderboard.value) loadLeaderboard()
  } catch (error) {
    console.warn('[tetris] submit score failed:', error)
  }
}

function rankBadge(rank: number): string {
  return rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : String(rank)
}

/** 名次色 = PASTEL 表内的低饱和点缀（金/灰/铜/最弱墨）,不做实底。 */
function rankColor(rank: number): string {
  if (rank === 1) return '#C99A34'
  if (rank === 2) return '#6E8093'
  if (rank === 3) return '#CC6F4E'
  return '#A4B3C0'
}

function formatScore(score: number): string {
  return score.toLocaleString('en-US')
}

function decoPieceStyle(p: { cells: Array<[number, number]> }): Record<string, string> {
  const maxX = Math.max(...p.cells.map((c) => c[0]))
  const maxY = Math.max(...p.cells.map((c) => c[1]))
  return { width: (maxX + 1) * 15 - 2 + 'px', height: (maxY + 1) * 15 - 2 + 'px' }
}

// ---------- 布局与 canvas ----------

const win = getWindowInfo()
const SIDE_PAD_PX = 12
const HUD_PX = 148
const PAD_PX = 210
const layout: TetrisLayout = computeTetrisLayout(
  win.windowWidth - SIDE_PAD_PX * 2,
  Math.max(300, win.windowHeight - HUD_PX - PAD_PX),
)
let boardNode: CanvasNode | null = null

function drawState(state: TetrisState): void {
  if (!boardNode) return
  drawTetrisFrame(boardNode.ctx, layout, state)
}

// ---------- 游戏循环与特效 ----------
// 家法：composable 返回值解构成顶层绑定（模板自动解包;嵌套 game.paused.value 在 MP 编译下不响应）
const {
  state: gameState,
  running,
  paused,
  start: startEngine,
  input,
  pause,
  resume,
  destroy,
  beginMove,
  endMove,
} = useTetris({ onStateChange: handleStateChange })
const view = computed(() => gameState.value)
// 独立于事件回调的相位哨兵:即便 onStateChange 链路当场崩掉,over 相位也必须弹出结算
watch(gameState, (s) => {
  if (s && s.phase === 'over' && !gameOver.value) onGameOver(s)
})

function handleStateChange(state: TetrisState): void {
  safeCall(() => drawState(state), 'draw')
  for (const event of state.events) {
    // 每个副作用独立兜底:音效/振动任一抛错都不能打断事件循环,否则 gameOver 分支永远走不到
    safeCall(() => {
      switch (event.t) {
        case 'moved':
          playTetrisSound('move')
          break
        case 'rotated':
          playTetrisSound('rotate')
          break
        case 'locked':
          playTetrisSound('lock')
          break
        case 'cleared':
          playTetrisSound(event.rows === 4 ? 'tetris' : 'clear')
          vibrate()
          break
        case 'hardDropped':
          playTetrisSound('harddrop')
          vibrate()
          break
        case 'levelUp':
          playTetrisSound('levelup')
          break
        case 'gameOver':
          onGameOver(state)
          break
        default:
          break
      }
    }, `event:${event.t}`)
  }
  // 相位直判兜底:即便事件路径断了,over 相位也必须弹出结算
  if (state.phase === 'over') onGameOver(state)
}

function safeCall(fn: () => void, label: string): void {
  try {
    fn()
  } catch (error) {
    console.warn(`[tetris] ${label} failed:`, error)
  }
}

function vibrate(): void {
  try {
    uni.vibrateShort({})
  } catch {
    // H5 可能无振动
  }
}

function onGameOver(state: TetrisState): void {
  if (gameOver.value) return // 事件路径 + 相位兜底双入口,防重复提交
  gameOver.value = true
  playTetrisSound('gameover')
  const previous = best.value
  if (!previous || state.score > previous.score) {
    best.value = { score: state.score, lines: state.lines, level: state.level }
    isNewBest.value = state.score > 0
    try {
      uni.setStorageSync(BEST_KEY, JSON.stringify(best.value))
    } catch {
      // 存储失败不影响结束流程
    }
  } else {
    isNewBest.value = false
  }
  submitScore(state)
}

// ---------- 手势（棋盘区） ----------

const drag = createDragController(defaultDragConfig(layout.cell), {
  onMove: (dx) => input({ t: 'move', dx }),
  onSoftDrop: () => input({ t: 'softDrop' }),
  onTap: () => input({ t: 'rotate', dir: 1 }),
  onHardDrop: () => input({ t: 'hardDrop' }),
  onSwipeUp: () => input({ t: 'rotate', dir: 1 }),
})

// ---------- 按钮排 ----------

function onPadLeftDown(): void {
  beginMove(-1)
}
function onPadRightDown(): void {
  beginMove(1)
}
function rotatePiece(): void {
  input({ t: 'rotate', dir: 1 })
}
function holdPiece(): void {
  input({ t: 'hold' })
  playTetrisSound('hold')
}
function hardDropPiece(): void {
  input({ t: 'hardDrop' })
}

// ---------- 速度模式 ----------

/** 切换下落速度：菜单里只改偏好;对局内经 setSpeedMode 即时生效（恒定 = 重力间隔恒取起始档）。 */
function pickSpeed(mode: SpeedMode): void {
  if (speedMode.value === mode) return
  speedMode.value = mode
  try {
    uni.setStorageSync(SPEED_KEY, mode)
  } catch {
    // 存储失败本次会话仍生效
  }
  if (panel.value === 'game') input({ t: 'setSpeedMode', mode })
}

function readSpeedMode(): SpeedMode {
  try {
    return uni.getStorageSync(SPEED_KEY) === 'constant' ? 'constant' : 'progressive'
  } catch {
    return 'progressive'
  }
}

// ---------- 面板切换 ----------

async function startGame(): Promise<void> {
  panel.value = 'game'
  await nextTick()
  await initCanvas()
  beginRound()
}

function beginRound(): void {
  gameOver.value = false
  isNewBest.value = false
  submitRank.value = null
  startEngine(startLevel.value, speedMode.value)
}

function restartGame(): void {
  beginRound()
}

function pauseGame(): void {
  pause()
}

function exitToMenu(): void {
  destroy()
  releaseCanvas()
  gameOver.value = false
  panel.value = 'menu'
}

function viewLeaderboard(): void {
  if (!gameRankEnabled.value) return
  exitToMenu()
  loadLeaderboard()
}

async function initCanvas(): Promise<void> {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#tetris-board', instance)
    boardNode.canvas.width = Math.round(layout.totalW * boardNode.dpr)
    boardNode.canvas.height = Math.round(layout.totalH * boardNode.dpr)
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    if (gameState.value) drawState(gameState.value)
  } catch (error) {
    console.warn('[tetris] init canvas failed:', error)
  }
}

/** 页面卸载时把 canvas 缓冲缩到 1×1 释放内存（useBeadCanvas.release 同款）。 */
function releaseCanvas(): void {
  if (!boardNode) return
  try {
    boardNode.canvas.width = 1
    boardNode.canvas.height = 1
  } catch {
    // 忽略释放失败
  }
  boardNode = null
}

// ---------- 菜单交互 ----------

function pickLevel(v: number): void {
  startLevel.value = v
  try {
    uni.setStorageSync(LEVEL_KEY, String(v))
  } catch {
    // 存储失败下次回默认
  }
}

function toggleSound(): void {
  soundOn.value = !soundOn.value
  setTetrisSoundEnabled(soundOn.value)
  if (soundOn.value) playTetrisSound('rotate')
}

function readStartLevel(): number {
  try {
    const raw = uni.getStorageSync(LEVEL_KEY)
    const value = Number(raw)
    return Number.isFinite(value) ? Math.min(15, Math.max(1, Math.floor(value))) : 1
  } catch {
    return 1
  }
}

function readBest(): BestRecord | null {
  try {
    const raw = uni.getStorageSync(BEST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(String(raw)) as Partial<BestRecord>
    if (typeof parsed.score !== 'number' || typeof parsed.lines !== 'number' || typeof parsed.level !== 'number') return null
    return { score: parsed.score, lines: parsed.lines, level: parsed.level }
  } catch {
    return null
  }
}

// ---------- 生命周期 ----------

onMounted(() => {
  void refreshFeatures().then(() => {
    if (gameRankEnabled.value) loadLeaderboard()
  })
})

onShow(() => {
  // 后台切回不自动恢复——停在暂停遮罩,用户点「继续」才继续（避免突然落块）
})

onHide(() => {
  if (panel.value === 'game' && running.value && !gameOver.value) pause()
})

onUnload(() => {
  destroy()
  releaseCanvas()
})

onShareAppMessage(() => ({
  title: '俄罗斯方块 · 经典方块冲榜挑战',
  path: '/pages-games/tetris/index',
}))

const rulesSections = [
  {
    heading: '操作',
    lines: [
      '棋盘手势：左右拖动逐格移动，向下拖动软降，快速下滑硬降，点按或上滑旋转',
      '底部按钮：← / → 按住连发，旋转、HOLD 暂存、⤓ 直落（蓝色实底键，与快滑手势双通道）',
      'HOLD 每个块只能用一次，落块后恢复',
    ],
  },
  {
    heading: '等级与速度',
    lines: [
      '下落速度二选一：「越消越快」每 10 行升级加速（默认）/「恒定速度」全程同一速度',
      '速度模式对局内可随时切换，选择会被记住',
      '开局可选起始等级 1~15；每消除 10 行升 1 级（计分跟着涨）',
    ],
  },
  {
    heading: '计分',
    lines: [
      '消行：1 行 100 / 2 行 300 / 3 行 500 / 4 行 800，乘以当前等级',
      '软降每格 +1，硬降每格 +2',
      '方块堆到顶部即结束，最高分自动记录并上榜',
    ],
  },
]
</script>

<style lang="scss" scoped>
// v4 小清新皮肤（原型 lobby-tetris / play-tetris）:冷调蓝白 + 马卡龙方块,字重降档
$t-ink: $ink;
$t-dim: $ink2;
$t-faint: $ink3;
$t-blue: $blue;
$t-blue-deep: $blue-deep;
$t-blue-tint: $blue-tint;
$t-line: $line;
$t-line-strong: $line-strong;
$t-red: $red;
$mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;

.tetris {
  min-height: 100vh;
  padding: $space-3 $space-3 calc($space-3 + env(safe-area-inset-bottom));
  background: $bg;

  &__menu {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 48rpx - env(safe-area-inset-bottom));
  }

  // ---------- 主页头部 ----------

  &__hero {
    padding: $space-2 0 $space-1;
  }

  &__deco {
    display: flex;
    gap: $space-4;
    align-items: flex-end;
    padding: $space-2 $space-1;
  }

  &__deco-piece {
    position: relative;
  }

  &__deco-cell {
    position: absolute;
    width: 13px;
    height: 13px;
    border-radius: 4px;

    &--sm {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: $space-2;
    margin-top: $space-2;
  }

  &__title-copy {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__kicker {
    font-size: 20rpx;
    letter-spacing: 5rpx;
    font-weight: 600;
    color: $blue-deep;
  }

  &__title {
    font-size: 60rpx;
    font-weight: 700;
    color: $t-ink;
    line-height: 1.2;
  }

  &__title-flex {
    flex: 1;
  }

  &__icon-btn {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: $card;
    border: 2rpx solid $line-strong;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $t-dim;
    font-size: $font-body;
  }

  &__subtitle {
    display: block;
    margin-top: $space-1;
    font-size: $font-caption;
    color: $t-dim;
  }

  // ---------- 开始按钮（蓝实底主行动） ----------

  &__start-btn {
    height: 96rpx;
    border-radius: $radius-md;
    background: $blue;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $space-2;
    margin-top: $space-3;
  }

  &__start-icon {
    color: #fff;
    font-size: $font-body;
  }

  &__start-text {
    color: #fff;
    font-size: 32rpx;
    font-weight: 600;
  }

  // ---------- 设置卡（下落速度 / 初始等级） ----------

  &__card {
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-lg;
  }

  &__settings {
    margin-top: $space-3;
    padding: $space-3;
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }

  &__opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-2;
  }

  &__opt-label {
    font-size: $font-body;
    font-weight: 600;
    color: $t-ink;
    flex: none;
  }

  &__opt-note {
    font-size: $font-micro;
    color: $t-faint;
    line-height: 1.6;
  }

  &__divider {
    height: 2rpx;
    background: $line;
  }

  &__chiprow {
    display: flex;
    gap: $space-2;
    flex: 1;
    justify-content: flex-end;
  }

  &__chip {
    border: 2rpx solid $line-strong;
    border-radius: $radius-pill;
    background: $card;
    padding: 10rpx 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $t-dim;
    font-size: $font-micro;

    &.is-active {
      background: $blue-tint;
      border-color: $blue;
      color: $blue-deep;
      font-weight: 600;
    }
  }

  &__chip--num {
    flex: 1;
    padding: 14rpx 0;

    text {
      font-family: $mono;
      font-size: $font-caption;
      font-weight: 600;
    }
  }

  // ---------- 战绩条 ----------

  &__best {
    display: flex;
    align-items: center;
    padding: $space-3 $space-4;
    margin-top: $space-3;
    gap: $space-3;
  }

  &__best-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    flex: 1;
  }

  &__best-num {
    font-size: 44rpx;
    font-weight: 300;
    color: $t-ink;
    font-variant-numeric: tabular-nums;
  }

  &__best-label {
    font-size: $font-micro;
    color: $t-faint;
  }

  &__rank-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    background: $blue-tint;
    border-radius: $radius-md;
    padding: $space-2 $space-3;
  }

  &__rank-trophy {
    font-size: 30rpx;
  }

  &__rank-text {
    font-size: 22rpx;
    font-weight: 600;
    color: $blue-deep;
  }

  // ---------- 排行榜 ----------

  &__board-list {
    margin-top: $space-4;
  }

  &__lb-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-2;
    padding: $space-6 $space-4;
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-lg;
    font-size: $font-caption;
    color: $t-dim;
  }

  &__lb-retry {
    padding: $space-1 $space-4;
    background: $fill;
    border-radius: $radius-pill;
    color: $t-ink;
    font-size: $font-caption;
  }

  &__lb {
    padding: $space-3 $space-3 $space-2;
    display: flex;
    flex-direction: column;
    gap: $space-1;
  }

  &__lb-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-1 $space-2;
  }

  &__lb-title {
    font-size: $font-body;
    font-weight: 600;
    color: $t-ink;
  }

  &__lb-count {
    font-size: $font-micro;
    color: $t-faint;
  }

  &__lb-mine {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: $blue-tint;
    border-radius: $radius-md;
    padding: $space-2 $space-3;
    margin-bottom: $space-1;

    &-name {
      font-size: $font-caption;
      color: $t-dim;
    }

    &-val {
      font-size: $font-caption;
      font-weight: 600;
      color: $blue-deep;
    }
  }

  &__lb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: $radius-md;
    padding: $space-2 $space-3;

    &.is-me {
      background: $fill;
    }
  }

  &__lb-left {
    display: flex;
    align-items: center;
    gap: $space-2;
    min-width: 0;
  }

  &__lb-rank {
    width: 32rpx;
    text-align: center;
    font-size: $font-caption;
    font-weight: 600;
  }

  &__lb-avatar {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    background: $fill;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    &-char {
      font-size: $font-caption;
      color: $t-faint;
    }
  }

  &__lb-name {
    font-size: $font-caption;
    color: $t-ink;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__lb-score {
    font-size: $font-caption;
    font-weight: 500;
    color: $t-ink;
    font-variant-numeric: tabular-nums;
  }

  // ---------- 游戏面板 ----------

  &__menu-flex {
    flex: 1;
  }

  &__game {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 48rpx - env(safe-area-inset-bottom));
  }

  // 三枚 statchip + 暂停（原型 .battletop）
  &__battletop {
    display: flex;
    align-items: stretch;
    gap: $space-2;
    padding-top: $space-1;
  }

  &__statchip {
    flex: 1;
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-md;
    padding: $space-2 20rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rpx;
    min-width: 0;

    &-v {
      font-size: 32rpx;
      font-weight: 300;
      letter-spacing: 1rpx;
      color: $t-ink;
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;

      &--accent {
        color: $blue-deep;
        font-weight: 600;
      }
    }

    &-k {
      font-size: 20rpx;
      color: $t-faint;
    }
  }

  &__pause-btn {
    width: 72rpx;
    align-self: stretch;
    border-radius: $radius-md;
    background: $card;
    border: 2rpx solid $line-strong;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $t-dim;
    font-size: $font-body;
  }

  // 对局内速度切换（恒定/渐进 即时生效）
  &__speedrow {
    display: flex;
    justify-content: center;
    gap: $space-2;
    padding: $space-2 0 0;
  }

  &__speed-chip {
    border: 2rpx solid $line-strong;
    border-radius: $radius-pill;
    background: $card;
    padding: 6rpx 24rpx;
    color: $t-dim;
    font-size: $font-micro;

    &.is-active {
      background: $blue-tint;
      border-color: $blue;
      color: $blue-deep;
      font-weight: 600;
    }
  }

  &__stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  &__stage-inner {
    position: relative;
  }

  &__canvas {
    display: block;
  }

  &__hit {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  &__mask {
    // fixed 钉死视口：结算卡比画布高、面板 min-height 的 calc 在 MP 上求值不稳,都不能依赖
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(46, 65, 84, 0.45);
  }

  &__mask-card {
    width: 82%;
    max-width: 320px;
    max-height: 80vh;
    overflow-y: auto;
    background: $card;
    border: 2rpx solid $line;
    border-radius: $radius-lg;
    padding: $space-5 $space-4 $space-3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-2;
  }

  &__mask-title {
    font-size: $font-title;
    font-weight: 600;
    color: $t-ink;
  }

  &__mask-btn {
    width: 100%;
    height: 88rpx;
    border-radius: $radius-md;
    background: $fill;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $t-ink;
    font-size: $font-body;

    &--primary {
      background: $blue;
      color: #fff;
      font-weight: 600;
    }
  }

  &__over-card {
    // 结算卡更高,允许滚动容器内自然展开
  }

  &__over-deco {
    display: flex;
    gap: $space-3;
    align-items: flex-end;
    height: 24px;
  }

  &__over-title {
    font-family: $mono;
    font-size: 30rpx;
    font-weight: 600;
    letter-spacing: 10rpx;
    color: $t-red;
  }

  &__over-badge {
    background: $blue-tint;
    border-radius: $radius-pill;
    padding: 6rpx 24rpx;
    font-size: $font-caption;
    font-weight: 600;
    color: $blue-deep;
  }

  &__over-score {
    font-size: 88rpx;
    font-weight: 300;
    color: $t-ink;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  &__over-sub {
    font-size: $font-caption;
    color: $t-dim;
  }

  &__over-rank {
    display: flex;
    align-items: center;
    gap: $space-1;

    &-trophy {
      font-size: 28rpx;
    }

    &-text {
      font-size: $font-caption;
      font-weight: 600;
      color: $blue-deep;
    }
  }

  // ---------- 按钮排（原型 .ctrlbar：白键 + accent 旋转 + 蓝实底直落 + 隔离带 + HOLD） ----------

  &__pad {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14rpx;
    padding: $space-2 0 0;
  }

  &__pad-iso {
    width: 32rpx;
    flex: none;
  }

  &__key {
    height: 108rpx;
    border-radius: $radius-md;
    background: $card;
    border: 2rpx solid $line-strong;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rpx;
    color: $t-ink;
    flex: none;

    &--move {
      width: 108rpx;
    }

    &--accent {
      width: 140rpx;
      background: $blue-tint;
      border-color: $blue;
      color: $blue-deep;
    }

    &--drop {
      width: 112rpx;
      background: $blue;
      border-color: $blue;
      color: #fff;
    }
  }

  &__key-icon {
    font-size: 34rpx;
    line-height: 1.1;
  }

  &__key-label {
    font-size: 20rpx;
    font-weight: 600;
  }

  &__hint {
    padding: $space-2 0 0;
    text-align: center;
    font-size: $font-micro;
    color: $t-faint;
  }
}
</style>
