<template>
  <view class="xiangqi">
    <!-- 大厅：创建 / 加入 -->
    <view v-if="!state" class="xiangqi__lobby">
      <view class="xiangqi__brand">
        <view class="xiangqi__brand-chips">
          <view class="xiangqi__brand-chip xiangqi__brand-chip--red"><text>帅</text></view>
          <text class="xiangqi__brand-vs">VS</text>
          <view class="xiangqi__brand-chip xiangqi__brand-chip--black"><text>将</text></view>
        </view>
        <text class="xiangqi__brand-title">象棋</text>
        <text class="xiangqi__brand-sub">楚河汉界 · 将帅对垒 · 两人对弈</text>
      </view>
      <button class="xiangqi__primary" :disabled="busy" @tap="onCreate">创建房间</button>
      <view class="xiangqi__divider"><text>或加入好友的房间</text></view>
      <view class="xiangqi__join">
        <input
          v-model="joinCode"
          class="xiangqi__join-input"
          type="number"
          maxlength="4"
          placeholder="输入 4 位房间码"
        />
        <button class="xiangqi__join-btn" :disabled="busy" @tap="onJoin">加入</button>
      </view>
      <text class="xiangqi__rules-link" hover-class="press" @tap="rulesOpen = true">❓ 玩法说明</text>
    </view>

    <!-- 房间 -->
    <view v-else class="xiangqi__room">
      <view class="xiangqi__topbar">
        <view class="xiangqi__back" hover-class="press" @tap="onBack">
          <text class="xiangqi__back-icon">‹</text>
        </view>
        <view class="xiangqi__title">
          <text class="xiangqi__title-main">象棋</text>
          <text class="xiangqi__title-sub">房间码 {{ state.code }} · 两人对弈</text>
        </view>
        <view class="xiangqi__ply">
          <text class="xiangqi__ply-num">{{ roundCount }}</text>
          <text class="xiangqi__ply-label">回合</text>
        </view>
      </view>

      <!-- 对手栏（黑方在上） -->
      <view class="xiangqi__bar">
        <view v-if="roomChat.chatBubbles['black']" class="xiangqi__bubble" :class="{ 'xiangqi__bubble--emoji': roomChat.chatBubbles['black'].isEmoji }">{{ roomChat.chatBubbles['black'].text }}</view>
        <view class="xiangqi__avatar xiangqi__avatar--black">
          <image v-if="state.black?.avatarUrl" class="xiangqi__avatar-img" :src="avatarOf(state.black.avatarUrl)" mode="aspectFill" />
          <text v-else class="xiangqi__avatar-hint">👤</text>
        </view>
        <view class="xiangqi__bar-info">
          <view class="xiangqi__bar-row">
            <text class="xiangqi__bar-name">{{ state.black?.nickname || '等待加入' }}</text>
            <view class="xiangqi__pill xiangqi__pill--black"><text>黑方</text></view>
            <text v-if="state.black" class="xiangqi__dot" :class="{ 'xiangqi__dot--off': !state.black.online }"></text>
          </view>
          <text class="xiangqi__bar-status">{{ opponentStatusText }}</text>
        </view>
        <button v-if="state.status === 'waiting'" class="xiangqi__invite" open-type="share">邀请</button>
        <view v-else class="xiangqi__tray">
          <text class="xiangqi__tray-label">对方吃到</text>
          <view class="xiangqi__tray-chips">
            <view v-for="(rk, i) in capturedByOpponent" :key="i" class="xiangqi__tray-chip xiangqi__tray-chip--me"><text>{{ PIECE_NAMES[mySide][rk] }}</text></view>
            <text v-if="!capturedByOpponent.length" class="xiangqi__tray-empty">暂无</text>
          </view>
        </view>
      </view>

      <!-- 棋盘卡 -->
      <view class="xiangqi__board-card" :style="{ width: cardWidth + 'px' }">
        <canvas
          id="xiangqi-board"
          type="2d"
          class="xiangqi__board"
          :style="{ width: geo.width + 'px', height: geo.height + 'px' }"
        ></canvas>
        <view class="xiangqi__board-hit" @tap="onBoardTap"></view>
      </view>

      <!-- 我的栏（红方在下） -->
      <view class="xiangqi__bar xiangqi__bar--me">
        <view v-if="roomChat.chatBubbles['red']" class="xiangqi__bubble" :class="{ 'xiangqi__bubble--emoji': roomChat.chatBubbles['red'].isEmoji }">{{ roomChat.chatBubbles['red'].text }}</view>
        <view v-if="isMyTurn" class="xiangqi__turn-bar"></view>
        <view class="xiangqi__avatar xiangqi__avatar--red">
          <image v-if="state.red?.avatarUrl" class="xiangqi__avatar-img" :src="avatarOf(state.red.avatarUrl)" mode="aspectFill" />
          <text v-else class="xiangqi__avatar-hint">👤</text>
        </view>
        <view class="xiangqi__bar-info">
          <view class="xiangqi__bar-row">
            <text class="xiangqi__bar-name">{{ state.red?.nickname || '等待加入' }}</text>
            <view class="xiangqi__pill xiangqi__pill--red"><text>红方</text></view>
            <text v-if="state.red" class="xiangqi__dot" :class="{ 'xiangqi__dot--off': !state.red.online }"></text>
          </view>
          <text class="xiangqi__bar-status" :class="{ 'xiangqi__bar-status--mine': isMyTurn }">{{ myStatusText }}</text>
        </view>
        <view class="xiangqi__tray">
          <text class="xiangqi__tray-label">我吃到</text>
          <view class="xiangqi__tray-chips">
            <view v-for="(rk, i) in capturedByMe" :key="i" class="xiangqi__tray-chip xiangqi__tray-chip--opp"><text>{{ PIECE_NAMES[opponentSide][rk] }}</text></view>
            <text v-if="!capturedByMe.length" class="xiangqi__tray-empty">暂无</text>
          </view>
        </view>
      </view>

      <!-- 操作区 -->
      <view class="xiangqi__actions">
        <view class="xiangqi__action" hover-class="press" @tap="rulesOpen = true">
          <text class="xiangqi__action-icon">📖</text>
        </view>
        <view class="xiangqi__action" hover-class="press" @tap="onResign">
          <text class="xiangqi__action-icon">🚩</text>
        </view>
        <view class="xiangqi__action" hover-class="press" @tap="onBack">
          <text class="xiangqi__action-icon">🚪</text>
        </view>
      </view>
      <text class="xiangqi__hint">{{ hintText }}</text>

      <!-- 底部聊天条（家法同 uno:消息 feed 在上,💬 触发钮在左下） -->
      <view v-if="state.status !== 'waiting' && state.status !== 'finished'" class="xiangqi__chatbar">
        <view v-if="feedChats.length" class="xiangqi__chatbar-feed">
          <view v-for="m in feedChats" :key="m.seq" class="xiangqi__chatbar-item">
            <text class="xiangqi__chatbar-name">{{ chatNameOf(m) }}：</text>
            <text class="xiangqi__chatbar-text" :class="{ 'xiangqi__chatbar-text--emoji': m.kind === 'emoji' }">{{ chatBodyOf(m) }}</text>
          </view>
        </view>
        <view class="xiangqi__chatbar-trigger" hover-class="press" @tap="openChat">
          <text class="xiangqi__chatbar-icon">💬</text>
          <text class="xiangqi__chatbar-hint">快捷嘴炮…</text>
          <text v-if="roomChat.unreadChat.value" class="xiangqi__chatbar-unread">{{ roomChat.unreadChat.value > 9 ? '9+' : roomChat.unreadChat.value }}</text>
        </view>
      </view>
    </view>

    <!-- 猜拳定红黑 -->
    <view v-if="state && (state.status === 'rps' || rpsHold)" class="xiangqi__rps-mask">
      <view class="xiangqi__rps">
        <view v-if="state.status === 'rps' && state.rps && state.rps.phase === 'pick'" class="xiangqi__rps-body">
          <view class="xiangqi__rps-title">✊ 猜拳定红黑<text v-if="state.rps.round > 1"> · 平局重出第 {{ state.rps.round }} 轮</text></view>
          <view v-if="state.rps.lastPicks" class="xiangqi__rps-sub">上轮：{{ rpsLabel(state.rps.lastPicks.red) }} vs {{ rpsLabel(state.rps.lastPicks.black) }}，平局！</view>
          <view class="xiangqi__rps-sub">胜者执红先行 · {{ rpsCountdown }}s 后未出自动代出</view>
          <view class="xiangqi__rps-sides">
            <view class="xiangqi__rps-side">
              <view class="xiangqi__rps-chip xiangqi__rps-chip--red"><text>红</text></view>
              <text class="xiangqi__rps-name">{{ state.red?.nickname ?? '等待' }}</text>
              <text class="xiangqi__rps-status">{{ state.myRole === 'red' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
            <text class="xiangqi__rps-vs">VS</text>
            <view class="xiangqi__rps-side">
              <view class="xiangqi__rps-chip xiangqi__rps-chip--black"><text>黑</text></view>
              <text class="xiangqi__rps-name">{{ state.black?.nickname ?? '等待' }}</text>
              <text class="xiangqi__rps-status">{{ state.myRole === 'black' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
          </view>
          <view v-if="state.rps.myTurn" class="xiangqi__rps-btns">
            <button v-for="(label, i) in RPS_LABELS" :key="i" class="xiangqi__rps-btn" :disabled="busy" @tap="rps(RPS_KEYS[i])">{{ label }}</button>
          </view>
          <view v-else class="xiangqi__rps-wait">已出拳，等对方…</view>
        </view>
        <view v-else-if="rpsHold && rpsHoldData" class="xiangqi__rps-body">
          <view class="xiangqi__rps-title">✅ {{ rpsHoldData.winnerName }} 猜拳获胜 · 执红先行</view>
          <view class="xiangqi__rps-sides">
            <view class="xiangqi__rps-side" :class="{ 'xiangqi__rps-side--win': rpsHoldData.winner === 'red' }">
              <view class="xiangqi__rps-chip xiangqi__rps-chip--red"><text>红</text></view>
              <text class="xiangqi__rps-name">{{ rpsHoldData.red }}</text>
              <text class="xiangqi__rps-pick">{{ rpsLabel(rpsHoldData.picks.red) }}</text>
            </view>
            <text class="xiangqi__rps-vs">VS</text>
            <view class="xiangqi__rps-side" :class="{ 'xiangqi__rps-side--win': rpsHoldData.winner === 'black' }">
              <view class="xiangqi__rps-chip xiangqi__rps-chip--black"><text>黑</text></view>
              <text class="xiangqi__rps-name">{{ rpsHoldData.black }}</text>
              <text class="xiangqi__rps-pick">{{ rpsLabel(rpsHoldData.picks.black) }}</text>
            </view>
          </view>
          <view class="xiangqi__rps-wait">对局开始，红方先行！</view>
        </view>
      </view>
    </view>

    <!-- 结算遮罩 -->
    <view v-if="state && state.status === 'finished'" class="xiangqi__scrim">
      <view class="xiangqi__result-card">
        <view class="xiangqi__result-deco">
          <view class="xiangqi__deco-line"></view>
          <text class="xiangqi__deco-leaf">🍁</text>
          <view class="xiangqi__deco-line"></view>
        </view>
        <text class="xiangqi__result-title">{{ iWon ? '胜利！' : '惜败' }}</text>
        <text class="xiangqi__result-sub">{{ resultSubText }}</text>
        <view class="xiangqi__result-stats">
          <view class="xiangqi__stat-row">
            <text class="xiangqi__stat-label">存活血子</text>
            <view class="xiangqi__stat-values">
              <text class="xiangqi__stat-num xiangqi__stat-num--red">{{ myAliveCount }}</text>
              <text class="xiangqi__stat-colon">:</text>
              <text class="xiangqi__stat-num xiangqi__stat-num--black">{{ opponentAliveCount }}</text>
            </view>
          </view>
          <view class="xiangqi__stat-row">
            <text class="xiangqi__stat-label">阵亡名单</text>
            <view class="xiangqi__stat-dead">
              <view v-for="(rk, i) in capturedByOpponent" :key="'m' + i" class="xiangqi__dead-chip xiangqi__dead-chip--red"><text>{{ PIECE_NAMES[mySide][rk] }}</text></view>
              <text class="xiangqi__stat-colon">|</text>
              <view v-for="(rk, i) in capturedByMe" :key="'o' + i" class="xiangqi__dead-chip xiangqi__dead-chip--black"><text>{{ PIECE_NAMES[opponentSide][rk] }}</text></view>
            </view>
          </view>
        </view>
        <view class="xiangqi__result-badge"><text>{{ iWon ? '🎉 棋开得胜' : '💪 再战一局扳回来' }}</text></view>
        <button v-if="isSeated" class="xiangqi__result-rematch" :disabled="busy" @tap="onRematch">再来一局 · 重新猜拳</button>
        <button class="xiangqi__result-leave" @tap="onLeaveAndBack">返回房间</button>
      </view>
    </view>

    <!-- 规则抽屉 -->
    <view v-if="rulesOpen" class="xiangqi__rules-scrim" @tap="rulesOpen = false">
      <view class="xiangqi__drawer" @tap.stop>
        <view class="xiangqi__drawer-head">
          <text class="xiangqi__drawer-title">象棋 · 玩法</text>
          <view class="xiangqi__drawer-close" hover-class="press" @tap="rulesOpen = false">
            <text>✕</text>
          </view>
        </view>
        <scroll-view class="xiangqi__drawer-scroll" scroll-y :show-scrollbar="false">
          <view class="xiangqi__rule">
            <view class="xiangqi__rule-label"><text>目标</text></view>
            <text class="xiangqi__rule-text">将死或困毙对方的将/帅即获胜。被将军时必须应将。</text>
          </view>
          <view class="xiangqi__rule">
            <view class="xiangqi__rule-label"><text>棋子走法</text></view>
            <view v-for="(m, i) in MOVE_TABLE" :key="i" class="xiangqi__sp-row">
              <view class="xiangqi__sp-chip" :class="m.red ? 'xiangqi__sp-chip--red' : 'xiangqi__sp-chip--dark'"><text>{{ m.name }}</text></view>
              <text class="xiangqi__sp-text">{{ m.desc }}</text>
            </view>
          </view>
          <view class="xiangqi__rule">
            <view class="xiangqi__rule-label"><text>本局规则</text></view>
            <view class="xiangqi__sp-row"><view class="xiangqi__cg-badge"><text>规则</text></view><text class="xiangqi__sp-text">猜拳定红黑 · 红方先行</text></view>
            <view class="xiangqi__sp-row"><view class="xiangqi__cg-badge"><text>规则</text></view><text class="xiangqi__sp-text">每步限时 45 秒 · 超时系统代走</text></view>
            <view class="xiangqi__sp-row"><view class="xiangqi__cg-badge"><text>规则</text></view><text class="xiangqi__sp-text">将死 / 认输 / 无子可走判负</text></view>
          </view>
          <text class="xiangqi__rule-tail">祝对弈开心 🍁</text>
        </scroll-view>
      </view>
    </view>

    <!-- 房间聊天面板 -->
    <GameChatPanel :ctrl="roomChat" :text-enabled="unoChatTextEnabled" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useXiangqiRoom } from '@/pages-games/composables/useXiangqiRoom'
import { leaveRoom } from '@/pages-games/services/xiangqi'
import { resolveAvatarUrl } from '@/services/toolbox'
import { getCanvasNode, getElementRect, getWindowInfo } from '@/utils/canvasAdapter'
import { PIECE_NAMES, legalTargets, pieceAt, opponent as opponentOf } from '@/pages-games/utils/xiangqi'
import type { CanvasNode, ElementRect } from '@/utils/canvasAdapter'
import type { XiangqiLastMove, XiangqiPieceType, XiangqiRoomState, XiangqiSide } from '@/types/xiangqi'
import GameChatPanel from '@/pages-games/components/GameChatPanel.vue'
import { useRoomChat, type RoomChatMessage } from '@/pages-games/composables/useRoomChat'
import { useFeatures } from '@/composables/useFeatures'
import { gamePhraseText } from '@/pages-games/utils/gameChat'
import { playXiangqiSound } from '@/pages-games/utils/xiangqiSound'

// ---------- 原型色板（prototypes/枫叶小屋原型.pen 象棋三帧） ----------
const COLOR_BOARD = '#FFFDF8'
const COLOR_INK = '#4A3F35'
const COLOR_MARK = '#C9A876'
const COLOR_RIVER_TEXT = '#C9B896'
const COLOR_RED = '#E85D4A'
const COLOR_RED_DEEP = '#B8402E'
const COLOR_BLACK = '#4A3F35'
const COLOR_BLACK_DEEP = '#2E2620'
const COLOR_GOLD = '#F4B942'
const COLOR_GOLD_DOT = '#F4B942E6'
const COLOR_GOLD_TINT = '#F4B94214'
const COLOR_ATTACK = '#E85D4A'

const rulesOpen = ref(false)

/** 规则抽屉 · 棋子走法表（红名 + 走法说明）。 */
const MOVE_TABLE: Array<{ name: string, red: boolean, desc: string }> = [
  { name: '车', red: true, desc: '横竖任意远，不可越子' },
  { name: '马', red: true, desc: '走「日」字；紧邻方向有子会蹩马腿' },
  { name: '炮', red: true, desc: '横竖任意远；吃子必须隔一个「炮架」' },
  { name: '相', red: true, desc: '走「田」字，不可过河；田心有子塞象眼（黑：象）' },
  { name: '仕', red: true, desc: '九宫内斜走一格（黑：士）' },
  { name: '帅', red: true, desc: '九宫内横竖一格；将帅不可直接对脸（黑：将）' },
  { name: '兵', red: true, desc: '过河前只进；过河后可横走，永不后退（黑：卒）' },
]

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
  myColor,
  isMyTurn,
  createAndEnter,
  joinByCode,
  submitMove,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useXiangqiRoom()

const instance = getCurrentInstance()
const joinCode = ref('')
const busy = ref(false)

const avatarOf = (url: string) => resolveAvatarUrl(url)

// ---------- 底部聊天条 ----------
const feedChats = computed(() => roomChat.recentChats.value)
const chatNameOf = (m: RoomChatMessage): string =>
  m.role === 'red' ? (state.value?.red?.nickname ?? '红方') : (state.value?.black?.nickname ?? '黑方')
const chatBodyOf = (m: RoomChatMessage): string =>
  m.kind === 'sticker' ? '[贴纸]' : m.kind === 'phrase' ? (gamePhraseText(m.text) ?? m.text) : m.text

// ---------- 派生数据 ----------
const roundCount = computed(() => Math.ceil((state.value?.ply ?? 0) / 2))
const mySide = computed<XiangqiSide>(() => myColor.value ?? 'red')
const opponentSide = computed<XiangqiSide>(() => (mySide.value === 'red' ? 'black' : 'red'))
/** 对方吃到 = 我方阵亡；我吃到 = 对方阵亡。 */
const capturedByOpponent = computed<XiangqiPieceType[]>(() => state.value?.trays[mySide.value] ?? [])
const capturedByMe = computed<XiangqiPieceType[]>(() => state.value?.trays[opponentSide.value] ?? [])
const myAliveCount = computed(() => (state.value ? state.value.pieces.filter(p => p.side === mySide.value && p.alive).length : 0))
const opponentAliveCount = computed(() => (state.value ? state.value.pieces.filter(p => p.side === opponentSide.value && p.alive).length : 0))
const iWon = computed(() => state.value?.winner != null && state.value.winner === myColor.value)

const opponentStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return '等待好友加入…'
  if (current.status === 'rps') return '猜拳定红黑中…'
  if (current.status === 'finished') {
    if (current.winReason === 'forfeit') return current.winner === myColor.value ? '对方中途离开' : '你认输了'
    return current.winReason === 'checkmate' ? '被将死了…' : '无子可走…'
  }
  return current.turn === opponentSide.value ? '对方思考中…' : '等待你走棋'
})

const myStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return isSeated.value ? '等好友进来就开局' : ''
  if (current.status === 'rps') return '猜拳定红黑'
  if (current.status === 'finished') return iWon.value ? '你赢了 🎉' : '下次一定'
  if (!isSeated.value) return '观战中'
  return isMyTurn.value ? `轮到你了 · 剩 ${countdown.value} 秒` : '等待对方走棋…'
})

