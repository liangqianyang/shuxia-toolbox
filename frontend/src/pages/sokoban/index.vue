<template>
  <view class="sok">
    <!-- ═══════════ 主页（选关,奶油暖色皮肤,照原型帧 01） ═══════════ -->
    <scroll-view v-if="panel === 'home'" class="sok__home" scroll-y :show-scrollbar="false">
      <view class="sok__hero">
        <view class="sok__deco">
          <view class="sok__deco-man">
            <view class="sok__deco-hat"></view>
            <view class="sok__deco-face"></view>
          </view>
          <view class="sok__deco-box"></view>
          <view class="sok__deco-box sok__deco-box--gold"></view>
          <view class="sok__deco-dot sok__deco-dot--gold"></view>
          <view class="sok__deco-dot sok__deco-dot--red"></view>
        </view>
        <view class="sok__title-row">
          <text class="sok__title">推箱子</text>
          <view class="sok__star-pill" @tap="openRank">
            <text class="sok__star-pill-icon">★</text>
            <text class="sok__star-pill-num">{{ totalStars }} / {{ maxStars }}</text>
          </view>
          <view class="sok__flex"></view>
          <view class="sok__icon-btn" @tap="toggleSound">
            <text>{{ soundOn ? '🔊' : '🔇' }}</text>
          </view>
          <view class="sok__icon-btn" @tap="showRules = true">
            <text>ⓘ</text>
          </view>
        </view>
        <text class="sok__subtitle">把木箱推上落叶标记 · 步数越少星越多</text>
      </view>

      <view class="sok__chapters">
        <view v-for="(chapter, ci) in CHAPTERS" :key="chapter.key" class="sok__chapter" :class="{ 'is-locked': !chapterUnlocked(ci) }">
          <view class="sok__chapter-head">
            <view class="sok__chapter-dot" :style="{ background: chapter.color }"></view>
            <text class="sok__chapter-name">{{ chapter.name }}</text>
            <view class="sok__flex"></view>
            <text v-if="chapterUnlocked(ci)" class="sok__chapter-progress">{{ chapterCleared(ci) }} / {{ LEVELS_PER_CHAPTER }}</text>
            <text v-else class="sok__chapter-progress">敬请期待</text>
          </view>
          <text v-if="chapterUnlocked(ci)" class="sok__chapter-tag">{{ chapter.tagline }}</text>
          <view v-if="chapterUnlocked(ci)" class="sok__levels">
            <view
              v-for="def in chapterLevels(ci)"
              :key="def.id"
              class="sok__level"
              :class="{
                'is-cleared': !!progress.levels[def.id],
                'is-current': def.id === currentLevelId,
              }"
              @tap="tapLevel(def.id)"
            >
              <text class="sok__level-num">{{ def.id }}</text>
              <view class="sok__level-stars">
                <text
                  v-for="s in 3"
                  :key="s"
                  class="sok__level-star"
                  :class="{ 'is-on': (progress.levels[def.id]?.stars ?? 0) >= s }"
                >★</text>
              </view>
            </view>
          </view>
          <view v-else class="sok__chapter-lock">
            <text class="sok__chapter-lock-icon">🔒</text>
            <text class="sok__chapter-lock-text">{{ chapterLockHint(ci) }}</text>
          </view>
        </view>
      </view>

      <view class="sok__home-foot">
        <text>支持无限撤销 · 卡住时点提示看下一步 · 不扣星</text>
      </view>
      <view class="sok__home-safe"></view>
    </scroll-view>

    <!-- ═══════════ 对局面板（照原型帧 02-04） ═══════════ -->
    <view v-else class="sok__game">
      <view class="sok__bar">
        <view class="sok__back-btn" @tap="showExit = true">
          <text class="sok__back-icon">‹</text>
        </view>
        <view class="sok__bar-level">
          <text class="sok__bar-name">第 {{ levelId }} 关</text>
          <text class="sok__bar-chapter">{{ chapterOf(levelId).name }}</text>
        </view>
        <view class="sok__flex"></view>
        <view class="sok__bar-stat">
          <text class="sok__bar-num">{{ view?.steps ?? 0 }}</text>
          <text class="sok__bar-label">步数</text>
        </view>
        <view class="sok__bar-stat">
          <text class="sok__bar-num sok__bar-num--gold">≤{{ view?.level.threeStar ?? 0 }}</text>
          <text class="sok__bar-label">三星步数</text>
        </view>
      </view>

      <view class="sok__stage">
        <view class="sok__stage-inner" :style="{ width: layout.boardW + 'px', height: layout.boardH + 'px' }">
          <canvas
            v-show="!gameOver && !showExit && !showStuck"
            id="sok-board"
            type="2d"
            class="sok__canvas"
            :style="{ width: layout.boardW + 'px', height: layout.boardH + 'px' }"
          ></canvas>
          <view
            v-show="!gameOver && !showExit && !showStuck"
            class="sok__hit"
            @touchstart="onTouchStart"
            @touchmove.stop="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchCancel"
          ></view>
        </view>
      </view>

      <view class="sok__pad">
        <view class="sok__pad-btn" @tap="undoTap">
          <text class="sok__pad-icon">↩</text>
          <text>撤销</text>
        </view>
        <view class="sok__pad-btn" @tap="resetTap">
          <text class="sok__pad-icon">↺</text>
          <text>重开</text>
        </view>
        <view class="sok__pad-btn sok__pad-btn--gold" @tap="hintTap">
          <text class="sok__pad-icon">💡</text>
          <text>提示</text>
        </view>
      </view>
      <view class="sok__hint">
        <text>{{ footerText }}</text>
      </view>

      <!-- 返回确认（照原型帧 04） -->
      <view v-if="showExit" class="sok__mask">
        <view class="sok__card">
          <view class="sok__card-man">
            <view class="sok__deco-hat sok__deco-hat--lg"></view>
            <view class="sok__deco-face sok__deco-face--lg"></view>
          </view>
          <text class="sok__card-title">返回选关？</text>
          <text class="sok__card-sub">当前步数不会保存</text>
          <view class="sok__card-btn sok__card-btn--primary" @tap="showExit = false"><text>留下</text></view>
          <view class="sok__card-btn" @tap="exitToHome"><text>返回选关</text></view>
        </view>
      </view>

      <!-- 结算（照原型帧 06-08：三星/二星/章完成共用一卡,徽章与按钮组按状态变体） -->
      <view v-if="gameOver && result" class="sok__mask">
        <view class="sok__card">
          <view class="sok__card-deco">
            <view class="sok__deco-man">
              <view class="sok__deco-hat sok__deco-hat--lg"></view>
              <view class="sok__deco-face sok__deco-face--lg"></view>
            </view>
            <view class="sok__deco-box sok__deco-box--lg"></view>
            <view class="sok__deco-box sok__deco-box--lg sok__deco-box--gold"></view>
          </view>
          <text class="sok__card-title">{{ result.chapterComplete ? '本章完成！' : '过关！' }}</text>
          <view class="sok__card-stars">
            <text
              v-for="s in 3"
              :key="s"
              class="sok__card-star"
              :class="[s === 2 ? 'is-mid' : '', s <= result.stars ? 'is-on' : '']"
            >★</text>
          </view>
          <view v-if="result.badge" class="sok__card-badge">
            <text>{{ result.badge }}</text>
          </view>
          <text class="sok__card-data">步数 {{ result.steps }} · 三星门槛 ≤{{ result.threeStar }}</text>
          <text class="sok__card-progress">{{ result.progress }}</text>
          <view v-if="result.hasNext" class="sok__card-btn sok__card-btn--primary" @tap="nextLevel">
            <text>下一关</text>
            <text class="sok__card-arrow">›</text>
          </view>
          <view v-else class="sok__card-btn sok__card-btn--primary" @tap="exitToHome"><text>返回选关</text></view>
          <view class="sok__card-btn" @tap="restartLevel">
            <text>{{ result.stars >= 3 ? '重玩本关' : '重玩冲三星' }}</text>
          </view>
          <view v-if="result.hasNext" class="sok__card-btn" @tap="exitToHome"><text>返回选关</text></view>
        </view>
      </view>

      <!-- 卡住（照原型帧 09：箱子进死角,温柔三按钮） -->
      <view v-if="showStuck" class="sok__mask">
        <view class="sok__card">
          <view class="sok__card-man">
            <view class="sok__deco-hat sok__deco-hat--lg"></view>
            <view class="sok__deco-face sok__deco-face--lg"></view>
          </view>
          <text class="sok__card-title">卡住了？</text>
          <text class="sok__card-sub">这只箱子推不到落叶点了</text>
          <view class="sok__card-btn sok__card-btn--primary" @tap="stuckUndo"><text>撤销一步</text></view>
          <view class="sok__card-btn" @tap="stuckReset"><text>重开本关</text></view>
          <view class="sok__card-btn" @tap="showStuck = false"><text>再想想，自己推推看</text></view>
        </view>
      </view>
    </view>

    <GameRulesModal :visible="showRules" title="推箱子 · 玩法说明" :sections="rulesSections" @close="showRules = false" />

    <!-- 总星数排行榜（game_scores） -->
    <view v-if="showRank" class="sok__mask" @tap="showRank = false">
      <view class="sok__rank" @tap.stop>
        <view class="sok__rank-head">
          <text class="sok__rank-title">收星总榜</text>
          <text class="sok__rank-close" @tap="showRank = false">✕</text>
        </view>
        <view v-if="rankLoading" class="sok__rank-hint"><text>加载中…</text></view>
        <view v-else-if="rankError" class="sok__rank-hint">
          <text>{{ rankError }}</text>
          <view class="sok__rank-retry" @tap="loadRank"><text>重试</text></view>
        </view>
        <view v-else-if="!rank || rank.entries.length === 0" class="sok__rank-hint">
          <text>🍁 虚位以待,推一关成为第一个上榜的枫友</text>
        </view>
        <scroll-view v-else scroll-y class="sok__rank-list" :show-scrollbar="false">
          <view v-if="rank.mine" class="sok__rank-mine">
            <text>我的成绩{{ myNickname ? ' · ' + myNickname : '' }}</text>
            <text>第 {{ rank.mine.rank }} 名 · {{ rank.mine.score }} 星</text>
          </view>
          <view v-for="entry in rank.entries" :key="entry.rank" class="sok__rank-row" :class="{ 'is-me': entry.nickname === myNickname }">
            <text class="sok__rank-no" :style="{ color: rankColor(entry.rank) }">{{ entry.rank }}</text>
            <text class="sok__rank-name">{{ entry.nickname }}</text>
            <text class="sok__rank-score">{{ entry.score }} 星 · {{ entry.levels }} 关</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 推箱子页（单机,布局照 Pen 原型 docs/sokoban-redesign/ 九帧）：
 * 主页 = 装饰行 + 星数丸（点开总星数榜）+ 音效/规则钮 + 章节卡（内嵌关卡格）;
 * 对局 = 数据栏 + 弹性居中棋盘（canvas + 四向滑动 hit 层）+ 撤销/重开/提示 + 三个浮层。
 * 引擎 utils/sokoban.ts、求解器 sokobanSolver.ts、关卡 sokobanLevels.ts、
 * 绘帧 sokobanRender.ts、回合控制 composables/useSokoban.ts——页面只做节点获取/特效/进度。
 * 世界观：秋深了,帮枫叶小屋归置物资过冬（章节 = 离小屋越来越远的收纳地）。
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'
import { onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import GameRulesModal from '@/components/GameRulesModal.vue'
import { useSokoban } from '@/composables/useSokoban'
import { storedUser } from '@/services/toolbox'
import { fetchSokobanLeaderboard, submitSokobanScore, type SokobanLeaderboard } from '@/services/sokoban'
import { getCanvasNode, getWindowInfo, type CanvasNode } from '@/utils/canvasAdapter'
import { computeSokobanLayout, drawSokobanFrame, type SokobanLayout } from '@/utils/sokobanRender'
import { createSwipeController, type SokobanDir } from '@/utils/sokobanGestures'
import { playSokobanSound, setSokobanSoundEnabled, sokobanSoundEnabled } from '@/utils/sokobanSound'
import { DIR_NAMES, parseLevel, starsFor } from '@/utils/sokoban'
import { CHAPTERS, LEVELS, LEVELS_PER_CHAPTER, chapterOf } from '@/utils/sokobanLevels'
import type { SokobanLevelDef, SokobanState } from '@/utils/sokoban'

const PROGRESS_KEY = 'shuxia_sokoban_progress_v1'

interface ProgressRecord {
  levels: Record<number, { stars: number; bestSteps: number }>
}

interface ResultCard {
  stars: number
  steps: number
  threeStar: number
  badge: string
  progress: string
  chapterComplete: boolean
  hasNext: boolean
}

const instance = getCurrentInstance()
const panel = ref<'home' | 'game'>('home')
const showRules = ref(false)
const showExit = ref(false)
const showStuck = ref(false)
const showRank = ref(false)
const gameOver = ref(false)
const result = ref<ResultCard | null>(null)
const levelId = ref(1)
const soundOn = ref(sokobanSoundEnabled())

// ---------- 进度（本地） ----------

const progress = ref<ProgressRecord>(readProgress())

function readProgress(): ProgressRecord {
  try {
    const raw = uni.getStorageSync(PROGRESS_KEY)
    if (!raw) return { levels: {} }
    const parsed = JSON.parse(String(raw)) as Partial<ProgressRecord>
    if (!parsed.levels || typeof parsed.levels !== 'object') return { levels: {} }
    const levels: ProgressRecord['levels'] = {}
    for (const [k, v] of Object.entries(parsed.levels)) {
      const id = Number(k)
      if (Number.isFinite(id) && v && typeof v.stars === 'number' && typeof v.bestSteps === 'number') {
        levels[id] = { stars: v.stars, bestSteps: v.bestSteps }
      }
    }
    return { levels }
  } catch {
    return { levels: {} }
  }
}

function saveProgress(): void {
  try {
    uni.setStorageSync(PROGRESS_KEY, JSON.stringify(progress.value))
  } catch {
    // 存储失败不影响游戏
  }
}

const maxStars = LEVELS.length * 3
const totalStars = computed(() => Object.values(progress.value.levels).reduce((sum, r) => sum + r.stars, 0))
const totalCleared = computed(() => Object.keys(progress.value.levels).length)

function chapterLevels(ci: number): SokobanLevelDef[] {
  return LEVELS.filter((d) => d.chapter === ci + 1)
}

function chapterCleared(ci: number): number {
  return chapterLevels(ci).filter((d) => progress.value.levels[d.id]).length
}

/** 章解锁：第 1 章常开,通关上一章（20/20）解锁下一章。 */
function chapterUnlocked(ci: number): boolean {
  if (ci === 0) return true
  return chapterCleared(ci - 1) === LEVELS_PER_CHAPTER && chapterLevels(ci).length > 0
}

function chapterLockHint(ci: number): string {
  if (chapterLevels(ci).length === 0) return '敬请期待'
  return `通关${CHAPTERS[ci - 1].name}解锁`
}

/** 当前关 = 已解锁章节里第一关未通关的（都通了取最后一关）。 */
const currentLevelId = computed<number>(() => {
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    if (!chapterUnlocked(ci)) break
    const uncleared = chapterLevels(ci).find((d) => !progress.value.levels[d.id])
    if (uncleared) return uncleared.id
  }
  return Math.max(...Object.keys(progress.value.levels).map(Number), 1)
})

