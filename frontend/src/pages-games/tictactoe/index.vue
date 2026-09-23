<template>
  <view class="ttt">
    <!-- 大厅 -->
    <GameLobby
      v-if="!state"
      name="井字棋"
      description="三连成线 · 猜拳定先手 · 快局"
      :icon="cdnUrl('/static/icons/tictactoe-1.png')"
      pastel-key="tictactoe"
      :busy="busy"
      @create="onCreate"
      @join="onJoinCode"
      @rules="rulesOpen = true"
    />

    <!-- 房间 -->
    <view v-else class="ttt__room">
      <view class="ttt__topbar">
        <view class="ttt__back" hover-class="press" @tap="onBack">
          <text class="ttt__back-icon">‹</text>
        </view>
        <view class="ttt__title">
          <text class="ttt__title-main">井字棋</text>
          <text class="ttt__title-sub">房间码 {{ state.code }} · 三连快局</text>
        </view>
        <view class="ttt__score">
          <text class="ttt__score-num">{{ state.scores.x }}</text>
          <text class="ttt__score-sep">:</text>
          <text class="ttt__score-num">{{ state.scores.o }}</text>
        </view>
      </view>

      <!-- 对手栏（O 方在上） -->
      <view class="ttt__bar">
        <view v-if="roomChat.chatBubbles['o']" class="ttt__bubble" :class="{ 'ttt__bubble--emoji': roomChat.chatBubbles['o'].isEmoji }">{{ roomChat.chatBubbles['o'].text }}</view>
        <view class="ttt__avatar ttt__avatar--o">
          <image v-if="state.oPlayer?.avatarUrl" class="ttt__avatar-img" :src="avatarOf(state.oPlayer.avatarUrl)" mode="aspectFill" />
          <text v-else class="ttt__avatar-hint">👤</text>
        </view>
        <view class="ttt__bar-info">
          <view class="ttt__bar-row">
            <text class="ttt__bar-name">{{ state.oPlayer?.nickname || '等待加入' }}</text>
            <view class="ttt__pill ttt__pill--o"><text>O 方</text></view>
            <text v-if="state.oPlayer" class="ttt__dot" :class="{ 'ttt__dot--off': !state.oPlayer.online }"></text>
          </view>
          <text class="ttt__bar-status">{{ opponentStatusText }}</text>
        </view>
        <button v-if="state.status === 'waiting'" class="ttt__invite" open-type="share">邀请</button>
      </view>

      <!-- 棋盘卡（白卡 + 米白面板 + 四道深色 # 网格线,照原型 01-对局;网格线在格子层之下不挡点击） -->
      <view class="ttt__board-card" :style="{ width: cardWidth + 'px' }">
        <view class="ttt__board" :style="{ width: boardSize + 'px', height: boardSize + 'px' }">
          <view class="ttt__line ttt__line--v" :style="{ left: cellSize - 3 + 'px' }"></view>
          <view class="ttt__line ttt__line--v" :style="{ left: cellSize * 2 - 3 + 'px' }"></view>
          <view class="ttt__line ttt__line--h" :style="{ top: cellSize - 3 + 'px' }"></view>
          <view class="ttt__line ttt__line--h" :style="{ top: cellSize * 2 - 3 + 'px' }"></view>
          <view
            v-for="(cell, i) in cells"
            :key="i"
            class="ttt__cell"
            :class="{
              'ttt__cell--win': state.winLine !== null && WIN_LINES[state.winLine]?.includes(i),
              'ttt__cell--hint': hintIndex === i,
            }"
            hover-class="press"
            @tap="onCellTap(i)"
          >
            <view v-if="cell === 'x'" class="ttt__mark-x">
              <view class="ttt__x-bar ttt__x-bar--a"></view>
              <view class="ttt__x-bar ttt__x-bar--b"></view>
            </view>
            <view v-else-if="cell === 'o'" class="ttt__mark-o"></view>
          </view>
        </view>
      </view>

      <!-- 我的栏（X 方在下） -->
      <view class="ttt__bar ttt__bar--me">
        <view v-if="isMyTurn" class="ttt__turn-bar"></view>
        <view v-if="roomChat.chatBubbles['x']" class="ttt__bubble" :class="{ 'ttt__bubble--emoji': roomChat.chatBubbles['x'].isEmoji }">{{ roomChat.chatBubbles['x'].text }}</view>
        <view class="ttt__avatar ttt__avatar--x">
          <image v-if="state.xPlayer?.avatarUrl" class="ttt__avatar-img" :src="avatarOf(state.xPlayer.avatarUrl)" mode="aspectFill" />
          <text v-else class="ttt__avatar-hint">👤</text>
        </view>
        <view class="ttt__bar-info">
          <view class="ttt__bar-row">
            <text class="ttt__bar-name">{{ state.xPlayer?.nickname || '等待加入' }}</text>
            <view class="ttt__pill ttt__pill--x"><text>X 方</text></view>
            <text v-if="state.xPlayer" class="ttt__dot" :class="{ 'ttt__dot--off': !state.xPlayer.online }"></text>
          </view>
          <text class="ttt__bar-status" :class="{ 'ttt__bar-status--mine': isMyTurn }">{{ myStatusText }}</text>
        </view>
      </view>

      <!-- 操作区 -->
      <view class="ttt__actions">
        <view class="ttt__action" hover-class="press" @tap="rulesOpen = true">
          <text class="ttt__action-icon">📖</text>
        </view>
        <view class="ttt__action" hover-class="press" @tap="onBack">
          <text class="ttt__action-icon">🚪</text>
        </view>
      </view>
      <text class="ttt__hint">{{ hintText }}</text>

      <!-- 聊天条（家法同 uno:消息 feed 在上,💬 触发钮在左下） -->
      <view v-if="state.status !== 'waiting' && state.status !== 'finished'" class="ttt__chatbar">
        <view v-if="feedChats.length" class="ttt__chatbar-feed">
          <view v-for="m in feedChats" :key="m.seq" class="ttt__chatbar-item">
            <text class="ttt__chatbar-name">{{ chatNameOf(m) }}：</text>
            <text class="ttt__chatbar-text" :class="{ 'ttt__chatbar-text--emoji': m.kind === 'emoji' }">{{ chatBodyOf(m) }}</text>
          </view>
        </view>
        <view class="ttt__chatbar-trigger" hover-class="press" @tap="openChat">
          <text class="ttt__chatbar-icon">💬</text>
          <text class="ttt__chatbar-hint">快捷嘴炮…</text>
          <text v-if="chatUnread" class="ttt__chatbar-unread">{{ chatUnread > 9 ? '9+' : chatUnread }}</text>
        </view>
      </view>
    </view>

    <!-- 猜拳定 X -->
    <view v-if="state && (state.status === 'rps' || rpsHold)" class="ttt__rps-mask">
      <view class="ttt__rps">
        <view v-if="state.status === 'rps' && state.rps && state.rps.phase === 'pick'" class="ttt__rps-body">
          <view class="ttt__rps-title">✊ 猜拳定先手<text v-if="state.rps.round > 1"> · 平局重出第 {{ state.rps.round }} 轮</text></view>
          <view v-if="state.rps.lastPicks" class="ttt__rps-sub">上轮：{{ rpsLabel(state.rps.lastPicks.x) }} vs {{ rpsLabel(state.rps.lastPicks.o) }}，平局！</view>
          <view class="ttt__rps-sub">胜者执 X 先行 · {{ rpsCountdown }}s 后未出自动代出</view>
          <view class="ttt__rps-sides">
            <view class="ttt__rps-side">
              <text class="ttt__rps-glyph ttt__rps-glyph--x">✕</text>
              <text class="ttt__rps-name">{{ state.xPlayer?.nickname ?? '等待' }}</text>
              <text class="ttt__rps-status">{{ state.myMark === 'x' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
            <text class="ttt__rps-vs">VS</text>
            <view class="ttt__rps-side">
              <text class="ttt__rps-glyph ttt__rps-glyph--o">◯</text>
              <text class="ttt__rps-name">{{ state.oPlayer?.nickname ?? '等待' }}</text>
              <text class="ttt__rps-status">{{ state.myMark === 'o' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
          </view>
          <view v-if="state.rps.myTurn" class="ttt__rps-btns">
            <button v-for="(label, i) in RPS_LABELS" :key="i" class="ttt__rps-btn" :disabled="busy" @tap="rps(RPS_KEYS[i])">{{ label }}</button>
          </view>
          <view v-else class="ttt__rps-wait">已出拳，等对方…</view>
        </view>
        <view v-else-if="rpsHold && rpsHoldData" class="ttt__rps-body">
          <view class="ttt__rps-title">✅ {{ rpsHoldData.winnerName }} 猜拳获胜 · 执 X 先行</view>
          <view class="ttt__rps-sides">
            <view class="ttt__rps-side" :class="{ 'ttt__rps-side--win': rpsHoldData.winner === 'x' }">
              <text class="ttt__rps-glyph ttt__rps-glyph--x">✕</text>
              <text class="ttt__rps-name">{{ rpsHoldData.xName }}</text>
              <text class="ttt__rps-pick">{{ rpsLabel(rpsHoldData.picks.x) }}</text>
            </view>
            <text class="ttt__rps-vs">VS</text>
            <view class="ttt__rps-side" :class="{ 'ttt__rps-side--win': rpsHoldData.winner === 'o' }">
              <text class="ttt__rps-glyph ttt__rps-glyph--o">◯</text>
              <text class="ttt__rps-name">{{ rpsHoldData.oName }}</text>
              <text class="ttt__rps-pick">{{ rpsLabel(rpsHoldData.picks.o) }}</text>
            </view>
          </view>
          <view class="ttt__rps-wait">对局开始！</view>
        </view>
      </view>
    </view>

    <!-- 结算遮罩 -->
    <view v-if="state && state.status === 'finished'" class="ttt__scrim">
      <view class="ttt__result-card">
        <view class="ttt__result-deco">
          <view class="ttt__deco-line"></view>
          <text class="ttt__deco-leaf">🍁</text>
          <view class="ttt__deco-line"></view>
        </view>
        <text class="ttt__result-title">{{ resultTitle }}</text>
        <text class="ttt__result-sub">{{ resultSubText }}</text>
        <view class="ttt__result-stats">
          <view class="ttt__stat-row">
            <text class="ttt__stat-label">连绩</text>
            <view class="ttt__stat-values">
              <text class="ttt__stat-num ttt__stat-num--x">X {{ state.scores.x }}</text>
              <text class="ttt__stat-colon">平 {{ state.scores.draw }}</text>
              <text class="ttt__stat-num ttt__stat-num--o">{{ state.scores.o }} O</text>
            </view>
          </view>
        </view>
        <view class="ttt__result-badge"><text>{{ iWon ? '🎉 干净利落' : isDraw ? '旗鼓相当' : '💪 再战一局扳回来' }}</text></view>
        <button v-if="isSeated" class="ttt__result-rematch" :disabled="busy" @tap="onRematch">再来一局 · 换先手</button>
        <button class="ttt__result-leave" @tap="onLeaveAndBack">返回房间</button>
      </view>
    </view>

    <!-- 规则抽屉 -->
    <view v-if="rulesOpen" class="ttt__rules-scrim" @tap="rulesOpen = false">
      <view class="ttt__drawer" @tap.stop>
        <view class="ttt__drawer-head">
          <text class="ttt__drawer-title">井字棋 · 玩法</text>
          <view class="ttt__drawer-close" hover-class="press" @tap="rulesOpen = false">
            <text>✕</text>
          </view>
        </view>
        <scroll-view class="ttt__drawer-scroll" scroll-y :show-scrollbar="false">
          <view class="ttt__rule">
            <view class="ttt__rule-label"><text>目标</text></view>
            <text class="ttt__rule-text">红·X 与蓝·O 轮流落子，先把自己的三个子连成一条直线（横、竖、斜）的一方获胜。</text>
          </view>
          <view class="ttt__rule">
            <view class="ttt__rule-label"><text>三连示意</text></view>
            <view class="ttt__mini-grid">
              <view
                v-for="(cell, i) in MINI_BOARD"
                :key="i"
                class="ttt__mini-cell"
                :class="{ 'ttt__mini-cell--win': [0, 4, 8].includes(i) }"
              >
                <text v-if="cell" class="ttt__mini-x">✕</text>
              </view>
            </view>
            <text class="ttt__rule-note">对角三连 · 金色高亮即获胜线</text>
          </view>
          <view class="ttt__rule">
            <view class="ttt__rule-label"><text>本局规则</text></view>
            <view class="ttt__sp-row"><view class="ttt__cg-badge"><text>规则</text></view><text class="ttt__sp-text">首局猜拳定先手 · 胜者执 X 先行</text></view>
            <view class="ttt__sp-row"><view class="ttt__cg-badge"><text>规则</text></view><text class="ttt__sp-text">再来一局自动交换先后手</text></view>
            <view class="ttt__sp-row"><view class="ttt__cg-badge"><text>规则</text></view><text class="ttt__sp-text">九格摆满未连线即平局</text></view>
            <view class="ttt__sp-row"><view class="ttt__cg-badge"><text>规则</text></view><text class="ttt__sp-text">每步限时 20 秒 · 超时系统代落</text></view>
          </view>
          <text class="ttt__rule-tail">祝对弈开心 🍁</text>
        </scroll-view>
      </view>
    </view>

    <!-- 房间聊天面板 -->
    <GameChatPanel :ctrl="roomChat" :text-enabled="unoChatTextEnabled" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useTictactoeRoom } from '@/pages-games/composables/useTictactoeRoom'
import { leaveRoom } from '@/pages-games/services/tictactoe'
import { resolveAvatarUrl } from '@/services/toolbox'
import { getWindowInfo } from '@/utils/canvasAdapter'
import { LINES } from '@/pages-games/utils/tictactoe'
import type { TicTacToeMark } from '@/types/tictactoe'
import GameChatPanel from '@/pages-games/components/GameChatPanel.vue'
import GameLobby from '@/pages-games/components/GameLobby.vue'
import { cdnUrl } from '@/utils/cdn'
import { useRoomChat, type RoomChatMessage } from '@/pages-games/composables/useRoomChat'
import { useFeatures } from '@/composables/useFeatures'
import { gamePhraseText } from '@/pages-games/utils/gameChat'
import { playTictactoeSound } from '@/pages-games/utils/tictactoeSound'

const rulesOpen = ref(false)

// ---------- 房间聊天 ----------
const { unoChatTextEnabled, refreshFeatures } = useFeatures()
const roomChat = useRoomChat({
  chat: () => (state.value?.chat ?? []) as RoomChatMessage[],
  code: () => state.value?.code ?? '',
  send: (kind, payload) => sendChat(kind, payload),
  nameOf: (m) => chatNameOf(m),
})

const {
  rps,
  sendChat,
  state,
  isSeated,
  myMark,
  isMyTurn,
  createAndEnter,
  joinByCode,
  submitMove,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useTictactoeRoom()

const busy = ref(false)

const avatarOf = (url: string) => resolveAvatarUrl(url)

// ---------- 聊天条 ----------
const feedChats = computed(() => roomChat.recentChats.value)
const chatUnread = computed(() => roomChat.unreadChat.value)
const chatNameOf = (m: RoomChatMessage): string =>
  m.role === 'x' ? (state.value?.xPlayer?.nickname ?? 'X 方') : (state.value?.oPlayer?.nickname ?? 'O 方')
const chatBodyOf = (m: RoomChatMessage): string =>
  m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? (gamePhraseText(m.text) ?? m.text) : m.text

// ---------- 派生数据 ----------
const WIN_LINES = LINES
/** 三连示意照原型 03-规则:对角 0/4/8 金圈 + 右上角 2 一颗未连线 X。 */
const MINI_BOARD: Array<'x' | null> = ['x', null, 'x', null, 'x', null, null, null, 'x']

const windowWidth = getWindowInfo().windowWidth
const cardWidth = Math.min(windowWidth - 16, 343)
const boardSize = Math.floor((cardWidth - 32) / 3) * 3
const cellSize = boardSize / 3

const cells = computed(() => state.value?.board ?? Array.from({ length: 9 }, () => null as TicTacToeMark | null))
const iWon = computed(() => state.value?.winner != null && state.value.winner === myMark.value)
const isDraw = computed(() => state.value?.winReason === 'draw')

const opponentStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return '等待好友加入…'
  if (current.status === 'rps') return '猜拳定先手中…'
  if (current.status === 'finished') {
    if (current.winReason === 'forfeit') return current.winner !== myMark.value && current.winner !== 'draw' ? '你认输了' : '对方中途离开'
    return isDraw.value ? '平局' : '输了…'
  }
  return current.turn === opponentMark.value ? '对方思考中…' : '等待你落子'
})

const myStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return isSeated.value ? '等好友进来就开局' : ''
  if (current.status === 'rps') return '猜拳定先手'
  if (current.status === 'finished') return isDraw.value ? '平局 🤝' : iWon.value ? '你赢了 🎉' : '下次一定'
  if (!isSeated.value) return '观战中'
  return isMyTurn.value ? `轮到你了 · 剩 ${countdown.value} 秒` : '等待对方落子…'
})

