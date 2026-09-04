<template>
  <view class="gomoku">
    <!-- 大厅：创建 / 加入 -->
    <view v-if="!state" class="gomoku__lobby">
      <view class="gomoku__brand">
        <text class="gomoku__brand-icon">⚫</text>
        <text class="gomoku__brand-title">五子棋</text>
        <text class="gomoku__brand-sub">创建房间，邀请好友联机对弈</text>
      </view>
      <button class="gomoku__primary" :disabled="busy" @tap="onCreate">创建房间</button>
      <view class="gomoku__divider"><text>或加入好友的房间</text></view>
      <view class="gomoku__join">
        <input
          v-model="joinCode"
          class="gomoku__join-input"
          type="number"
          maxlength="4"
          placeholder="输入 4 位房间码"
        />
        <button class="gomoku__join-btn" :disabled="busy" @tap="onJoin">加入</button>
      </view>
      <text class="gomoku__rules" @tap="rulesOpen = true">❓ 玩法说明</text>
    </view>

    <!-- 房间 -->
    <view v-else class="gomoku__room">
      <view class="gomoku__header">
        <view class="gomoku__code" @tap="copyCode">
          <text class="gomoku__code-label">房间码</text>
          <text class="gomoku__code-value">{{ state.code }}</text>
          <text class="gomoku__code-hint">点击复制</text>
        </view>
        <text class="gomoku__rules-btn" @tap="rulesOpen = true">❓ 玩法</text>
        <button v-if="state.status === 'waiting'" class="gomoku__invite" open-type="share">邀请好友</button>
      </view>

      <view class="gomoku__players">
        <view class="gomoku__player" :class="{ 'gomoku__player--me': myColor === 'black' }">
          <view v-if="roomChat.chatBubbles['black']" class="gomoku__bubble" :class="{ 'gomoku__bubble--emoji': roomChat.chatBubbles['black'].isEmoji }">{{ roomChat.chatBubbles['black'].text }}</view>
          <view class="gomoku__stone gomoku__stone--black"></view>
          <text class="gomoku__player-name">{{ state.black?.nickname || '等待加入' }}</text>
          <text v-if="state.black" class="gomoku__dot" :class="{ 'gomoku__dot--off': !state.black.online }"></text>
        </view>
        <text class="gomoku__vs">VS</text>
        <view class="gomoku__player" :class="{ 'gomoku__player--me': myColor === 'white' }">
          <view v-if="roomChat.chatBubbles['white']" class="gomoku__bubble" :class="{ 'gomoku__bubble--emoji': roomChat.chatBubbles['white'].isEmoji }">{{ roomChat.chatBubbles['white'].text }}</view>
          <view class="gomoku__stone gomoku__stone--white"></view>
          <text class="gomoku__player-name">{{ state.white?.nickname || '等待加入' }}</text>
          <text v-if="state.white" class="gomoku__dot" :class="{ 'gomoku__dot--off': !state.white.online }"></text>
        </view>
      </view>

      <text class="gomoku__status">{{ statusText }}</text>

      <!-- 对方请求悔棋：待我处理，5 秒倒计时，超时视为拒绝 -->
      <view v-if="undoPendingForMe" class="gomoku__undo-banner">
        <text class="gomoku__undo-banner-text">对方请求悔棋，是否同意？（{{ undoCountdown }}s 后视为拒绝）</text>
        <view class="gomoku__undo-banner-actions">
          <button class="gomoku__undo-accept" @tap="answerUndo(true)">同意</button>
          <button class="gomoku__undo-reject" @tap="answerUndo(false)">拒绝</button>
        </view>
      </view>

      <view class="gomoku__board-wrap" :style="{ width: boardCssSize + 'px', height: boardCssSize + 'px' }">
        <canvas id="gomoku-board" type="2d" class="gomoku__board" :style="{ width: boardCssSize + 'px', height: boardCssSize + 'px' }"></canvas>
        <view class="gomoku__board-hit" @tap="onBoardTap"></view>
      </view>

      <!-- 悔棋：我发起，需对方同意，每局限 3 次 -->
      <view v-if="isSeated && state.status === 'playing'" class="gomoku__actions">
        <button
          class="gomoku__undo-btn"
          :disabled="!canRequestUndo"
          @tap="askUndo"
        >{{ undoButtonText }}</button>
      </view>

      <!-- 猜拳定选边（开局仪式：出拳 → 胜者选边 → 定格） -->
      <view v-if="state.status === 'rps' || rpsHold" class="gomoku__rps-mask">
        <view class="gomoku__rps">
          <!-- 出拳阶段 -->
          <view v-if="state.status === 'rps' && state.rps && state.rps.phase === 'pick'" class="gomoku__rps-body">
            <view class="gomoku__rps-title">✊ 猜拳定选边<text v-if="state.rps.round > 1"> · 平局重出第 {{ state.rps.round }} 轮</text></view>
            <view v-if="state.rps.lastPicks" class="gomoku__rps-sub">上轮：{{ rpsLabel(state.rps.lastPicks.black) }} vs {{ rpsLabel(state.rps.lastPicks.white) }}，平局！</view>
            <view class="gomoku__rps-sub">胜者可选执黑先手或执白后手 · {{ rpsCountdown }}s 后未出自动代出</view>
            <view class="gomoku__rps-sides">
              <view class="gomoku__rps-side">
                <view class="gomoku__rps-stone gomoku__rps-stone--black"></view>
                <text class="gomoku__rps-name">{{ state.black?.nickname ?? '等待' }}</text>
                <text class="gomoku__rps-status">{{ state.myRole === 'black' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
              </view>
              <text class="gomoku__rps-vs">VS</text>
              <view class="gomoku__rps-side">
                <view class="gomoku__rps-stone gomoku__rps-stone--white"></view>
                <text class="gomoku__rps-name">{{ state.white?.nickname ?? '等待' }}</text>
                <text class="gomoku__rps-status">{{ state.myRole === 'white' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
              </view>
            </view>
            <view v-if="state.rps.myTurn" class="gomoku__rps-btns">
              <button v-for="(label, i) in RPS_LABELS" :key="i" class="gomoku__rps-btn" :disabled="busy" @tap="rps(RPS_KEYS[i])">{{ label }}</button>
            </view>
            <view v-else class="gomoku__rps-wait">已出拳，等对方…</view>
          </view>
          <!-- 选边阶段（双方出拳已公开） -->
          <view v-else-if="state.status === 'rps' && state.rps && state.rps.phase === 'choose'" class="gomoku__rps-body">
            <view class="gomoku__rps-title">🏆 {{ rpsWinnerName }} 赢得选边权</view>
            <view class="gomoku__rps-reveal">
              <view class="gomoku__rps-side" :class="{ 'gomoku__rps-side--win': state.rps.winner === 'black' }">
                <view class="gomoku__rps-stone gomoku__rps-stone--black"></view>
                <text class="gomoku__rps-name">{{ state.black?.nickname ?? '?' }}</text>
                <text class="gomoku__rps-pick">{{ rpsLabel(state.rps.picks?.black) }}</text>
              </view>
              <text class="gomoku__rps-vs">VS</text>
              <view class="gomoku__rps-side" :class="{ 'gomoku__rps-side--win': state.rps.winner === 'white' }">
                <view class="gomoku__rps-stone gomoku__rps-stone--white"></view>
                <text class="gomoku__rps-name">{{ state.white?.nickname ?? '?' }}</text>
                <text class="gomoku__rps-pick">{{ rpsLabel(state.rps.picks?.white) }}</text>
              </view>
            </view>
            <view v-if="state.rps.myTurn" class="gomoku__rps-btns">
              <button class="gomoku__rps-btn gomoku__rps-btn--wide" :disabled="busy" @tap="chooseColor('black')">⚫ 执黑先手</button>
              <button class="gomoku__rps-btn gomoku__rps-btn--wide" :disabled="busy" @tap="chooseColor('white')">⚪ 执白后手</button>
            </view>
            <view v-else class="gomoku__rps-wait">等{{ rpsWinnerName }}选边…（{{ rpsCountdown }}s 后默认执黑）</view>
          </view>
          <!-- 结果定格：开局后短暂展示 -->
          <view v-else-if="rpsHold && rpsHoldData" class="gomoku__rps-body">
            <view class="gomoku__rps-title">✅ {{ rpsHoldData.winnerName }} 选择{{ rpsHoldData.chosen === 'black' ? '执黑先手' : '执白后手' }}</view>
            <view class="gomoku__rps-reveal">
              <view class="gomoku__rps-side">
                <view class="gomoku__rps-stone gomoku__rps-stone--black"></view>
                <text class="gomoku__rps-name">{{ rpsHoldData.black }}</text>
                <text class="gomoku__rps-pick">{{ rpsLabel(rpsHoldData.picks.black) }}</text>
              </view>
              <text class="gomoku__rps-vs">VS</text>
              <view class="gomoku__rps-side">
                <view class="gomoku__rps-stone gomoku__rps-stone--white"></view>
                <text class="gomoku__rps-name">{{ rpsHoldData.white }}</text>
                <text class="gomoku__rps-pick">{{ rpsLabel(rpsHoldData.picks.white) }}</text>
              </view>
            </view>
            <view class="gomoku__rps-wait">对局开始！</view>
          </view>
        </view>
      </view>

      <view v-if="state.status === 'finished'" class="gomoku__result">
        <text class="gomoku__result-text">{{ resultText }}</text>
        <button v-if="isSeated" class="gomoku__primary gomoku__result-btn" :disabled="busy" @tap="onRematch">再来一局</button>
      </view>

      <button class="gomoku__leave" @tap="onLeave">离开房间</button>

      <!-- 聊天条（同 uno：消息竖向每行一条，💬 触发按钮靠左） -->
      <view class="gomoku__chat-zone">
        <view class="gomoku__chat-bar">
          <view v-if="roomChat.recentChats.value.length" class="gomoku__chat-feed">
            <view v-for="m in roomChat.recentChats.value" :key="m.seq" class="gomoku__chat-item">
              <text class="gomoku__chat-name">{{ roleNameOf(m.role ?? 'black') }}：</text>
              <text class="gomoku__chat-text" :class="{ 'gomoku__chat-text--emoji': m.kind === 'emoji' }">{{ m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? gamePhraseText(m.text) ?? m.text : m.text }}</text>
            </view>
          </view>
          <view class="gomoku__chat-trigger" @tap="roomChat.chatPanelOpen.value = true">
            <text class="gomoku__chat-trigger-icon">💬</text>
            <text class="gomoku__chat-trigger-hint">快捷聊天…</text>
            <text v-if="roomChat.unreadChat.value" class="gomoku__chat-unread">{{ roomChat.unreadChat.value > 9 ? '9+' : roomChat.unreadChat.value }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 玩法说明 -->
    <GameRulesModal :visible="rulesOpen" title="五子棋 · 玩法说明" :sections="GAME_RULES" @close="rulesOpen = false" />

    <!-- 房间聊天面板 -->
    <GameChatPanel :ctrl="roomChat" :text-enabled="unoChatTextEnabled" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useGomokuRoom } from '@/composables/useGomokuRoom'
import { getCanvasNode, getElementRect, getWindowInfo } from '@/utils/canvasAdapter'
import {
  STAR_POINTS,
  boardMetrics,
  intersectionToPoint,
  pointToIntersection,
  type BoardMetrics,
} from '@/utils/gomoku'
import type { CanvasNode, ElementRect } from '@/utils/canvasAdapter'
import type { GomokuColor } from '@/types/gomoku'
import { playGomokuPlace, playGomokuWin } from '@/utils/gomokuAudio'
import GameRulesModal from '@/components/GameRulesModal.vue'
import GameChatPanel from '@/components/GameChatPanel.vue'
import { useRoomChat, type RoomChatMessage } from '@/composables/useRoomChat'
import { useFeatures } from '@/composables/useFeatures'
import { gamePhraseText } from '@/utils/gameChat'

const rulesOpen = ref(false)

// ---------- 房间聊天（通用 useRoomChat + 共享面板；气泡按黑白座位键锚定） ----------
const { unoChatTextEnabled, refreshFeatures } = useFeatures()
const roomChat = useRoomChat({
  chat: () => (state.value?.chat ?? []) as RoomChatMessage[],
  code: () => state.value?.code ?? '',
  send: (kind, payload) => sendChat(kind, payload),
})
const roleNameOf = (role: string): string =>
  role === 'black' ? (state.value?.black?.nickname ?? '黑方') : (state.value?.white?.nickname ?? '白方')

/** 玩法说明（玩家视角精简版）。 */
const GAME_RULES: { heading?: string; lines: string[] }[] = [
  {
    heading: '🎯 规则',
    lines: [
      '黑白双方轮流落子，任意方向（横、竖、斜）先连成五子者获胜',
      '开局双方猜拳，胜者选执黑（先手）或执白（后手）；平局重出，超时自动代出',
    ],
  },
  {
    heading: '↩️ 悔棋',
    lines: [
      '对局中可以发起悔棋请求，对方 10 秒内同意才生效（会一起退回一回合）',
      '等待对方决定时可以撤销请求',
    ],
  },
  {
    heading: '💬 其他',
    lines: [
      '中途离开视为认输；对局结束后可「再来一局」继续同房间',
      '房间码可分享给好友直接进入对局',
    ],
  },
]

const {
  state,
  isSeated,
  myColor,
  isMyTurn,
  opponent,
  canRequestUndo,
  undoPendingForMe,
  undoRemaining,
  undoCountdown,
  createAndEnter,
  joinByCode,
  rps,
  chooseColor,
  sendChat,
  tapIntersection,
  requestRematch,
  askUndo,
  answerUndo,
  exitRoom,
  startSync,
  stopSync,
} = useGomokuRoom()

const instance = getCurrentInstance()
const joinCode = ref('')
const busy = ref(false)

// ---------- 猜拳定选边 ----------
/** 下标对齐服务端编码：0=石头 1=布 2=剪刀（r/p/s 键序同此）。 */
const RPS_LABELS = ['石头', '布', '剪刀']
const RPS_KEYS = ['r', 'p', 's']
const rpsCountdown = ref(0)
let rpsCountdownTimer: ReturnType<typeof setInterval> | null = null

function rpsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '…'
  return RPS_LABELS[value] ?? String(value)
}

const rpsWinnerName = computed(() => {
  const rps = state.value?.rps
  if (!rps?.winner) return '?'
  return (rps.winner === 'black' ? state.value?.black : state.value?.white)?.nickname ?? '?'
})

/** 结果定格：status 从 rps → playing 时用最后一份 rps 数据停留 2s。 */
const rpsHold = ref(false)
const rpsHoldData = ref<{ winnerName: string; chosen: string; picks: { black: number | null; white: number | null }; black: string; white: string } | null>(null)
let rpsHoldTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => [state.value?.status, state.value?.rps?.phase] as const,
  ([status, phase]) => {
    if (status === 'rps' && phase === 'pick') {
      const rps = state.value?.rps
      if (rps?.myTurn) {
        if (rpsCountdownTimer) clearInterval(rpsCountdownTimer)
        rpsCountdown.value = rps.ttl
        rpsCountdownTimer = setInterval(() => {
          if (rpsCountdown.value > 0) rpsCountdown.value--
        }, 1000)
      }
    }
    if (status === 'rps' && phase === 'choose') {
      const rps = state.value?.rps
      if (rpsCountdownTimer) clearInterval(rpsCountdownTimer)
      rpsCountdown.value = rps?.ttl ?? 0
      rpsCountdownTimer = setInterval(() => {
        if (rpsCountdown.value > 0) rpsCountdown.value--
      }, 1000)
    }
    if (status === 'playing') {
      if (rpsCountdownTimer) { clearInterval(rpsCountdownTimer); rpsCountdownTimer = null }
      const rps = state.value?.rps
      if (rps && rps.phase === 'done' && rps.chosen && !rpsHold.value) {
        const st = state.value
        const winnerRole = rps.winner
        rpsHoldData.value = {
          winnerName: (winnerRole === 'black' ? st?.black : st?.white)?.nickname ?? '?',
          chosen: rps.chosen,
          picks: rps.picks ?? { black: null, white: null },
          black: st?.black?.nickname ?? '?',
          white: st?.white?.nickname ?? '?',
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
/** 两次点击确认落子：第一次点出幽灵子预览，第二次点同一位置才提交 */
const pendingMove = ref<{ x: number; y: number } | null>(null)
let previewHintShown = false

// ---------- 棋盘渲染 ----------

const boardCssSize = Math.min(getWindowInfo().windowWidth - 32, 520)
const metrics: BoardMetrics = boardMetrics(boardCssSize)
let boardNode: CanvasNode | null = null
let boardRect: ElementRect | null = null

async function initBoard() {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#gomoku-board', instance)
    boardNode.canvas.width = boardCssSize * boardNode.dpr
    boardNode.canvas.height = boardCssSize * boardNode.dpr
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    boardRect = await getElementRect('#gomoku-board', instance)
    drawBoard()
  } catch (error) {
    console.warn('[gomoku] init board failed:', error)
  }
}

function drawBoard() {
  if (!boardNode) return
  const { ctx } = boardNode
  const { size, padding, cell } = metrics

  // 木纹底色 + 边框
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#eed3a8'
  ctx.fillRect(0, 0, size, size)

  // 网格线
  ctx.strokeStyle = '#a57c4f'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 15; i++) {
    const p = padding + i * cell
    ctx.moveTo(padding, p)
    ctx.lineTo(size - padding, p)
    ctx.moveTo(p, padding)
    ctx.lineTo(p, size - padding)
  }
  ctx.stroke()

  // 星位
  ctx.fillStyle = '#8a6335'
  STAR_POINTS.forEach(([x, y]) => {
    const { px, py } = intersectionToPoint(x, y, metrics)
    ctx.beginPath()
    ctx.arc(px, py, cell * 0.09, 0, Math.PI * 2)
    ctx.fill()
  })

  // 棋子（moves 奇偶即黑白：黑先）
  const current = state.value
  if (current) {
    current.moves.forEach((move, i) => {
      const { px, py } = intersectionToPoint(move.x, move.y, metrics)
      drawStone(ctx, px, py, cell * 0.44, i % 2 === 0)
    })
    // 最后一手红圈
    if (current.lastMove) {
      const { px, py } = intersectionToPoint(current.lastMove.x, current.lastMove.y, metrics)
      ctx.strokeStyle = '#e06a5a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, cell * 0.3, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 待确认的落子预览（半透明幽灵子，再点一次同一位置确认）
    if (pendingMove.value && current.status === 'playing') {
      const { px, py } = intersectionToPoint(pendingMove.value.x, pendingMove.value.y, metrics)
      ctx.save()
      ctx.globalAlpha = 0.45
      drawStone(ctx, px, py, cell * 0.44, myColor.value !== 'white')
      ctx.restore()
      // 确认提示圈
      ctx.strokeStyle = '#e06a5a'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(px, py, cell * 0.42, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 胜利连线
    if (current.winLine && current.winLine.length >= 2) {
      const first = current.winLine[0]
      const last = current.winLine[current.winLine.length - 1]
      const a = intersectionToPoint(first[0], first[1], metrics)
      const b = intersectionToPoint(last[0], last[1], metrics)
      ctx.strokeStyle = '#d4a017'
      ctx.lineWidth = cell * 0.16
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(a.px, a.py)
      ctx.lineTo(b.px, b.py)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, black: boolean) {
  const gradient = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r)
  if (black) {
    gradient.addColorStop(0, '#6b6258')
    gradient.addColorStop(1, '#241f1a')
  } else {
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#ddd2c2')
  }
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(px, py, r, 0, Math.PI * 2)
  ctx.fill()
}

async function onBoardTap(event: unknown) {
  if (!state.value || !isMyTurn.value) {
    if (state.value?.status === 'playing' && isSeated.value) uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  const detail = (event as { detail?: { x?: number; y?: number } }).detail
  if (detail?.x === undefined || detail?.y === undefined) return
  if (!boardRect) boardRect = await getElementRect('#gomoku-board', instance)
  const move = pointToIntersection(detail.x - boardRect.left, detail.y - boardRect.top, metrics)
  if (!move) {
    pendingMove.value = null
    drawBoard()
    return
  }
  const pending = pendingMove.value
  if (pending && pending.x === move.x && pending.y === move.y) {
    // 第二次点同一位置：确认落子
    pendingMove.value = null
    await tapIntersection(move.x, move.y)
    return
  }
  pendingMove.value = move
  if (!previewHintShown) {
    previewHintShown = true
    uni.showToast({ title: '再点一次同一位置确认落子', icon: 'none' })
  }
  drawBoard()
}

// 状态变化即重画（含乐观落子与服务端推送）；手数变多播落子音，自己五连获胜播胜利音
let prevMovesCount = 0
let prevStatus = ''
watch(
  state,
  (next) => {
    pendingMove.value = null // 服务端状态推进后清掉未确认的预览
    drawBoard()
    if (!next) {
      prevMovesCount = 0
      prevStatus = ''
      return
    }
    const firstLoad = prevStatus === ''
    // 对手加入：等待→开局的瞬间提示 + 提示音
    if (!firstLoad && prevStatus === 'waiting' && next.status === 'playing') {
      const name = opponent.value?.nickname || '对手'
      uni.showToast({ title: `${name} 加入了房间，开始对弈！`, icon: 'none' })
      playGomokuPlace()
    }
    if (!firstLoad && next.movesCount > prevMovesCount) playGomokuPlace()
    if (
      !firstLoad
      && next.status === 'finished'
      && prevStatus !== 'finished'
      && next.winReason === 'five'
      && next.winner === myColor.value
    ) {
      playGomokuWin()
    }
    prevMovesCount = next.movesCount
    prevStatus = next.status
  },
  { deep: true },
)

// ---------- 文案 ----------

const statusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return '等待好友加入…'
  if (current.status === 'finished') return `共 ${current.movesCount} 手`
  if (!isSeated.value) return '观战中'
  const base = isMyTurn.value ? '轮到你落子' : '等待对方落子…'
  const off = opponent.value && !opponent.value.online ? '（对手暂时离开，棋局已保留）' : ''
  return `${base} · 你执${myColor.value === 'black' ? '黑' : '白'} · ${current.movesCount} 手${off}`
})

const undoButtonText = computed(() => {
  const current = state.value
  if (!current) return '悔棋'
  if (current.undo.pendingMine) return `等待对方同意…（${undoCountdown.value}s）`
  return `悔棋（剩 ${undoRemaining.value} 次）`
})

const resultText = computed(() => {  const current = state.value
  if (!current || current.status !== 'finished') return ''
  if (current.winReason === 'draw') return '平局！棋盘下满了'
  const winnerName = current.winner === 'black' ? current.black?.nickname : current.white?.nickname
  if (current.winReason === 'forfeit') return `${winnerName || '对方'} 获胜（对手离开）`
  if (!isSeated.value) return `${winnerName || ''} 获胜`
  const iWon = current.winner === myColor.value
  return iWon ? '🎉 你赢了！' : `${winnerName || '对方'} 获胜`
})

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
  await guard(async () => {
    await createAndEnter()
    await initBoard()
  })
}

async function onJoin() {
  await guard(async () => {
    await joinByCode(joinCode.value.trim())
    await initBoard()
  })
}

async function onRematch() {
  await guard(requestRematch)
}

async function onLeave() {
  await exitRoom()
  joinCode.value = ''
}

function copyCode() {
  if (!state.value) return
  uni.setClipboardData({ data: state.value.code })
}

// ---------- 生命周期 ----------

onLoad((query) => {
  const code = typeof query?.room === 'string' ? query.room : ''
  if (/^[0-9]{4}$/.test(code)) {
    void guard(async () => {
      await joinByCode(code)
      await initBoard()
    })
  }
})

onShow(() => {
  void refreshFeatures()
  if (state.value) startSync()
})

onHide(() => {
  stopSync()
})

onUnload(() => {
  stopSync()
})

onShareAppMessage(() => ({
  title: state.value ? `来下五子棋！房间码 ${state.value.code}` : '来下五子棋！',
  path: state.value ? `/pages/gomoku/index?room=${state.value.code}` : '/pages/gomoku/index',
}))
</script>

<style lang="scss" scoped>
.gomoku {
  min-height: 100vh;
  padding: 32rpx;
  box-sizing: border-box;
  background: $color-bg;

  &__lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 80rpx;
  }

  &__brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 64rpx;

    &-icon {
      font-size: 96rpx;
    }

    &-title {
      font-size: $font-title;
      font-weight: 600;
      color: $color-text;
      margin-top: 16rpx;
    }

    &-sub {
      font-size: $font-caption;
      color: $color-text-secondary;
      margin-top: 8rpx;
    }
  }

  &__color-pick {
    display: flex;
    gap: 24rpx;
    margin-bottom: 32rpx;
  }

  &__color-option {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 16rpx 32rpx;
    background: $color-card;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    font-size: $font-body;
    color: $color-text;

    &--active {
      border-color: $color-primary;
      color: $color-primary-dark;
      font-weight: 600;
    }
  }

  &__primary {
    width: 480rpx;
    height: 96rpx;
    line-height: 96rpx;
    border-radius: $radius-lg;
    background: $color-primary;
    color: #fff;
    font-size: $font-body;
    border: none;

    &::after {
      border: none;
    }
  }

  &__divider {
    margin: 48rpx 0 24rpx;
    font-size: $font-caption;
    color: $color-text-secondary;
  }

  &__rules {
    margin-top: 28rpx;
    font-size: $font-body;
    color: $color-primary;
    text-decoration: underline;
  }

  &__rules-btn {
    height: 64rpx;
    line-height: 64rpx;
    padding: 0 20rpx;
    font-size: $font-caption;
    color: $color-primary;
  }

  &__join {
    display: flex;
    align-items: center;
    gap: 16rpx;

    &-input {
      width: 320rpx;
      height: 88rpx;
      padding: 0 24rpx;
      background: $color-card;
      border: 2rpx solid $color-border;
      border-radius: $radius-md;
      font-size: $font-body;
      box-sizing: border-box;
    }

    &-btn {
      width: 160rpx;
      height: 88rpx;
      line-height: 88rpx;
      border-radius: $radius-md;
      background: $color-card;
      color: $color-primary-dark;
      border: 2rpx solid $color-primary;
      font-size: $font-body;

      &::after {
        border: none;
      }
    }
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24rpx;
  }

  &__code {
    display: flex;
    align-items: baseline;
    gap: 12rpx;

    &-label {
      font-size: $font-caption;
      color: $color-text-secondary;
    }

    &-value {
      font-size: 40rpx;
      font-weight: 700;
      letter-spacing: 8rpx;
      color: $color-primary-dark;
    }

    &-hint {
      font-size: 20rpx;
      color: $color-text-secondary;
    }
  }

  &__invite {
    height: 64rpx;
    line-height: 64rpx;
    padding: 0 28rpx;
    border-radius: $radius-md;
    background: $color-primary;
    color: #fff;
    font-size: $font-caption;
    border: none;

    &::after {
      border: none;
    }
  }

  &__players {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: $color-card;
    border-radius: $radius-md;
    padding: 20rpx 32rpx;
    box-shadow: $shadow-card;
    margin-bottom: 16rpx;
  }

  &__player {
    display: flex;
    align-items: center;
    gap: 12rpx;
    flex: 1;

    &:last-child {
      justify-content: flex-end;
    }

    &--me .gomoku__player-name {
      color: $color-primary-dark;
      font-weight: 600;
    }

    &-name {
      font-size: $font-body;
      color: $color-text;
      max-width: 220rpx;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__stone {
    width: 32rpx;
    height: 32rpx;
    border-radius: 50%;

    &--black {
      background: radial-gradient(circle at 35% 35%, #6b6258, #241f1a);
    }

    &--white {
      background: radial-gradient(circle at 35% 35%, #ffffff, #ddd2c2);
      border: 1rpx solid $color-border;
    }
  }

  &__dot {
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    background: #6fbf73;

    &--off {
      background: #c8beb2;
    }
  }

  &__vs {
    font-size: $font-caption;
    color: $color-text-secondary;
    margin: 0 16rpx;
  }

  &__status {
    display: block;
    text-align: center;
    font-size: $font-caption;
    color: $color-text-secondary;
    margin: 8rpx 0 20rpx;
  }

  &__board-wrap {
    position: relative;
    margin: 0 auto;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
  }

  &__board {
    display: block;
  }

  &__board-hit {
    position: absolute;
    inset: 0;
  }

  &__undo-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: $color-primary-light;
    border: 2rpx solid $color-primary;
    border-radius: $radius-md;
    padding: 16rpx 24rpx;
    margin-bottom: 20rpx;

    &-text {
      font-size: $font-caption;
      color: $color-primary-dark;
      font-weight: 600;
    }

    &-actions {
      display: flex;
      gap: 16rpx;
    }
  }

  &__undo-accept,
  &__undo-reject {
    height: 56rpx;
    line-height: 56rpx;
    padding: 0 24rpx;
    border-radius: $radius-sm;
    font-size: $font-caption;
    border: none;

    &::after {
      border: none;
    }
  }

  &__undo-accept {
    background: $color-primary;
    color: #fff;
  }

  &__undo-reject {
    background: $color-card;
    color: $color-text-secondary;
    border: 2rpx solid $color-border;
  }

  &__actions {
    display: flex;
    justify-content: center;
    margin-top: 24rpx;
  }

  &__undo-btn {
    height: 72rpx;
    line-height: 72rpx;
    padding: 0 40rpx;
    border-radius: $radius-md;
    background: $color-card;
    color: $color-primary-dark;
    border: 2rpx solid $color-primary;
    font-size: $font-caption;

    &::after {
      border: none;
    }

    &[disabled] {
      background: $color-card;
      color: $color-text-secondary;
      border-color: $color-border;
      opacity: 0.6;
    }
  }

  &__result {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 32rpx;

    &-text {
      font-size: $font-title;
      font-weight: 600;
      color: $color-text;
    }

    &-btn {
      margin-top: 24rpx;
    }
  }

  &__leave {
    margin: 48rpx auto 0;
    width: 240rpx;
    height: 72rpx;
    line-height: 72rpx;
    border-radius: $radius-md;
    background: transparent;
    color: $color-text-secondary;
    border: 2rpx solid $color-border;
    font-size: $font-caption;

    &::after {
      border: none;
    }
  }
}

/* ── 猜拳定选边 ── */
.gomoku__rps-mask {
  position: fixed; inset: 0; background: rgba(33, 42, 38, 0.55); z-index: 90;
  display: flex; align-items: center; justify-content: center;
}
.gomoku__rps {
  width: 82%; max-width: 620rpx; background: $color-card; border-radius: 28rpx;
  border: 4rpx solid #493e37; padding: 32rpx; display: flex; flex-direction: column;
  align-items: center; gap: 20rpx;
}
.gomoku__rps-body { display: flex; flex-direction: column; align-items: center; gap: 18rpx; width: 100%; }
.gomoku__rps-title { font-size: 32rpx; font-weight: 800; color: $color-text; }
.gomoku__rps-sub { font-size: 22rpx; color: $color-text-secondary; }
.gomoku__rps-sides, .gomoku__rps-reveal { display: flex; align-items: center; gap: 28rpx; }
.gomoku__rps-side { display: flex; flex-direction: column; align-items: center; gap: 8rpx; min-width: 160rpx; padding: 14rpx 10rpx; border-radius: 16rpx; border: 3rpx solid transparent; }
.gomoku__rps-side--win { border-color: #f4b942; background: rgba(244, 185, 66, 0.15); animation: gomoku-rps-pulse 1s ease-in-out infinite; }
@keyframes gomoku-rps-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.gomoku__rps-stone { width: 84rpx; height: 84rpx; border-radius: 50%; }
.gomoku__rps-stone--black { background: #2b2b2b; border: 4rpx solid #0f0f0f; }
.gomoku__rps-stone--white { background: #fafafa; border: 4rpx solid #d9d2c7; }
.gomoku__rps-name { font-size: 24rpx; color: $color-text; max-width: 180rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gomoku__rps-status { font-size: 20rpx; color: $color-text-secondary; }
.gomoku__rps-pick { font-size: 26rpx; font-weight: 800; color: $color-text; }
.gomoku__rps-vs { font-size: 34rpx; font-weight: 900; color: #e85d4a; }
.gomoku__rps-btns { display: flex; gap: 14rpx; flex-wrap: wrap; justify-content: center; }
.gomoku__rps-btn {
  min-width: 140rpx; height: 76rpx; line-height: 76rpx; font-size: 28rpx; font-weight: 700;
  background: #e85d4a; color: #fff; border-radius: 16rpx; border: none; padding: 0 24rpx;
}
.gomoku__rps-btn--wide { min-width: 240rpx; background: #21483d; }
.gomoku__rps-btn[disabled] { opacity: 0.45; }
.gomoku__rps-wait { font-size: 24rpx; color: $color-text-secondary; }

/* ── 房间聊天 ── */
.gomoku__player { position: relative; }
.gomoku__bubble {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 8rpx);
  max-width: 300rpx; padding: 10rpx 20rpx; background: #fff; border: 2rpx solid rgba(73, 62, 55, 0.15);
  border-radius: 18rpx; box-shadow: 0 4rpx 12rpx rgba(73, 62, 55, 0.18); font-size: 24rpx; color: #493e37;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 12;
  animation: gomoku-bubble-pop 0.18s ease-out;
}
.gomoku__bubble--emoji { font-size: 40rpx; padding: 6rpx 18rpx; }
@keyframes gomoku-bubble-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(8rpx); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.gomoku__chat-zone { padding: 16rpx 0 8rpx; }
.gomoku__chat-bar { display: flex; flex-direction: column; align-items: flex-start; gap: 10rpx; }
.gomoku__chat-feed { display: flex; flex-direction: column; gap: 4rpx; width: 100%; background: $color-card; border: 2rpx solid $color-border; border-radius: 18rpx; padding: 10rpx 20rpx; box-sizing: border-box; }
.gomoku__chat-item { display: flex; align-items: baseline; font-size: 22rpx; }
.gomoku__chat-name { color: $color-text-secondary; flex-shrink: 0; }
.gomoku__chat-text { color: $color-text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gomoku__chat-text--emoji { font-size: 30rpx; }
.gomoku__chat-trigger {
  position: relative; display: flex; align-items: center; gap: 10rpx;
  height: 60rpx; padding: 0 26rpx; background: $color-card; border: 2rpx solid $color-border; border-radius: 30rpx;
}
.gomoku__chat-trigger-icon { font-size: 26rpx; }
.gomoku__chat-trigger-hint { font-size: 24rpx; color: $color-text-secondary; }
.gomoku__chat-unread {
  position: absolute; top: -10rpx; right: -6rpx; min-width: 30rpx; box-sizing: border-box; background: #e85d4a; color: #fff; font-size: 18rpx;
  border-radius: 999rpx; padding: 0 8rpx; line-height: 28rpx; text-align: center;
}
</style>