// ---------- 回合控制（返回值解构成顶层绑定——MP 响应性家法） ----------

const {
  state: gameState,
  hintBusy,
  start: startEngine,
  move,
  undo,
  reset,
  hint,
  destroy,
} = useSokoban({ onStateChange: handleStateChange })
const view = computed(() => gameState.value)
watch(gameState, (s) => {
  if (s && s.phase === 'won' && !gameOver.value) onWin(s)
})

function handleStateChange(state: SokobanState): void {
  safeCall(() => drawState(state), 'draw')
  for (const event of state.events) {
    safeCall(() => {
      switch (event.t) {
        case 'walked':
          playSokobanSound('walk')
          break
        case 'pushed':
          playSokobanSound(event.placed ? 'place' : 'push')
          break
        case 'deadlock':
          playSokobanSound('dead')
          showStuck.value = true
          break
        case 'won':
          onWin(state)
          break
        case 'undid':
          playSokobanSound('undo')
          break
        default:
          break
      }
    }, `event:${event.t}`)
  }
  if (state.phase === 'won') onWin(state)
}

function safeCall(fn: () => void, label: string): void {
  try {
    fn()
  } catch (error) {
    console.warn(`[sokoban] ${label} failed:`, error)
  }
}

// ---------- 布局与 canvas ----------