const hintText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.lastEvent && current.lastEvent.seq > 0) return `战报：${current.lastEvent.text}`
  if (current.status === 'waiting') return '等待好友加入 · 分享房间码即可开局'
  if (current.status === 'rps') return '猜拳定先手 · 胜者执 X'
  if (current.status === 'finished') return '对局结束'
  if (current.status === 'playing' && isMyTurn.value) return '点击空格落子 · 三连成线即胜'
  return '等待对方落子…'
})

const opponentMark = computed<TicTacToeMark>(() => (myMark.value === 'x' ? 'o' : 'x'))
const resultTitle = computed(() => (isDraw.value ? '平局' : iWon.value ? '胜利！' : '惜败'))
const resultSubText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.winReason === 'draw') return '棋盘摆满，未分胜负'
  if (current.winReason === 'forfeit') return iWon.value ? '对方中途离开' : '中途离场判负'
  const winnerName = current.winner === 'x' ? (state.value?.xPlayer?.nickname ?? 'X 方') : (state.value?.oPlayer?.nickname ?? 'O 方')
  return `${winnerName} 三连成线`
})

const hintIndex = ref<number | null>(null)

// ---------- 状态变化：音效 + 倒计时 + 战报 ----------
let prevStatus = ''
let prevEventSeq = 0
let prevBoard: Array<TicTacToeMark | null> | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
function resetCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdown.value = state.value?.ttl ?? 0
  countdownTimer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else if (countdownTimer) {
      // 数到 0 自清，别留 interval 每秒空转
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

watch(
  state,
  (next) => {
    if (!next) {
      prevStatus = ''
      prevEventSeq = 0
      prevBoard = null
      return
    }
    // 落子格闪金：与上一帧棋盘 diff 找到新落的子（新子天然可见，闪 700ms 加强提示）
    if (prevBoard && next.board.length === 9) {
      for (let i = 0; i < 9; i++) {
        if (next.board[i] !== prevBoard[i]) {
          hintIndex.value = i
          if (flashTimer) clearTimeout(flashTimer)
          flashTimer = setTimeout(() => {
            hintIndex.value = null
          }, 700)
          break
        }
      }
    }
    prevBoard = next.board.slice()
    const firstLoad = prevStatus === ''
    if (next.ttl > 0 && next.status !== (prevStatus || '')) resetCountdown()

    const event = next.lastEvent
    if (event && event.seq > prevEventSeq && !firstLoad) {
      // 任何一手落地都重置倒计时
      if (event.type === 'move') {
        resetCountdown()
        playTictactoeSound('place')
      } else if (event.type === 'win' || event.type === 'forfeit') {
        playTictactoeSound(iWon.value ? 'win' : 'lose')
      }
    }
    prevEventSeq = Math.max(prevEventSeq, event?.seq ?? 0)

    if (!firstLoad && next.status === 'playing' && prevStatus === 'rps') {
      uni.showToast({ title: '对局开始，X 先行', icon: 'none' })
    }
    prevStatus = next.status
  },
)

// ---------- 猜拳 ----------
const RPS_LABELS = ['石头', '布', '剪刀']
const RPS_KEYS = ['r', 'p', 's']
const rpsCountdown = ref(0)
let rpsCountdownTimer: ReturnType<typeof setInterval> | null = null

function rpsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '…'
  return RPS_LABELS[value] ?? String(value)
}