const hintText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.lastEvent && current.lastEvent.seq > 0) return `战报：${current.lastEvent.text}`
  if (current.status === 'waiting') return '等待好友加入 · 分享房间码即可开局'
  if (current.status === 'rps') return '猜拳定红黑 · 胜者执红先行'
  if (current.status === 'finished') return '对局结束'
  if (current.status === 'playing' && isMyTurn.value) return '点击棋子查看可行位置 · 金点为落点'
  return '等待对方走棋…'
})

const resultSubText = computed(() => {
  const current = state.value
  if (!current) return ''
  const reason = current.winReason
  const reasonText
    = reason === 'checkmate' ? (iWon.value ? '将死对方' : '被将死')
      : reason === 'stalemate' ? (iWon.value ? '对方困毙' : '无子可走')
        : iWon.value ? '对方中途离开' : '中途离场判负'
  return `${reasonText} · 共 ${roundCount.value} 回合`
})

// ---------- 猜拳定红黑 ----------
const RPS_LABELS = ['石头', '布', '剪刀']
const RPS_KEYS = ['r', 'p', 's']
const rpsCountdown = ref(0)
let rpsCountdownTimer: ReturnType<typeof setInterval> | null = null

function rpsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '…'
  return RPS_LABELS[value] ?? String(value)
}