const win = getWindowInfo()
const SIDE_PAD_PX = 24
const BAR_PX = 84
const PAD_PX = 190
const layout = ref<SokobanLayout>(computeSokobanLayout(win.windowWidth - SIDE_PAD_PX, 320, 8, 8))
let boardNode: CanvasNode | null = null

function drawState(state: SokobanState): void {
  if (!boardNode) return
  drawSokobanFrame(boardNode.ctx, layout.value, state)
}

async function initCanvas(): Promise<void> {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#sok-board', instance)
    boardNode.canvas.width = Math.round(layout.value.boardW * boardNode.dpr)
    boardNode.canvas.height = Math.round(layout.value.boardH * boardNode.dpr)
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    if (gameState.value) drawState(gameState.value)
  } catch (error) {
    console.warn('[sokoban] init canvas failed:', error)
  }
}

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

// ---------- 手势（四向滑动,stepPx 随关卡格尺寸变） ----------

let swipe: { onTouchStart: (e: unknown) => void; onTouchMove: (e: unknown) => void; onTouchEnd: (e: unknown) => void; onTouchCancel: (e: unknown) => void } | null = null

function rebuildSwipe(): void {
  swipe = createSwipeController({ stepPx: Math.max(28, layout.value.cell) }, {
    onStep: (dir: SokobanDir) => move(dir),
  })
}