const rpsHold = ref(false)
const rpsHoldData = ref<{ winnerName: string, winner: TicTacToeMark, picks: { x: number | null, o: number | null }, xName: string, oName: string } | null>(null)
let rpsHoldTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => `${state.value?.status ?? ''}|${state.value?.rps?.phase ?? ''}`,
  (key, prevKey) => {
    const [status, phase] = key.split('|')
    if (status === 'rps' && phase === 'pick') {
      const rpsState = state.value?.rps
      if (rpsState?.myTurn) {
        if (rpsCountdownTimer) clearInterval(rpsCountdownTimer)
        rpsCountdown.value = state.value?.ttl ?? 10
        rpsCountdownTimer = setInterval(() => {
          if (rpsCountdown.value > 0) {
            rpsCountdown.value--
          } else if (rpsCountdownTimer) {
            // 数到 0 自清，别留 interval 每秒空转
            clearInterval(rpsCountdownTimer)
            rpsCountdownTimer = null
          }
        }, 1000)
      }
    }
    if (status === 'playing') {
      if (rpsCountdownTimer) { clearInterval(rpsCountdownTimer); rpsCountdownTimer = null }
      const rpsState = state.value?.rps
      if (prevKey === 'rps|pick' && rpsState && rpsState.phase === 'done' && rpsState.winner && !rpsHold.value) {
        const st = state.value
        rpsHoldData.value = {
          winnerName: (rpsState.winner === 'x' ? st?.xPlayer : st?.oPlayer)?.nickname ?? '?',
          winner: rpsState.winner,
          picks: rpsState.picks ?? { x: null, o: null },
          xName: st?.xPlayer?.nickname ?? '?',
          oName: st?.oPlayer?.nickname ?? '?',
        }
        rpsHold.value = true
        if (rpsHoldTimer) clearTimeout(rpsHoldTimer)
        rpsHoldTimer = setTimeout(() => {
          rpsHold.value = false
          rpsHoldData.value = null
        }, 2000)
      }
    }
  },
)