const rpsHold = ref(false)
const rpsHoldData = ref<{ winnerName: string, winner: XiangqiSide, picks: { red: number | null, black: number | null }, red: string, black: string } | null>(null)
let rpsHoldTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => `${state.value?.status ?? ''}|${state.value?.rps?.phase ?? ''}`,
  (key, prevKey) => {
    // 字符串 key 值比较：数组 getter 每次返回新引用会反复触发（gomoku/junqi 家法）
    const [status, phase] = key.split('|')
    if (status === 'rps' && phase === 'pick') {
      const rpsState = state.value?.rps
      if (rpsState?.myTurn) {
        if (rpsCountdownTimer) clearInterval(rpsCountdownTimer)
        rpsCountdown.value = state.value?.ttl ?? 10
        rpsCountdownTimer = setInterval(() => {
          if (rpsCountdown.value > 0) rpsCountdown.value--
        }, 1000)
      }
    }
    if (status === 'playing') {
      if (rpsCountdownTimer) { clearInterval(rpsCountdownTimer); rpsCountdownTimer = null }
      const rpsState = state.value?.rps
      if (prevKey === 'rps|pick' && rpsState && rpsState.phase === 'done' && rpsState.winner && !rpsHold.value) {
        const st = state.value
        rpsHoldData.value = {
          winnerName: (rpsState.winner === 'red' ? st?.red : st?.black)?.nickname ?? '?',
          winner: rpsState.winner,
          picks: rpsState.picks ?? { red: null, black: null },
          red: st?.red?.nickname ?? '?',
          black: st?.black?.nickname ?? '?',
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

// ---------- 选中与落点提示（绝对交点坐标） ----------
const selected = ref<{ r: number, c: number } | null>(null)
const hints = ref<Array<{ r: number, c: number }>>([])

function clearSelection() {
  selected.value = null
  hints.value = []
}

// ---------- 棋盘渲染（原型：pitch 35 / 边距 19.25 / 交点 x=32+c*35, y=42+r*35，等比缩放） ----------
const windowWidth = getWindowInfo().windowWidth
const windowHeight = getWindowInfo().windowHeight
const cardWidth = Math.min(windowWidth - 16, 343)
const canvasWidth = cardWidth - 24
const pitch = Math.max(Math.floor(Math.min(canvasWidth / 9.2, (windowHeight - 320) / 10.4)), 26)
const margin = Math.round(pitch * 0.55)
const geo = { pitch, margin, width: 8 * pitch + 2 * margin, height: 9 * pitch + 2 * margin }
let boardNode: CanvasNode | null = null
let boardRect: ElementRect | null = null

const pointX = (c: number) => margin + c * pitch
const pointY = (r: number) => margin + r * pitch

async function initBoard() {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#xiangqi-board', instance)
    boardNode.canvas.width = geo.width * boardNode.dpr
    boardNode.canvas.height = geo.height * boardNode.dpr
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    boardRect = await getElementRect('#xiangqi-board', instance)
    drawBoard()
  } catch (error) {
    console.warn('[xiangqi] init board failed:', error)
  }
}

function drawBoard() {
  if (!boardNode) return
  const { ctx } = boardNode
  const s = pitch / 35

  ctx.clearRect(0, 0, geo.width, geo.height)
  ctx.fillStyle = COLOR_BOARD
  ctx.fillRect(0, 0, geo.width, geo.height)

  ctx.strokeStyle = COLOR_INK
  ctx.lineWidth = 1.2 * s
  ctx.lineCap = 'round'

  // 横线 10 条
  for (let r = 0; r < 10; r++) {
    ctx.beginPath()
    ctx.moveTo(pointX(0), pointY(r))
    ctx.lineTo(pointX(8), pointY(r))
    ctx.stroke()
  }
  // 竖线：两侧贯通，中间七列在河界断开
  for (let c = 0; c < 9; c++) {
    ctx.beginPath()
    ctx.moveTo(pointX(c), pointY(0))
    ctx.lineTo(pointX(c), pointY(4))
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pointX(c), pointY(5))
    ctx.lineTo(pointX(c), pointY(9))
    ctx.stroke()
  }
  // 九宫斜线
  for (const [c, r, c2, r2] of [[3, 0, 5, 2], [5, 0, 3, 2], [3, 7, 5, 9], [5, 7, 3, 9]] as Array<[number, number, number, number]>) {
    ctx.beginPath()
    ctx.moveTo(pointX(c), pointY(r))
    ctx.lineTo(pointX(c2), pointY(r2))
    ctx.stroke()
  }
  // 楚河汉界
  ctx.fillStyle = COLOR_RIVER_TEXT
  ctx.font = `600 ${15 * s}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('楚  河', pointX(2), pointY(4.5))
  ctx.fillText('汉  界', pointX(6), pointY(4.5))
  // 炮位/兵位刻度
  ctx.strokeStyle = COLOR_MARK
  ctx.lineWidth = 1.1 * s
  const marks: Array<[number, number, boolean]> = [
    [1, 2, true], [7, 2, true], [1, 7, true], [7, 7, true],
    [0, 3, false], [2, 3, true], [4, 3, true], [6, 3, true], [8, 3, false],
    [0, 6, false], [2, 6, true], [4, 6, true], [6, 6, true], [8, 6, false],
  ]
  const g = 3 * s
  const l = 5 * s
  for (const [c, r, full] of marks) {
    const px = pointX(c)
    const py = pointY(r)
    const sides: Array<[number, boolean]> = full ? [[-1, true], [1, true]] : (c === 0 ? [[1, true]] : [[-1, true]])
    for (const [dir, drawTop] of sides) {
      if (drawTop) {
        ctx.beginPath()
        ctx.moveTo(px + dir * g, py - g - l)
        ctx.lineTo(px + dir * g, py - g)
        ctx.moveTo(px + dir * g, py - g)
        ctx.lineTo(px + dir * (g + l), py - g)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(px + dir * g, py + g)
      ctx.lineTo(px + dir * g, py + g + l)
      ctx.moveTo(px + dir * g, py + g)
      ctx.lineTo(px + dir * (g + l), py + g)
      ctx.stroke()
    }
  }

  const current = state.value

  // 棋子（交点圆片；黑上红下；被翻转视角：蓝/黑座位在本地 180° 旋转）
  if (current) {
    for (const piece of current.pieces) {
      if (!piece.alive) continue
      // 落子动画期间跳过终点上的移动子，改为插值位置绘制
      if (anim.value && piece.r === anim.value.tr && piece.c === anim.value.tc && piece.side === anim.value.side) continue
      const pos = absToScreen(piece.r, piece.c)
      drawPieceCenter(ctx, pos.c, pos.r, piece.piece, piece.side)
    }
  }

  // 落子首尾标记 + 滑动插值（lastMove 驱动；终点金圈待动画落定后出现）
  const lm = current?.lastMove
  if (lm) {
    const startPos = absToScreen(lm.fr, lm.fc)
    ctx.strokeStyle = COLOR_GOLD
    ctx.globalAlpha = anim.value ? 0.85 : 0.45
    ctx.lineWidth = 1.6 * s
    ctx.setLineDash([3.5 * s, 2.5 * s])
    ctx.beginPath()
    ctx.arc(pointX(startPos.c), pointY(startPos.r), 11 * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  if (anim.value) {
    const a = anim.value
    const p = Math.min(1, (Date.now() - a.startMs) / ANIM_MS)
    const eased = 1 - (1 - p) * (1 - p)
    const from = absToScreen(a.fr, a.fc)
    const to = absToScreen(a.tr, a.tc)
    drawPieceCenter(ctx, pointX(from.c) + (pointX(to.c) - pointX(from.c)) * eased, pointY(from.r) + (pointY(to.r) - pointY(from.r)) * eased, a.piece, a.side)
  } else if (lm) {
    const endPos = absToScreen(lm.tr, lm.tc)
    ctx.strokeStyle = COLOR_GOLD
    ctx.lineWidth = 2 * s
    ctx.beginPath()
    ctx.arc(pointX(endPos.c), pointY(endPos.r), 17.5 * s, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 选中金圈 + 落点金点
  if (selected.value) {
    ctx.strokeStyle = COLOR_GOLD
    ctx.lineWidth = 2.5 * s
    ctx.beginPath()
    ctx.arc(pointX(selected.value.c), pointY(selected.value.r), 18 * s, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const hint of hints.value) {
    const cx = pointX(hint.c)
    const cy = pointY(hint.r)
    if (current && pieceAt(current.pieces, hint.r, hint.c)) {
      ctx.strokeStyle = COLOR_ATTACK
      ctx.lineWidth = 2.5 * s
      ctx.beginPath()
      ctx.arc(cx, cy, 17.5 * s, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = COLOR_GOLD_DOT
      ctx.beginPath()
      ctx.arc(cx, cy, 6.5 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawPiece(ctx: CanvasRenderingContext2D, r: number, c: number, piece: XiangqiPieceType, side: XiangqiSide) {
  drawPieceCenter(ctx, pointX(c), pointY(r), piece, side)
}

/** 以圆心坐标绘制棋子（落子动画的插值位置也走这里）。 */
function drawPieceCenter(ctx: CanvasRenderingContext2D, cx: number, cy: number, piece: XiangqiPieceType, side: XiangqiSide) {
  const s = pitch / 35
  const radius = 15 * s
  const red = side === 'red'

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = red ? COLOR_RED : COLOR_BLACK
  ctx.fill()
  ctx.lineWidth = 1.5 * s
  ctx.strokeStyle = red ? COLOR_RED_DEEP : COLOR_BLACK_DEEP
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, radius - 3 * s, 0, Math.PI * 2)
  ctx.strokeStyle = '#FFFFFF73'
  ctx.lineWidth = 1 * s
  ctx.stroke()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 ${14 * s}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(PIECE_NAMES[side][piece], cx, cy + 0.5 * s)
}

// ---------- 落子动画 + 首尾标记（lastMove 驱动：起点虚线圈 / 终点金圈 / 250ms 滑动） ----------
const ANIM_MS = 250
const anim = ref<{ side: XiangqiSide; piece: XiangqiPieceType; fr: number; fc: number; tr: number; tc: number; startMs: number } | null>(null)
let animTimer: ReturnType<typeof setInterval> | null = null

function startMoveAnim(next: XiangqiRoomState, lm: XiangqiLastMove | null): void {
  if (!lm) {
    drawBoard()
    return
  }
  const moved = pieceAt(next.pieces, lm.tr, lm.tc)
  if (!moved) {
    drawBoard()
    return
  }
  anim.value = { side: moved.side, piece: moved.piece, fr: lm.fr, fc: lm.fc, tr: lm.tr, tc: lm.tc, startMs: Date.now() }
  if (animTimer) clearInterval(animTimer)
  animTimer = setInterval(() => {
    if (!anim.value) {
      if (animTimer) clearInterval(animTimer)
      animTimer = null
      return
    }
    const p = Math.min(1, (Date.now() - anim.value.startMs) / ANIM_MS)
    drawBoard()
    if (p >= 1) {
      if (animTimer) clearInterval(animTimer)
      animTimer = null
      anim.value = null
      drawBoard()
    }
  }, 16)
}

/** 黑方座位本地 180° 旋转（screen↔absolute：r'=9-r，c'=8-c）。 */
function screenToAbs(r: number, c: number): { r: number, c: number } {
  if (myColor.value === 'black') return { r: 9 - r, c: 8 - c }
  return { r, c }
}
function absToScreen(r: number, c: number): { r: number, c: number } {
  if (myColor.value === 'black') return { r: 9 - r, c: 8 - c }
  return { r, c }
}

async function onBoardTap(event: unknown) {
  const current = state.value
  if (!current || current.status !== 'playing') return
  if (anim.value) return // 落子动画播放中不接受输入
  if (!isSeated.value) return
  if (!isMyTurn.value) {
    uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  const detail = (event as { detail?: { x?: number, y?: number } }).detail
  if (detail?.x === undefined || detail?.y === undefined) return
  if (!boardRect) boardRect = await getElementRect('#xiangqi-board', instance)
  const x = detail.x - boardRect.left
  const y = detail.y - boardRect.top
  const c = Math.round((x - margin) / pitch)
  const r = Math.round((y - margin) / pitch)
  if (c < 0 || c > 8 || r < 0 || r > 9) {
    clearSelection()
    drawBoard()
    return
  }
  if (Math.abs(x - pointX(c)) > pitch * 0.48 || Math.abs(y - pointY(r)) > pitch * 0.48) {
    clearSelection()
    drawBoard()
    return
  }
  const abs = screenToAbs(r, c)
  const piece = pieceAt(current.pieces, abs.r, abs.c)
  if (piece && piece.side === mySide.value) {
    if (selected.value && selected.value.r === abs.r && selected.value.c === abs.c) {
      clearSelection()
    } else {
      selected.value = { r: abs.r, c: abs.c }
      hints.value = legalTargets(current.pieces, mySide.value, abs.r, abs.c).map(([hr, hc]) => ({ r: hr, c: hc }))
      playXiangqiSound('select')
    }
    drawBoard()
    return
  }
  if (selected.value) {
    const hit = hints.value.find(h => h.r === abs.r && h.c === abs.c)
    if (hit) {
      const from = selected.value
      clearSelection()
      drawBoard()
      await submitMove(from.r, from.c, abs.r, abs.c)
      return
    }
    clearSelection()
    drawBoard()
  }
}

// ---------- 状态变化：重画 + 播报 + 音效 ----------
let prevPly = 0
let prevStatus = ''
let prevTurn: string | null = null
let prevEventSeq = 0
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null
function resetCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdown.value = state.value?.ttl ?? 0
  countdownTimer = setInterval(() => {
    if (countdown.value > 0) countdown.value--
  }, 1000)
}

watch(
  state,
  (next) => {
    clearSelection()
    if (!next) {
      prevPly = 0
      prevStatus = ''
      prevTurn = null
      prevEventSeq = 0
      return
    }
    const firstLoad = prevStatus === ''
    if (next.ttl > 0 && next.status !== (prevStatus || '')) resetCountdown()

    const event = next.lastEvent
    drawBoard()
    if (event && event.seq > prevEventSeq && !firstLoad) {
      // 任何一手落地都重置回合倒计时 + 播放滑动动画（对方也能一眼看到动了哪个子）
      if (event.type === 'move' || event.type === 'capture' || event.type === 'check') resetCountdown()
      if (event.type === 'move' || event.type === 'capture' || event.type === 'check') startMoveAnim(next, next.lastMove)
      if (event.type === 'check') playXiangqiSound('check')
      else if (event.type === 'capture') playXiangqiSound('capture')
      else if (event.type === 'move') playXiangqiSound('move')
      else if (event.type === 'win' || event.type === 'forfeit') playXiangqiSound(iWon.value ? 'win' : 'lose')
      else if (event.type === 'rps_win') playXiangqiSound('rps')
    }
    prevEventSeq = Math.max(prevEventSeq, event?.seq ?? 0)

    if (!firstLoad && next.status === 'playing' && prevStatus === 'rps') {
      uni.showToast({ title: '对局开始，红方先行', icon: 'none' })
    }
    if (!firstLoad && next.status === 'playing' && prevStatus === 'playing' && next.turn === myColor.value && prevTurn !== myColor.value) {
      uni.showToast({ title: '轮到你了', icon: 'none' })
    }
    prevPly = next.ply
    prevStatus = next.status
    prevTurn = next.turn
  },
  { deep: true },
)

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
  await guard(async () => {
    clearSelection()
    battleCleanup()
    await requestRematch()
  })
}

function battleCleanup() {
  /* 预留：清战斗横幅状态 */
}

async function onLeaveAndBack() {
  await exitRoom()
  joinCode.value = ''
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
      confirmColor: '#E85D4A',
      success: (res) => {
        if (res.confirm) void onLeaveAndBack()
      },
    })
    return
  }
  void onLeaveAndBack()
}

function onResign() {
  const current = state.value
  if (!current) return
  if (current.status !== 'playing' && current.status !== 'rps') {
    void onLeaveAndBack()
    return
  }
  if (!isSeated.value) {
    void onLeaveAndBack()
    return
  }
  uni.showModal({
    title: '认输',
    content: '确定认输结束本局吗？',
    confirmColor: '#E85D4A',
    success: (res) => {
      if (!res.confirm) return
      void guard(async () => {
        // leave 即判负（forfeit），保留 state 展示结算卡
        state.value = await leaveRoom(current.code)
      })
    },
  })
}

function openChat() {
  roomChat.chatPanelOpen.value = true
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
  title: state.value ? `来下象棋！房间码 ${state.value.code}` : '来下象棋！',
  path: state.value?.sharePath ?? '/pages-games/xiangqi/index',
}))
</script>

<style lang="scss" scoped>
.xiangqi {
  min-height: 100vh;
  padding: 0 16px 24rpx;
  box-sizing: border-box;
  background: #fff8f0;

  &__lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 120rpx;
  }

  &__brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 64rpx;
  }

  &__brand-chips {
    display: flex;
    align-items: center;
    gap: 20rpx;
  }

  &__brand-chip {
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 40rpx;
    font-weight: 700;

    &--red {
      background: #e85d4a;
      border: 3rpx solid #b8402e;
    }

    &--black {
      background: #4a3f35;
      border: 3rpx solid #2e2620;
    }
  }

  &__brand-vs {
    font-size: 28rpx;
    font-weight: 700;
    color: #b9a98f;
  }

  &__brand-title {
    font-size: 48rpx;
    font-weight: 700;
    color: #4a3f35;
  }

  &__brand-sub {
    font-size: 24rpx;
    color: #7d6f60;
  }

  &__primary {
    width: 100%;
    height: 96rpx;
    line-height: 96rpx;
    border-radius: 48rpx;
    background: #e85d4a;
    color: #fff;
    font-size: 32rpx;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__divider {
    margin: 40rpx 0;
    font-size: 22rpx;
    color: #b9a98f;
  }

  &__join {
    display: flex;
    gap: 16rpx;
    width: 100%;
  }

  &__join-input {
    flex: 1;
    height: 88rpx;
    padding: 0 32rpx;
    border-radius: 44rpx;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    font-size: 30rpx;
  }

  &__join-btn {
    width: 200rpx;
    height: 88rpx;
    line-height: 88rpx;
    border-radius: 44rpx;
    background: #f7eedf;
    color: #4a3f35;
    font-size: 30rpx;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__rules-link {
    margin-top: 48rpx;
    font-size: 26rpx;
    color: #7d6f60;
  }

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
    background: #f7eedf;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__back-icon {
    font-size: 22px;
    color: #4a3f35;
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
    color: #4a3f35;
  }

  &__title-sub {
    font-size: 10px;
    color: #7d6f60;
  }

  &__ply {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__ply-num {
    font-size: 24px;
    font-weight: 600;
    color: #4a3f35;
  }

  &__ply-label {
    font-size: 10px;
    color: #7d6f60;
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
    background: #f4b942;
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

  &__avatar--black {
    background: #f7eedf;
  }

  &__avatar--red {
    background: #f9e0da;
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
    color: #4a3f35;
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

    &--black {
      background: #4a3f35;
    }

    &--red {
      background: #e85d4a;
    }
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #6fa06b;

    &--off {
      background: #dccdb6;
    }
  }

  &__bar-status {
    font-size: 10px;
    color: #7d6f60;

    &--mine {
      color: #c08a1e;
      font-weight: 600;
    }
  }

  &__invite {
    margin: 0;
    padding: 0 16px;
    height: 32px;
    line-height: 32px;
    border-radius: 16px;
    background: #f4b942;
    color: #4a3f35;
    font-size: 13px;
    font-weight: 600;

    &::after {
      border: none;
    }
  }

  &__tray {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  &__tray-label {
    font-size: 9px;
    color: #b9a98f;
  }

  &__tray-chips {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 150px;
  }

  &__tray-chip {
    width: 20px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 10px;
    font-weight: 700;

    &--me {
      background: #e85d4a;
    }

    &--opp {
      background: #4a3f35;
    }
  }

  &__tray-empty {
    font-size: 9px;
    color: #dccdb6;
  }

  &__bubble {
    position: absolute;
    top: -30px;
    left: 12px;
    max-width: 70%;
    padding: 4px 10px;
    border-radius: 10px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    font-size: 11px;
    color: #4a3f35;
    z-index: 2;

    &--emoji {
      font-size: 20px;
    }
  }

  &__board-card {
    align-self: center;
    padding: 12px;
    border-radius: 16px;
    background: #fff;
    border: 1rpx solid #f0e4d7;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }

  &__board {
    display: block;
  }

  &__board-hit {
    position: absolute;
    inset: 0;
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
    background: #f7eedf;
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
    color: #7d6f60;
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
    background: rgba(255, 248, 237, 0.95);
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -2px 10px rgba(62, 50, 38, 0.08);
  }

  &__chatbar-trigger {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 16px;
    background: #f7eedf;
    flex-shrink: 0;
  }

  &__chatbar-icon {
    font-size: 14px;
  }

  &__chatbar-hint {
    font-size: 11px;
    color: #b9a98f;
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
    background: #e85d4a;
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
    border: 1rpx solid #f0e4d7;
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
    color: #b9a98f;
    flex-shrink: 0;
  }

  &__chatbar-text {
    font-size: 10px;
    color: #7d6f60;
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
    background: #3e3226b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__rps {
    width: 299px;
    border-radius: 20px;
    background: #fff8f0;
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
    font-weight: 700;
    color: #4a3f35;
  }

  &__rps-sub {
    font-size: 11px;
    color: #7d6f60;
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
      .xiangqi__rps-name {
        color: #c08a1e;
      }
    }
  }

  &__rps-chip {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
    font-weight: 700;

    &--red {
      background: #e85d4a;
    }

    &--black {
      background: #4a3f35;
    }
  }

  &__rps-name {
    font-size: 12px;
    font-weight: 600;
    color: #4a3f35;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__rps-status {
    font-size: 10px;
    color: #7d6f60;
  }

  &__rps-pick {
    font-size: 11px;
    font-weight: 600;
    color: #c08a1e;
  }

  &__rps-vs {
    font-size: 14px;
    font-weight: 700;
    color: #b9a98f;
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
    background: #f7eedf;
    color: #4a3f35;
    font-size: 28rpx;
    font-weight: 600;
    padding: 0;

    &::after {
      border: none;
    }
  }

  &__rps-wait {
    font-size: 12px;
    color: #7d6f60;
  }

  &__scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: #3e3226b8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__result-card {
    width: 299px;
    border-radius: 20px;
    background: #fff8f0;
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
    background: #e8d9c4;
  }

  &__deco-leaf {
    font-size: 18px;
  }

  &__result-title {
    font-size: 30px;
    font-weight: 700;
    color: #e85d4a;
  }

  &__result-sub {
    font-size: 12px;
    color: #7d6f60;
  }

  &__result-stats {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 4px;
  }

  &__stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__stat-label {
    font-size: 11px;
    color: #b9a98f;
  }

  &__stat-values {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__stat-num {
    font-size: 20px;
    font-weight: 700;

    &--red {
      color: #e85d4a;
    }

    &--black {
      color: #4a3f35;
    }
  }

  &__stat-colon {
    color: #dccdb6;
  }

  &__stat-dead {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    max-width: 200px;
  }

  &__dead-chip {
    width: 22px;
    height: 22px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 10px;
    font-weight: 700;

    &--red {
      background: #e85d4a;
    }

    &--black {
      background: #4a3f35;
    }
  }

  &__result-badge {
    padding: 6px 16px;
    border-radius: 16px;
    background: #f7eedf;
    font-size: 12px;
    color: #4a3f35;
  }

  &__result-rematch {
    width: 100%;
    height: 44px;
    line-height: 44px;
    border-radius: 22px;
    background: #e85d4a;
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
    background: #f7eedf;
    color: #4a3f35;
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
    background: #3e322680;
    display: flex;
    align-items: flex-end;
  }

  &__drawer {
    width: 100%;
    max-height: 72vh;
    border-radius: 24px 24px 0 0;
    background: #fff8f0;
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
    font-weight: 700;
    color: #4a3f35;
  }

  &__drawer-close {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #f7eedf;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #7d6f60;
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
      font-weight: 700;
      color: #4a3f35;
    }

    &::before {
      content: '';
      width: 3px;
      height: 12px;
      border-radius: 2px;
      background: #f4b942;
    }
  }

  &__rule-text {
    font-size: 11px;
    line-height: 1.6;
    color: #7d6f60;
  }

  &__rule-tail {
    display: block;
    text-align: center;
    font-size: 11px;
    color: #b9a98f;
    padding: 8px 0;
  }

  &__sp-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__sp-chip {
    flex-shrink: 0;
    width: 36px;
    padding: 2px 0;
    border-radius: 12px;
    background: #e85d4a;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    text-align: center;

    &--dark {
      background: #4a3f35;
    }
  }

  &__sp-text {
    font-size: 11px;
    line-height: 1.5;
    color: #7d6f60;
  }

  &__cg-badge {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 8px;
    background: #f4b94233;
    color: #c08a1e;
    font-size: 9px;
    font-weight: 700;
  }
}
</style>