function onTouchStart(e: unknown): void {
  swipe?.onTouchStart(e)
}
function onTouchMove(e: unknown): void {
  swipe?.onTouchMove(e)
}
function onTouchEnd(e: unknown): void {
  swipe?.onTouchEnd(e)
}
function onTouchCancel(e: unknown): void {
  swipe?.onTouchCancel(e)
}

// ---------- 面板切换与关卡流程 ----------

async function tapLevel(id: number): Promise<void> {
  playSokobanSound('walk')
  await startLevel(id)
}

async function startLevel(id: number): Promise<void> {
  const def = LEVELS.find((d) => d.id === id)
  if (!def) return
  const level = parseLevel(def)
  levelId.value = id
  gameOver.value = false
  result.value = null
  showStuck.value = false
  showExit.value = false
  panel.value = 'game'
  await nextTick()
  sizeBoard(level)
  await initCanvas()
  startEngine(level)
}

/** 算棋盘格子：文档流布局(照 tetris)——canvas 与按钮是兄弟节点,再大也只会把按钮往下推,永远不会盖住。 */
function sizeBoard(level: ReturnType<typeof parseLevel>): void {
  const availW = win.windowWidth - SIDE_PAD_PX
  // 预留 数据栏+按钮排+提示行+页边距(宁大勿小,超出只是页面可滚动)
  const availH = Math.max(240, win.windowHeight - 240)
  layout.value = computeSokobanLayout(availW, availH, level.w, level.h)
  rebuildSwipe()
}