// ---------- 落子交互 ----------
let tapCell = -1

function onCellTap(i: number) {
  tapCell = i
  void onBoardTap()
}

function onBoardTap() {
  const current = state.value
  if (!current || current.status !== 'playing') return
  if (!isSeated.value) return
  if (!isMyTurn.value) {
    uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  const i = tapCell
  if (i < 0) return
  const board = current.board ?? []
  if (board[i] === 'x' || board[i] === 'o') return
  hintIndex.value = null
  playTictactoeSound('place')
  void submitMove(i)
}

// ---------- 操作 ----------

async function guard(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

async function onCreate() {
  await guard(async () => createAndEnter())
}

async function onJoinCode(code: string) {
  await guard(async () => joinByCode(code))
}

async function onRematch() {
  await guard(async () => requestRematch())
}

async function onLeaveAndBack() {
  await exitRoom()
  uni.navigateBack({ fail: () => {} })
}

function onBack() {
  const current = state.value
  if (!current) {
    uni.navigateBack({ fail: () => {} })
    return
  }
  if (current.status === 'playing' || current.status === 'rps') {
    uni.showModal({
      title: '离开房间',
      content: '对局还没结束，离开将判负，确定吗？',
      confirmColor: '#58A6DC',
      success: (res) => {
        if (res.confirm) void onLeaveAndBack()
      },
    })
    return
  }
  void onLeaveAndBack()
}

function openChat() {
  roomChat.chatPanelOpen.value = true
}

// ---------- 生命周期 ----------

onLoad((query) => {
  const code = typeof query?.room === 'string' ? query.room : ''
  if (/^[0-9]{4}$/.test(code)) {
    void guard(async () => joinByCode(code))
  }
})

onShow(() => {
  void refreshFeatures()
  if (state.value) startSync()
})

onHide(() => stopSync())

onUnload(() => {
  stopSync()
  // 页面级倒计时兜底清理（卸载时 interval 一并收掉）
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  if (rpsCountdownTimer) { clearInterval(rpsCountdownTimer); rpsCountdownTimer = null }
})

onShareAppMessage(() => ({
  title: state.value ? `来玩井字棋！房间码 ${state.value.code}` : '来玩井字棋！',
  path: state.value?.sharePath ?? '/pages-games/tictactoe/index',
}))
</script>

<style lang="scss" scoped>
.ttt {
  min-height: 100vh;
  padding: 0 16px 24rpx;
  box-sizing: border-box;
  background: #f6f9fb;

  &__room {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
    /* 固定聊天 dock（6 行 feed）的避让位 */
    padding-bottom: calc(200px + env(safe-area-inset-bottom));
  }

  &__topbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__back {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: #f2f6f9;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__back-icon {
    font-size: 22px;
    color: #2e4154;
    margin-top: -2px;
  }

  &__title {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  &__title-main {
    font-size: 17px;
    font-weight: 600;
    color: #2e4154;
  }

  &__title-sub {
    font-size: 10px;
    color: #6e8093;
  }

  &__score {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__score-num {
    font-size: 22px;
    font-weight: 600;
    color: #2e4154;
  }

  &__score-sep {
    font-size: 14px;
    color: #dde6ec;
  }

  &__bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
  }

  &__turn-bar {
    position: absolute;
    left: -4px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: #58a6dc;
  }

  &__avatar {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__avatar--o {
    background: #e9f4fb;
  }

  &__avatar--x {
    background: #fdefec;
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
  }

  &__avatar-hint {
    font-size: 16px;
  }

  &__bar-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__bar-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__bar-name {
    font-size: 13px;
    font-weight: 600;
    color: #2e4154;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pill {
    padding: 1px 8px;
    border-radius: 8px;
    font-size: 10px;
    color: #fff;

    &--o {
      background: #4a86b8;
    }

    &--x {
      background: #e8806f;
    }
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #5fb98c;

    &--off {
      background: #dde6ec;
    }
  }

  &__bar-status {
    font-size: 10px;
    color: #6e8093;

    &--mine {
      color: #c99a34;
      font-weight: 600;
    }
  }

  &__invite {
    margin: 0;
    padding: 0 16px;
    height: 32px;
    line-height: 32px;
    border-radius: 16px;
    background: #58a6dc;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__bubble {
    position: absolute;
    top: -30px;
    left: 12px;
    max-width: 70%;
    padding: 4px 10px;
    border-radius: 10px;
    background: #fff;
    border: 1rpx solid #eaf0f4;
    font-size: 11px;
    color: #2e4154;
    z-index: 2;

    &--emoji {
      font-size: 20px;
    }
  }

  &__board-card {
    align-self: center;
    padding: 16px;
    border-radius: 16px;
    background: #fff;
    border: 1rpx solid #eaf0f4;
    position: relative;
  }

  &__board {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    border-radius: 12px;
    background: #ffffff;
  }

  /* 四道 # 网格线:绝对定位且先于格子渲染,格子在层上照常收点击(线不挡落子) */
  &__line {
    position: absolute;
    border-radius: 3px;
    background: #2e4154;

    &--v {
      top: 0;
      bottom: 0;
      width: 6px;
    }

    &--h {
      left: 0;
      right: 0;
      height: 6px;
    }
  }

  &__cell {
    position: relative;
    width: 33.33%;
    height: 33.33%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;

    &--hint {
      background: #f4b94214;
    }

    &--win {
      background: #f4b94226;
    }
  }

  &__mark-x {
    position: relative;
    width: 38%;
    height: 38%;
  }

  &__x-bar {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 120%;
    height: 20%;
    border-radius: 999rpx;
    background: #e8806f;

    &--a {
      transform: translate(-50%, -50%) rotate(45deg);
    }

    &--b {
      transform: translate(-50%, -50%) rotate(-45deg);
    }
  }

  &__mark-o {
    width: 48%;
    height: 48%;
    border-radius: 50%;
    border: 6px solid #4a86b8;
  }

  &__actions {
    display: flex;
    justify-content: center;
    gap: 24px;
  }

  &__action {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: #f2f6f9;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__action-icon {
    font-size: 20px;
  }

  &__hint {
    text-align: center;
    font-size: 11px;
    color: #6e8093;
  }

  &__chatbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.96);
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -2px 10px rgba(46, 65, 84, 0.08);
  }

  &__chatbar-trigger {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 16px;
    background: #e9f4fb;
    flex-shrink: 0;
  }

  &__chatbar-icon {
    font-size: 14px;
  }

  &__chatbar-hint {
    font-size: 11px;
    color: #a4b3c0;
  }

  &__chatbar-unread {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #e8806f;
    color: #fff;
    font-size: 9px;
    text-align: center;
  }

  &__chatbar-feed {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: #fff;
    border: 1rpx solid #eaf0f4;
    border-radius: 12px;
    padding: 6px 12px;
    overflow: hidden;
  }

  &__chatbar-item {
    display: flex;
    gap: 2px;
    overflow: hidden;
    white-space: nowrap;
  }

  &__chatbar-name {
    font-size: 10px;
    color: #a4b3c0;
    flex-shrink: 0;
  }

  &__chatbar-text {
    font-size: 10px;
    color: #6e8093;
    overflow: hidden;
    text-overflow: ellipsis;

    &--emoji {
      font-size: 16px;
    }
  }

  &__rps-mask {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(46, 65, 84, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__rps {
    width: 299px;
    border-radius: 20px;
    background: #f6f9fb;
    padding: 24px 20px;
  }

  &__rps-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
  }

  &__rps-title {
    font-size: 16px;
    font-weight: 600;
    color: #2e4154;
  }

  &__rps-sub {
    font-size: 11px;
    color: #6e8093;
  }

  &__rps-sides {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    width: 100%;
  }

  &__rps-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;

    &--win {
      .ttt__rps-name {
        color: #c99a34;
      }
    }
  }

  &__rps-glyph {
    font-size: 36rpx;
    font-weight: 600;

    &--x {
      color: #e8806f;
    }

    &--o {
      color: #4a86b8;
    }
  }

  &__rps-name {
    font-size: 12px;
    font-weight: 600;
    color: #2e4154;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__rps-status {
    font-size: 10px;
    color: #6e8093;
  }

  &__rps-pick {
    font-size: 11px;
    font-weight: 600;
    color: #c99a34;
  }

  &__rps-vs {
    font-size: 14px;
    font-weight: 600;
    color: #a4b3c0;
  }

  &__rps-btns {
    display: flex;
    gap: 12px;
    width: 100%;
  }

  &__rps-btn {
    flex: 1;
    height: 76rpx;
    line-height: 76rpx;
    border-radius: 16rpx;
    background: #f2f6f9;
    color: #2e4154;
    font-size: 28rpx;
    font-weight: 600;
    padding: 0;

    &::after {
      border: none;
    }
  }

  &__rps-wait {
    font-size: 12px;
    color: #6e8093;
  }

  &__scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(46, 65, 84, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__result-card {
    width: 299px;
    border-radius: 20px;
    background: #f6f9fb;
    padding: 28px 20px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  &__result-deco {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__deco-line {
    width: 60px;
    height: 1px;
    background: #dde6ec;
  }

  &__deco-leaf {
    font-size: 18px;
  }

  &__result-title {
    font-size: 30px;
    font-weight: 600;
    color: #e8806f;
  }

  &__result-sub {
    font-size: 12px;
    color: #6e8093;
  }

  &__result-stats {
    width: 100%;
    padding: 6px 4px;
  }

  &__stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__stat-label {
    font-size: 11px;
    color: #a4b3c0;
  }

  &__stat-values {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__stat-num {
    font-size: 20px;
    font-weight: 600;

    &--x {
      color: #e8806f;
    }

    &--o {
      color: #4a86b8;
    }
  }

  &__stat-colon {
    font-size: 12px;
    color: #a4b3c0;
  }

  &__result-badge {
    padding: 6px 16px;
    border-radius: 16px;
    background: #f2f6f9;
    font-size: 12px;
    color: #2e4154;
  }

  &__result-rematch {
    width: 100%;
    height: 44px;
    line-height: 44px;
    border-radius: 22px;
    background: #e8806f;
    color: #fff;
    font-size: 14px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__result-leave {
    width: 100%;
    height: 40px;
    line-height: 40px;
    border-radius: 20px;
    background: #f2f6f9;
    color: #2e4154;
    font-size: 13px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__rules-scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(46, 65, 84, 0.4);
    display: flex;
    align-items: flex-end;
  }

  &__drawer {
    width: 100%;
    max-height: 72vh;
    border-radius: 24px 24px 0 0;
    background: #f6f9fb;
    padding: 20px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__drawer-title {
    font-size: 16px;
    font-weight: 600;
    color: #2e4154;
  }

  &__drawer-close {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #f2f6f9;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #6e8093;
  }

  &__drawer-scroll {
    max-height: 56vh;
  }

  &__rule {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }

  &__rule-label {
    display: flex;
    align-items: center;
    gap: 6px;

    text {
      font-size: 12px;
      font-weight: 600;
      color: #2e4154;
    }

    &::before {
      content: '';
      width: 3px;
      height: 12px;
      border-radius: 2px;
      background: #58a6dc;
    }
  }

  &__rule-text {
    font-size: 11px;
    line-height: 1.6;
    color: #6e8093;
  }

  &__rule-note {
    font-size: 10px;
    color: #a4b3c0;
  }

  &__rule-tail {
    display: block;
    text-align: center;
    font-size: 11px;
    color: #a4b3c0;
    padding: 8px 0;
  }

  &__mini-grid {
    display: flex;
    flex-wrap: wrap;
    /* 容器放宽到 122px:3×(34px 含边框) + 2×5px = 112px,留足余量防子像素取整挤成每行 2 格 */
    width: 122px;
    gap: 5px;
  }

  &__mini-cell {
    box-sizing: border-box;
    width: 34px;
    height: 34px;
    border-radius: 6px;
    background: #f2f6f9;
    border: 1rpx solid #eaf0f4;
    display: flex;
    align-items: center;
    justify-content: center;

    &--win {
      background: #f4b94226;
      border-color: #f4b942;
    }
  }

  &__mini-x {
    font-size: 16px;
    font-weight: 600;
    color: #e8806f;
  }

  &__sp-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__sp-text {
    font-size: 11px;
    line-height: 1.5;
    color: #6e8093;
  }

  &__cg-badge {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 8px;
    background: #f4b94233;
    color: #c99a34;
    font-size: 9px;
    font-weight: 600;
  }
}
</style>