function restartLevel(): void {
  gameOver.value = false
  result.value = null
  showStuck.value = false
  reset()
}

async function nextLevel(): Promise<void> {
  await startLevel(Math.min(levelId.value + 1, LEVELS.length))
}

function exitToHome(): void {
  destroy()
  releaseCanvas()
  gameOver.value = false
  result.value = null
  showStuck.value = false
  showExit.value = false
  panel.value = 'home'
}

function onWin(state: SokobanState): void {
  if (gameOver.value) return // 事件路径 + watch 哨兵双入口,防重复结算
  gameOver.value = true
  playSokobanSound('win')
  const stars = starsFor(state.level, state.steps)
  const id = state.level.id
  const prev = progress.value.levels[id]
  const isNewRecord = !prev || state.steps < prev.bestSteps
  if (!prev || stars > prev.stars || state.steps < prev.bestSteps) {
    progress.value = {
      levels: {
        ...progress.value.levels,
        [id]: {
          stars: Math.max(stars, prev?.stars ?? 0),
          bestSteps: Math.min(state.steps, prev?.bestSteps ?? Infinity),
        },
      },
    }
    saveProgress()
    submitProgress()
  }
  const inChapter = id - (state.level.chapter - 1) * LEVELS_PER_CHAPTER
  const chapterComplete = inChapter === LEVELS_PER_CHAPTER
  const hasNext = id < LEVELS.length
  const gap = state.level.threeStar - state.steps
  result.value = {
    stars,
    steps: state.steps,
    threeStar: state.level.threeStar,
    badge: chapterComplete
      ? (stars === 3 ? '全章三星达成' : '本章通关')
      : stars === 3
        ? (isNewRecord ? '三星达成 · 新纪录' : '三星达成')
        : stars === 2
          ? `二星过关 · 距三星还差 ${gap} 步`
          : '一星过关 · 多试几次找捷径',
    progress: chapterComplete
      ? `${chapterOf(id).name} ${LEVELS_PER_CHAPTER} / ${LEVELS_PER_CHAPTER}` + (hasNext ? ` · ${chapterOf(id + 1).name}已解锁` : ' · 已是最后一章')
      : `${chapterOf(id).name} ${inChapter} / ${LEVELS_PER_CHAPTER}`,
    chapterComplete,
    hasNext,
  }
}

/** 得星/通关后 fire-and-forget 上报（未登录静默失败,本地进度兜底）。 */
async function submitProgress(): Promise<void> {
  const stars = totalStars.value
  const levels = totalCleared.value
  if (stars <= 0) return
  try {
    await submitSokobanScore(stars, levels)
  } catch (error) {
    console.warn('[sokoban] submit score failed:', error)
  }
}

// ---------- 对局按钮 ----------

function undoTap(): void {
  if (!undo()) playSokobanSound('walk')
}

function resetTap(): void {
  restartLevel()
  playSokobanSound('undo')
}

function hintTap(): void {
  if (gameOver.value) return
  if (hint()) {
    playSokobanSound('place')
  } else {
    // 求解器找不到出路 = 复杂死局,按卡住处理
    showStuck.value = true
    playSokobanSound('dead')
  }
}

function stuckUndo(): void {
  showStuck.value = false
  if (!undo()) restartLevel()
}

function stuckReset(): void {
  showStuck.value = false
  restartLevel()
}

const footerText = computed(() => {
  const s = gameState.value
  if (!s) return '滑动一格走一步 · 木箱只能推，不能拉'
  if (s.hint) return `提示：向${DIR_NAMES[s.hint.dir]}推这只箱子 · 不扣星`
  if (s.stuckBox !== null) return '这只箱子被推进死角啦 · 撤销一步或重开本关'
  return '滑动一格走一步 · 木箱只能推，不能拉'
})

// ---------- 排行榜 ----------

const rank = ref<SokobanLeaderboard | null>(null)
const rankLoading = ref(false)
const rankError = ref('')
const myNickname = computed(() => storedUser()?.nickname ?? '')

async function loadRank(): Promise<void> {
  rankLoading.value = true
  rankError.value = ''
  try {
    rank.value = await fetchSokobanLeaderboard(50)
  } catch (error) {
    rankError.value = error instanceof Error ? error.message : '排行榜加载失败'
  } finally {
    rankLoading.value = false
  }
}

function openRank(): void {
  showRank.value = true
  loadRank()
}

function rankColor(r: number): string {
  if (r === 1) return '#C08A1E'
  if (r === 2) return '#8A93A6'
  if (r === 3) return '#B4764A'
  return '#7D6F60'
}

// ---------- 杂项 ----------

function toggleSound(): void {
  soundOn.value = !soundOn.value
  setSokobanSoundEnabled(soundOn.value)
  if (soundOn.value) playSokobanSound('place')
}

onMounted(() => {
  rebuildSwipe()
  // #ifdef H5
  setTimeout(() => { startLevel(63) }, 300)
  // #endif
})

onUnload(() => {
  destroy()
  releaseCanvas()
})

onShareAppMessage(() => ({
  title: `我在枫叶小屋推箱子，已收 ${totalStars.value} 颗星 🍁`,
  path: '/pages/sokoban/index',
}))

const rulesSections = [
  {
    heading: '目标',
    lines: [
      '把全部木箱推到落叶点上就过关',
      '箱子只能推、不能拉；一次只能推一只',
      '秋深了——帮小屋把物资归位，从庭院一路收到雪线仓窖',
    ],
  },
  {
    heading: '操作',
    lines: [
      '棋盘上滑动，每滑一格走一步',
      '撤销不限次数；重开从本关开头再来',
      '卡住可点「提示」看下一步，不扣星',
    ],
  },
  {
    heading: '评星',
    lines: [
      '过关得 1 星',
      '不超过门槛 1.5 倍得 2 星',
      '步数 ≤ 三星门槛得 3 星',
      '每关只保留最高星，更少步数会刷新纪录',
    ],
  },
  {
    heading: '章节',
    lines: ['通关一章解锁下一章', '共五章 · 每章 20 关，逐关递增', '从落叶庭院一路收到雪线仓窖'],
  },
  {
    heading: '致谢',
    lines: ['部分关卡改编自 David W. Skinner 的 Microban 关卡集', 'Thanks to David W. Skinner for the Microban levels'],
  },
]
</script>

<style lang="scss" scoped>
$s-bg: #fff8f0;
$s-panel: #ffffff;
$s-panel-2: #f7eddf;
$s-line: #f0e4d7;
$s-text: #4a3f35;
$s-dim: #7d6f60;
$s-gold: #f4b942;
$s-gold-deep: #c08a1e;
$s-gold-ink: #6b4a12;
$s-red: #e85d4a;
$s-scrim: rgba(62, 50, 38, 0.72);
$s-wall: #b4855c;
$s-box: #d9a05b;

.sok {
  min-height: 100vh;
  background: $s-bg;
  color: $s-text;
  display: flex;
  flex-direction: column;
}
.sok__flex {
  flex: 1;
}

/* ---------- 主页 ---------- */
.sok__home {
  flex: 1;
  height: 100vh;
  padding: $space-3 $space-3 0;
  box-sizing: border-box;
}
.sok__hero {
  margin-bottom: $space-3;
}
.sok__deco {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 88rpx;
  padding-left: $space-1;
}
.sok__deco-man {
  position: relative;
  width: 56rpx;
  height: 56rpx;
}
.sok__deco-face {
  position: absolute;
  left: 5rpx;
  top: 5rpx;
  width: 46rpx;
  height: 46rpx;
  background: #fffdf8;
  border-radius: 50%;
}
/* 双眼（照原型 Sok/小人：中心左 5/32、右 2.5/32、上 4/32） */
.sok__deco-face::before,
.sok__deco-face::after {
  content: '';
  position: absolute;
  top: 16rpx;
  width: 4.5rpx;
  height: 4.5rpx;
  border-radius: 50%;
  background: #4a3f35;
}
.sok__deco-face::before {
  left: 14rpx;
}
.sok__deco-face::after {
  left: 27rpx;
}
.sok__deco-face--lg::before,
.sok__deco-face--lg::after {
  top: 21rpx;
  width: 6rpx;
  height: 6rpx;
}
.sok__deco-face--lg::before {
  left: 19rpx;
}
.sok__deco-face--lg::after {
  left: 37rpx;
}
.sok__deco-hat {
  position: absolute;
  left: 23rpx;
  top: -11rpx;
  width: 20rpx;
  height: 20rpx;
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23E85D4A'%20stroke-width='2.2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M11%2020A7%207%200%200%201%209.8%206.1C15.5%205%2017%204.48%2019%202c1%202%202%204.18%202%208%200%205.5-4.78%2010-10%2010Z'/%3E%3Cpath%20d='M2%2021c0-3%201.85-5.36%205.08-6C9.5%2014.52%2012%2013%2013%2012'/%3E%3C/svg%3E");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  /* 枫叶帽 = 原型 lucide leaf @11,-2 转 35°（CCW）,SVG 真路径 */
  transform: rotate(-35deg);
}
.sok__deco-face--lg {
  position: static;
  display: block;
  width: 62rpx;
  height: 62rpx;
  border: none;
}
.sok__deco-hat--lg {
  position: absolute;
  left: 31rpx;
  top: -15rpx;
  width: 26rpx;
  height: 26rpx;
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23E85D4A'%20stroke-width='2.2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M11%2020A7%207%200%200%201%209.8%206.1C15.5%205%2017%204.48%2019%202c1%202%202%204.18%202%208%200%205.5-4.78%2010-10%2010Z'/%3E%3Cpath%20d='M2%2021c0-3%201.85-5.36%205.08-6C9.5%2014.52%2012%2013%2013%2012'/%3E%3C/svg%3E");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transform: rotate(-35deg);
}
.sok__card-man {
  position: relative;
  width: 76rpx;
  height: 76rpx;
  margin: 0 auto;
}
.sok__deco-box {
  width: 52rpx;
  height: 52rpx;
  background: $s-box;
  border: 3rpx solid #b37f42;
  border-radius: 12rpx;
}
.sok__deco-box--gold {
  background: $s-gold;
  border-color: $s-gold-deep;
}
.sok__deco-box--lg {
  width: 64rpx;
  height: 64rpx;
}
.sok__deco-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
}
.sok__deco-dot--gold {
  background: $s-gold;
}
.sok__deco-dot--red {
  background: $s-red;
  width: 10rpx;
  height: 10rpx;
}
.sok__title-row {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-top: $space-2;
}
.sok__title {
  font-size: $font-display;
  font-weight: 800;
  color: $s-text;
}
.sok__star-pill {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: $s-panel-2;
  border-radius: $radius-pill;
  padding: 6rpx 18rpx;
}
.sok__star-pill-icon {
  color: $s-gold-deep;
  font-size: $font-body;
}
.sok__star-pill-num {
  font-size: $font-caption;
  color: $s-dim;
}
.sok__icon-btn {
  width: 64rpx;
  height: 64rpx;
  background: $s-panel-2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-body;
}
.sok__subtitle {
  display: block;
  margin-top: $space-2;
  font-size: $font-caption;
  color: $s-dim;
}

.sok__chapters {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}
.sok__chapter {
  background: $s-panel;
  border: 2rpx solid $s-line;
  border-radius: $radius-md;
  padding: $space-3 $space-3 $space-2;
}
.sok__chapter.is-locked {
  background: $s-panel-2;
  border-color: transparent;
}
.sok__chapter-head {
  display: flex;
  align-items: center;
  gap: $space-2;
}
.sok__chapter-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
}
.sok__chapter.is-locked .sok__chapter-dot {
  background: #b9a98f !important;
}
.sok__chapter-name {
  font-size: $font-title;
  font-weight: 700;
  color: $s-text;
}
.sok__chapter.is-locked .sok__chapter-name {
  color: #b9a98f;
}
.sok__chapter-progress {
  font-size: $font-caption;
  color: $s-dim;
}
.sok__chapter.is-locked .sok__chapter-progress {
  color: #b9a98f;
}
.sok__chapter-tag {
  display: block;
  margin-top: 4rpx;
  font-size: $font-micro;
  color: $s-dim;
}
.sok__levels {
  display: flex;
  flex-wrap: wrap;
  gap: $space-1;
  margin-top: $space-2;
}
.sok__level {
  /* 一行 5 个：固定 rpx 宽——calc 百分比在真机会被 px 取整挤掉第 5 个
     （页边距 24×2 + 卡边距 24×2 + 边框 2×2 → 内容 650rpx,5×122 + 4×8 = 642 ✓） */
  width: 122rpx;
  background: $s-panel-2;
  border-radius: $radius-sm;
  padding: $space-1 0 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
}
.sok__level.is-current {
  background: #fff6e3;
  border: 2rpx solid $s-gold;
}
.sok__level-num {
  font-size: $font-title;
  font-weight: 700;
  color: $s-text;
  line-height: 1.1;
}
.sok__level.is-current .sok__level-num {
  color: $s-gold-deep;
}
.sok__level-stars {
  display: flex;
  gap: 1rpx;
}
.sok__level-star {
  font-size: 18rpx;
  color: #dccdb6;
}
.sok__level-star.is-on {
  color: $s-gold-deep;
}
.sok__chapter-lock {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-top: $space-1;
}
.sok__chapter-lock-icon {
  font-size: $font-body;
}
.sok__chapter-lock-text {
  font-size: $font-caption;
  color: #b9a98f;
}
.sok__home-foot {
  margin-top: $space-3;
  text-align: center;
  font-size: $font-micro;
  color: #8b7b6b;
}
.sok__home-safe {
  height: calc(40rpx + env(safe-area-inset-bottom));
}

/* ---------- 对局 ---------- */
.sok__game {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: $space-2 $space-3 0;
  box-sizing: border-box;
}
.sok__bar {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 96rpx;
}
.sok__back-btn {
  width: 72rpx;
  height: 72rpx;
  background: $s-panel-2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sok__back-icon {
  font-size: 44rpx;
  color: $s-dim;
  line-height: 1;
  margin-top: -6rpx;
}
.sok__bar-level {
  display: flex;
  flex-direction: column;
}
.sok__bar-name {
  font-size: $font-title;
  font-weight: 700;
}
.sok__bar-chapter {
  font-size: $font-micro;
  color: $s-dim;
}
.sok__bar-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.sok__bar-num {
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.1;
}
.sok__bar-num--gold {
  color: $s-gold-deep;
}
.sok__bar-label {
  font-size: $font-micro;
  color: $s-dim;
}
.sok__stage {
  /* 文档流(tetris 家法)：高度=画布高度,按钮排在画布之后——原生组件层级再高也无重叠区可盖 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-2 0;
}
.sok__stage-inner {
  position: relative;
}
.sok__canvas {
  display: block;
}
.sok__hit {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
}
.sok__pad {
  display: flex;
  gap: $space-2;
  padding: $space-2 0 0;
}
.sok__pad-btn {
  flex: 1;
  height: 96rpx;
  background: $s-panel;
  border: 2rpx solid $s-line;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  font-size: $font-body;
  color: $s-text;
}
.sok__pad-btn--gold {
  background: $s-gold;
  border-color: $s-gold;
  color: $s-gold-ink;
  font-weight: 700;
}
.sok__pad-icon {
  font-size: $font-body;
}
.sok__hint {
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-micro;
  color: $s-gold-deep;
  padding-bottom: env(safe-area-inset-bottom);
}

/* ---------- 浮层（fixed 挂对局根,不进 canvas 容器） ---------- */
.sok__mask {
  /* 四边显式钉死视口（tetris 家法：不依赖 inset 简写） */
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: $s-scrim;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 76rpx;
}
.sok__card {
  width: 100%;
  /* 原型卡底是 $tet-bg 奶油色(#FFF8F0)而非纯白——#FFFDF8 的脸在纯白上会隐形 */
  background: #fff8f0;
  border-radius: 40rpx;
  padding: 56rpx 44rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.sok__card-deco {
  display: flex;
  align-items: center;
  gap: $space-2;
}
.sok__card-title {
  font-size: $font-display;
  font-weight: 800;
}
.sok__card-sub {
  font-size: $font-body;
  color: $s-dim;
  margin-top: -12rpx;
}
.sok__card-stars {
  display: flex;
  align-items: center;
  gap: $space-1;
}
.sok__card-star {
  font-size: 56rpx;
  color: #dccdb6;
}
.sok__card-star.is-mid {
  font-size: 80rpx;
}
.sok__card-star.is-on {
  color: $s-gold;
}
.sok__card-badge {
  background: rgba(244, 185, 66, 0.15);
  color: $s-gold-deep;
  border-radius: $radius-pill;
  padding: 6rpx 24rpx;
  font-size: $font-micro;
}
.sok__card-data {
  font-size: $font-caption;
  color: $s-dim;
}
.sok__card-progress {
  font-size: $font-micro;
  color: $s-dim;
  margin-top: -12rpx;
}
.sok__card-btn {
  width: 100%;
  height: 88rpx;
  border-radius: 28rpx;
  background: $s-panel-2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: $font-body;
  color: $s-text;
}
.sok__card-btn--primary {
  background: $s-gold;
  color: $s-gold-ink;
  font-weight: 700;
}
.sok__card-arrow {
  font-size: $font-title;
  line-height: 1;
}

/* ---------- 排行榜 ---------- */
.sok__rank {
  width: 100%;
  max-height: 72vh;
  background: #fff8f0;
  border-radius: 40rpx;
  padding: $space-3 $space-3 $space-2;
  display: flex;
  flex-direction: column;
}
.sok__rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-2;
}
.sok__rank-title {
  font-size: $font-title;
  font-weight: 800;
}
.sok__rank-close {
  font-size: $font-title;
  color: $s-dim;
  padding: 8rpx 16rpx;
}
.sok__rank-list {
  max-height: 56vh;
}
.sok__rank-hint {
  padding: $space-4 0;
  text-align: center;
  font-size: $font-caption;
  color: $s-dim;
}
.sok__rank-retry {
  margin-top: $space-2;
  color: $s-gold-deep;
}
.sok__rank-mine {
  display: flex;
  justify-content: space-between;
  background: #fff6e3;
  border-radius: $radius-sm;
  padding: $space-2;
  font-size: $font-caption;
  color: $s-gold-deep;
  margin-bottom: $space-2;
}
.sok__rank-row {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2;
  border-bottom: 2rpx solid $s-line;
  font-size: $font-caption;
}
.sok__rank-row.is-me {
  background: #fff6e3;
}
.sok__rank-no {
  width: 48rpx;
  font-weight: 800;
}
.sok__rank-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sok__rank-score {
  color: $s-dim;
}
</style>
