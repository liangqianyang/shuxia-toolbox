<template>
  <view class="jungle">
    <!-- 大厅：创建 / 加入 -->
    <view v-if="!state" class="jungle__lobby">
      <view class="jungle__brand">
        <view class="jungle__brand-chips">
          <view class="jungle__brand-chip jungle__brand-chip--blue"><text>象</text></view>
          <text class="jungle__brand-vs">VS</text>
          <view class="jungle__brand-chip jungle__brand-chip--red"><text>狮</text></view>
        </view>
        <text class="jungle__brand-title">斗兽棋</text>
        <text class="jungle__brand-sub">猜拳选边，鼠可吃象、狮虎跳河</text>
      </view>
      <button class="jungle__primary" :disabled="busy" @tap="onCreate">创建房间</button>
      <view class="jungle__divider"><text>或加入好友的房间</text></view>
      <view class="jungle__join">
        <input
          v-model="joinCode"
          class="jungle__join-input"
          type="number"
          maxlength="4"
          placeholder="输入 4 位房间码"
        />
        <button class="jungle__join-btn" :disabled="busy" @tap="onJoin">加入</button>
      </view>
      <text class="jungle__rules-link" hover-class="press" @tap="rulesOpen = true">❓ 玩法说明</text>
    </view>

    <!-- 房间 -->
    <view v-else class="jungle__room">
      <!-- 数据栏：返回 / 标题+房间码 / 回合数 -->
      <view class="jungle__topbar">
        <view class="jungle__back" hover-class="press" @tap="onBack">
          <text class="jungle__back-icon">‹</text>
        </view>
        <view class="jungle__title">
          <text class="jungle__title-main">斗兽棋</text>
          <text class="jungle__title-sub">房间码 {{ state.code }} · 联机对战</text>
        </view>
        <view class="jungle__ply">
          <text class="jungle__ply-num">{{ roundCount }}</text>
          <text class="jungle__ply-label">回合</text>
        </view>
      </view>

      <!-- 对手栏（蓝方在上） -->
      <view class="jungle__bar">
        <view v-if="roomChat.chatBubbles['blue']" class="jungle__bubble" :class="{ 'jungle__bubble--emoji': roomChat.chatBubbles['blue'].isEmoji }">{{ roomChat.chatBubbles['blue'].text }}</view>
        <view class="jungle__avatar jungle__avatar--blue">
          <image v-if="state.blue?.avatarUrl" class="jungle__avatar-img" :src="avatarOf(state.blue.avatarUrl)" mode="aspectFill" />
          <text v-else class="jungle__avatar-hint">👤</text>
        </view>
        <view class="jungle__bar-info">
          <view class="jungle__bar-row">
            <text class="jungle__bar-name">{{ state.blue?.nickname || '等待加入' }}</text>
            <view class="jungle__pill jungle__pill--blue"><text>蓝方</text></view>
            <text v-if="state.blue" class="jungle__dot" :class="{ 'jungle__dot--off': !state.blue.online }"></text>
          </view>
          <text class="jungle__bar-status">{{ opponentStatusText }}</text>
        </view>
        <button v-if="state.status === 'waiting'" class="jungle__invite" open-type="share">邀请</button>
        <view v-else class="jungle__tray">
          <text class="jungle__tray-label">对方吃到</text>
          <view class="jungle__tray-chips">
            <view v-for="a in capturedByOpponent" :key="a" class="jungle__tray-chip"><text>{{ ANIMAL_CN[a] }}</text></view>
            <text v-if="!capturedByOpponent.length" class="jungle__tray-empty">暂无</text>
          </view>
        </view>
      </view>

      <!-- 棋盘卡 -->
      <view class="jungle__board-card" :style="{ width: cardWidth + 'px' }">
        <canvas
          id="jungle-board"
          type="2d"
          class="jungle__board"
          :style="{ width: boardWidth + 'px', height: boardHeight + 'px' }"
        ></canvas>
        <view class="jungle__board-hit" @tap="onBoardTap"></view>
      </view>

      <!-- 我的栏（红方在下） -->
      <view class="jungle__bar jungle__bar--me">
        <view v-if="roomChat.chatBubbles['red']" class="jungle__bubble" :class="{ 'jungle__bubble--emoji': roomChat.chatBubbles['red'].isEmoji }">{{ roomChat.chatBubbles['red'].text }}</view>
        <view v-if="isMyTurn" class="jungle__turn-bar"></view>
        <view class="jungle__avatar jungle__avatar--red">
          <image v-if="state.red?.avatarUrl" class="jungle__avatar-img" :src="avatarOf(state.red.avatarUrl)" mode="aspectFill" />
          <text v-else class="jungle__avatar-hint">👤</text>
        </view>
        <view class="jungle__bar-info">
          <view class="jungle__bar-row">
            <text class="jungle__bar-name">{{ state.red?.nickname || '等待加入' }}</text>
            <view class="jungle__pill jungle__pill--red"><text>红方</text></view>
            <text v-if="state.red" class="jungle__dot" :class="{ 'jungle__dot--off': !state.red.online }"></text>
          </view>
          <text class="jungle__bar-status" :class="{ 'jungle__bar-status--mine': isMyTurn }">{{ myStatusText }}</text>
        </view>
        <view class="jungle__tray">
          <text class="jungle__tray-label">我吃到</text>
          <view class="jungle__tray-chips">
            <view v-for="a in capturedByMe" :key="a" class="jungle__tray-chip"><text>{{ ANIMAL_CN[a] }}</text></view>
            <text v-if="!capturedByMe.length" class="jungle__tray-empty">暂无</text>
          </view>
        </view>
      </view>

      <!-- 操作区：聊天 / 规则 / 认输 -->
      <view class="jungle__actions">
        <view class="jungle__action" hover-class="press" @tap="openChat">
          <text class="jungle__action-icon">💬</text>
          <text v-if="roomChat.unreadChat.value" class="jungle__action-unread">{{ roomChat.unreadChat.value > 9 ? '9+' : roomChat.unreadChat.value }}</text>
        </view>
        <view class="jungle__action" hover-class="press" @tap="rulesOpen = true">
          <text class="jungle__action-icon">📖</text>
        </view>
        <view class="jungle__action" hover-class="press" @tap="onResign">
          <text class="jungle__action-icon">🚩</text>
        </view>
      </view>
      <text class="jungle__hint">{{ hintText }}</text>
    </view>

    <!-- 猜拳定选边（开局仪式：出拳 → 胜者选边 → 定格） -->
    <view v-if="state && (state.status === 'rps' || rpsHold)" class="jungle__rps-mask">
      <view class="jungle__rps">
        <!-- 出拳阶段 -->
        <view v-if="state.status === 'rps' && state.rps && state.rps.phase === 'pick'" class="jungle__rps-body">
          <view class="jungle__rps-title">✊ 猜拳定选边<text v-if="state.rps.round > 1"> · 平局重出第 {{ state.rps.round }} 轮</text></view>
          <view v-if="state.rps.lastPicks" class="jungle__rps-sub">上轮：{{ rpsLabel(state.rps.lastPicks.red) }} vs {{ rpsLabel(state.rps.lastPicks.blue) }}，平局！</view>
          <view class="jungle__rps-sub">胜者可选执红先手或执蓝后手 · {{ rpsCountdown }}s 后未出自动代出</view>
          <view class="jungle__rps-sides">
            <view class="jungle__rps-side">
              <view class="jungle__rps-chip jungle__rps-chip--red"><text>红</text></view>
              <text class="jungle__rps-name">{{ state.red?.nickname ?? '等待' }}</text>
              <text class="jungle__rps-status">{{ state.myRole === 'red' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
            <text class="jungle__rps-vs">VS</text>
            <view class="jungle__rps-side">
              <view class="jungle__rps-chip jungle__rps-chip--blue"><text>蓝</text></view>
              <text class="jungle__rps-name">{{ state.blue?.nickname ?? '等待' }}</text>
              <text class="jungle__rps-status">{{ state.myRole === 'blue' ? (state.rps.myPick === null ? '出拳中…' : '已出 ✓') : (state.rps.opponentPicked ? '已出 ✓' : '出拳中…') }}</text>
            </view>
          </view>
          <view v-if="state.rps.myTurn" class="jungle__rps-btns">
            <button v-for="(label, i) in RPS_LABELS" :key="i" class="jungle__rps-btn" :disabled="busy" @tap="rps(RPS_KEYS[i])">{{ label }}</button>
          </view>
          <view v-else class="jungle__rps-wait">已出拳，等对方…</view>
        </view>
        <!-- 选边阶段（双方出拳已公开） -->
        <view v-else-if="state.status === 'rps' && state.rps && state.rps.phase === 'choose'" class="jungle__rps-body">
          <view class="jungle__rps-title">🏆 {{ rpsWinnerName }} 赢得选边权</view>
          <view class="jungle__rps-sides">
            <view class="jungle__rps-side" :class="{ 'jungle__rps-side--win': state.rps.winner === 'red' }">
              <view class="jungle__rps-chip jungle__rps-chip--red"><text>红</text></view>
              <text class="jungle__rps-name">{{ state.red?.nickname ?? '?' }}</text>
              <text class="jungle__rps-pick">{{ rpsLabel(state.rps.picks?.red) }}</text>
            </view>
            <text class="jungle__rps-vs">VS</text>
            <view class="jungle__rps-side" :class="{ 'jungle__rps-side--win': state.rps.winner === 'blue' }">
              <view class="jungle__rps-chip jungle__rps-chip--blue"><text>蓝</text></view>
              <text class="jungle__rps-name">{{ state.blue?.nickname ?? '?' }}</text>
              <text class="jungle__rps-pick">{{ rpsLabel(state.rps.picks?.blue) }}</text>
            </view>
          </view>
          <view v-if="state.rps.myTurn" class="jungle__rps-btns">
            <button class="jungle__rps-btn jungle__rps-btn--red" :disabled="busy" @tap="chooseColor('red')">🔴 执红先手</button>
            <button class="jungle__rps-btn jungle__rps-btn--blue" :disabled="busy" @tap="chooseColor('blue')">🔵 执蓝后手</button>
          </view>
          <view v-else class="jungle__rps-wait">等{{ rpsWinnerName }}选边…（{{ rpsCountdown }}s 后默认执红）</view>
        </view>
        <!-- 结果定格：开局后短暂展示 -->
        <view v-else-if="rpsHold && rpsHoldData" class="jungle__rps-body">
          <view class="jungle__rps-title">✅ {{ rpsHoldData.winnerName }} 选择{{ rpsHoldData.chosen === 'red' ? '执红先手' : '执蓝后手' }}</view>
          <view class="jungle__rps-sides">
            <view class="jungle__rps-side">
              <view class="jungle__rps-chip jungle__rps-chip--red"><text>红</text></view>
              <text class="jungle__rps-name">{{ rpsHoldData.red }}</text>
              <text class="jungle__rps-pick">{{ rpsLabel(rpsHoldData.picks.red) }}</text>
            </view>
            <text class="jungle__rps-vs">VS</text>
            <view class="jungle__rps-side">
              <view class="jungle__rps-chip jungle__rps-chip--blue"><text>蓝</text></view>
              <text class="jungle__rps-name">{{ rpsHoldData.blue }}</text>
              <text class="jungle__rps-pick">{{ rpsLabel(rpsHoldData.picks.blue) }}</text>
            </view>
          </view>
          <view class="jungle__rps-wait">对局开始，红方先行！</view>
        </view>
      </view>
    </view>

    <!-- 结算遮罩 -->
    <view v-if="state && state.status === 'finished'" class="jungle__scrim">
      <view class="jungle__result-card">
        <view class="jungle__result-deco">
          <view class="jungle__deco-line"></view>
          <text class="jungle__deco-leaf">🍁</text>
          <view class="jungle__deco-line"></view>
        </view>
        <text class="jungle__result-title">{{ iWon ? '胜利！' : '惜败' }}</text>
        <text class="jungle__result-sub">{{ resultSubText }}</text>
        <view class="jungle__result-stats">
          <view class="jungle__stat-row">
            <text class="jungle__stat-label">吃掉对方</text>
            <view class="jungle__stat-values">
              <text class="jungle__stat-num jungle__stat-num--red">{{ myCapturedCount }}</text>
              <text class="jungle__stat-colon">:</text>
              <text class="jungle__stat-num jungle__stat-num--blue">{{ opponentCapturedCount }}</text>
            </view>
          </view>
          <view class="jungle__stat-row">
            <text class="jungle__stat-label">存活动物</text>
            <view class="jungle__stat-values">
              <text class="jungle__stat-num jungle__stat-num--red">{{ myAliveCount }}</text>
              <text class="jungle__stat-colon">:</text>
              <text class="jungle__stat-num jungle__stat-num--blue">{{ opponentAliveCount }}</text>
            </view>
          </view>
        </view>
        <view class="jungle__result-badge"><text>{{ iWon ? '🎉 干得漂亮' : '💪 再战一局扳回来' }}</text></view>
        <button v-if="isSeated" class="jungle__result-rematch" :disabled="busy" @tap="onRematch">再来一局</button>
        <button class="jungle__result-leave" @tap="onLeaveAndBack">离开房间</button>
      </view>
    </view>

    <!-- 规则抽屉 -->
    <view v-if="rulesOpen" class="jungle__rules-scrim" @tap="rulesOpen = false">
      <view class="jungle__drawer" @tap.stop>
        <view class="jungle__drawer-head">
          <text class="jungle__drawer-title">斗兽棋 · 玩法</text>
          <view class="jungle__drawer-close" hover-class="press" @tap="rulesOpen = false">
            <text>✕</text>
          </view>
        </view>
        <scroll-view class="jungle__drawer-scroll" scroll-y :show-scrollbar="false">
          <view class="jungle__rule">
            <view class="jungle__rule-label"><text>目标</text></view>
            <text class="jungle__rule-text">任一动物走进对方的兽穴即获胜；任何动物都不能走进自己的兽穴。</text>
          </view>
          <view class="jungle__rule">
            <view class="jungle__rule-label"><text>等级</text></view>
            <text class="jungle__rule-text">等级大的动物可以吃掉等级小或相同的动物。</text>
            <view class="jungle__rank-chain">
              <template v-for="(a, i) in RANK_ORDER" :key="a">
                <text v-if="i" class="jungle__rank-gt">&gt;</text>
                <view class="jungle__rank-chip"><text>{{ ANIMAL_CN[a] }}</text></view>
              </template>
            </view>
            <view class="jungle__rule-note"><text>例外：鼠可以吃象，象不能吃鼠</text></view>
          </view>
          <view class="jungle__rule">
            <view class="jungle__rule-label"><text>河流</text></view>
            <text class="jungle__rule-text">只有鼠能下河。水中的鼠与岸上的动物互相不能攻击，但两只在水中的鼠可以互吃。</text>
            <view class="jungle__mini">
              <view class="jungle__mini-cell jungle__mini-cell--land"></view>
              <view class="jungle__mini-cell jungle__mini-cell--water"></view>
              <view class="jungle__mini-cell jungle__mini-cell--water">
                <view class="jungle__mini-chip jungle__mini-chip--red"><text>鼠</text></view>
              </view>
              <view class="jungle__mini-cell jungle__mini-cell--land"></view>
            </view>
          </view>
          <view class="jungle__rule">
            <view class="jungle__rule-label"><text>狮虎跳河</text></view>
            <text class="jungle__rule-text">狮和虎可以沿直线跳过河，直达对岸并吃掉落点上的动物；若跳跃路线的水中有鼠（无论哪方）挡道，则不能跳。</text>
            <view class="jungle__mini">
              <view class="jungle__mini-cell jungle__mini-cell--land">
                <view class="jungle__mini-chip jungle__mini-chip--red"><text>狮</text></view>
              </view>
              <view class="jungle__mini-cell jungle__mini-cell--water jungle__mini-cell--jump"></view>
              <view class="jungle__mini-cell jungle__mini-cell--water jungle__mini-cell--jump">
                <text class="jungle__mini-arrow">→</text>
              </view>
              <view class="jungle__mini-cell jungle__mini-cell--land">
                <view class="jungle__mini-chip jungle__mini-chip--blue"><text>狗</text></view>
              </view>
            </view>
          </view>
          <view class="jungle__rule">
            <view class="jungle__rule-label"><text>陷阱</text></view>
            <text class="jungle__rule-text">走进对方陷阱的动物等级视为 0，可被任何敌方动物吃掉；自己的陷阱对自己没有影响。</text>
            <view class="jungle__mini">
              <view class="jungle__mini-cell jungle__mini-cell--trap">
                <view class="jungle__mini-chip jungle__mini-chip--blue"><text>象</text></view>
              </view>
              <view class="jungle__mini-cell jungle__mini-cell--trap"><text class="jungle__mini-mark">陷</text></view>
              <view class="jungle__mini-cell jungle__mini-cell--trap"><text class="jungle__mini-mark">陷</text></view>
              <view class="jungle__mini-cell jungle__mini-cell--den"><text class="jungle__mini-mark jungle__mini-mark--den">穴</text></view>
            </view>
          </view>
          <text class="jungle__rule-tail">祝对弈开心 🍁</text>
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
import { useJungleRoom } from '@/composables/useJungleRoom'
import { leaveRoom } from '@/services/jungle'
import { resolveAvatarUrl } from '@/services/toolbox'
import { getCanvasNode, getElementRect, getWindowInfo } from '@/utils/canvasAdapter'
import {
  ANIMAL_CN,
  RANK_ORDER,
  RANKS,
  boardMetrics,
  capturedOf,
  cellRect,
  findLegalMoves,
  isDenOf,
  isRiver,
  isTrapOf,
  pieceAt,
  pointToCell,
  type JungleBoardMetrics,
  type JungleHint,
} from '@/utils/jungle'
import type { CanvasNode, ElementRect } from '@/utils/canvasAdapter'
import type { JungleAnimal, JungleSide } from '@/types/jungle'
import GameChatPanel from '@/components/GameChatPanel.vue'
import { useRoomChat, type RoomChatMessage } from '@/composables/useRoomChat'
import { useFeatures } from '@/composables/useFeatures'

// ---------- 原型色板（prototypes/枫叶小屋原型.pen 斗兽棋四帧，dou-* 变量实值） ----------
const COLOR_LAND = '#F7EEDF'
const COLOR_GRID = '#E8D9C4'
const COLOR_WATER = '#C9E7F0'
const COLOR_WAVE_1 = '#FFFFFFB3'
const COLOR_WAVE_2 = '#FFFFFF80'
const COLOR_TRAP = '#F7DFD3'
const COLOR_TRAP_TEXT = '#C05B4A'
const COLOR_DEN = '#4A3F35'
const COLOR_DEN_TEXT = '#FFF8F0'
const COLOR_RED = '#E85D4A'
const COLOR_RED_DEEP = '#B8402E'
const COLOR_BLUE = '#5B8FB9'
const COLOR_BLUE_DEEP = '#3D6E96'
const COLOR_GOLD = '#F4B942'
const COLOR_GOLD_DOT = '#F4B94299'
const COLOR_GOLD_TINT = '#F4B94240'
const COLOR_WATER_RING = '#FFFFFFB3'
const COLOR_BADGE = '#FFF8F0'

const rulesOpen = ref(false)

// ---------- 房间聊天（通用 useRoomChat + 共享面板；气泡按红/蓝座位键锚定） ----------
const { unoChatTextEnabled, refreshFeatures } = useFeatures()
const roomChat = useRoomChat({
  chat: () => (state.value?.chat ?? []) as RoomChatMessage[],
  code: () => state.value?.code ?? '',
  send: (kind, payload) => sendChat(kind, payload),
})

const {
  state,
  isSeated,
  myColor,
  isMyTurn,
  createAndEnter,
  joinByCode,
  rps,
  chooseColor,
  sendChat,
  submitMove,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useJungleRoom()

const instance = getCurrentInstance()
const joinCode = ref('')
const busy = ref(false)

const avatarOf = (url: string) => resolveAvatarUrl(url)

// ---------- 派生数据 ----------
const roundCount = computed(() => Math.ceil((state.value?.ply ?? 0) / 2))
const mySide = computed<JungleSide>(() => myColor.value ?? 'red')
const opponentSide = computed<JungleSide>(() => (mySide.value === 'red' ? 'blue' : 'red'))
/** 对方吃掉的 = 我方阵亡。 */
const capturedByOpponent = computed<JungleAnimal[]>(() => (state.value ? capturedOf(state.value.pieces, mySide.value) : []))
const capturedByMe = computed<JungleAnimal[]>(() => (state.value ? capturedOf(state.value.pieces, opponentSide.value) : []))
const myCapturedCount = computed(() => capturedByMe.value.length)
const opponentCapturedCount = computed(() => capturedByOpponent.value.length)
const myAliveCount = computed(() => (state.value ? state.value.pieces.filter((p) => p.side === mySide.value).length : 0))
const opponentAliveCount = computed(() => (state.value ? state.value.pieces.filter((p) => p.side === opponentSide.value).length : 0))
const iWon = computed(() => state.value?.winner != null && state.value.winner === myColor.value)

const opponentStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return '等待好友加入…'
  if (current.status === 'rps') return '猜拳定选边中…'
  if (current.status === 'finished') {
    if (current.winReason === 'forfeit') return current.winner === myColor.value ? '对方中途离开' : '兽穴被攻陷…'
    return current.winReason === 'den' ? '兽穴被攻陷…' : '全军覆没…'
  }
  return current.turn === opponentSide.value ? '对方思考中…' : '等待对方走棋…'
})

const myStatusText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.status === 'waiting') return isSeated.value ? '等好友进来就开局' : ''
  if (current.status === 'rps') return '猜拳定选边'
  if (current.status === 'finished') return iWon.value ? '你赢了 🎉' : '下次一定'
  if (!isSeated.value) return '观战中'
  return isMyTurn.value ? '轮到你了 · 点击动物行棋' : '等待对方走棋…'
})

const hintText = computed(() => {
  const current = state.value
  if (!current) return ''
  if (selected.value) {
    const piece = pieceAt(current.pieces, selected.value.r, selected.value.c)
    return `已选中 ${piece?.side === 'red' ? '红' : '蓝'}·${piece ? ANIMAL_CN[piece.animal] : ''} · 金点为落点 · 红圈为可吃目标`
  }
  if (current.status === 'waiting') return '等待好友加入 · 分享房间码即可开局'
  if (current.status === 'rps') return '猜拳定选边 · 胜者选执红或执蓝'
  if (current.status === 'finished') return '对局结束'
  if (current.status === 'playing' && isMyTurn.value) return '点击动物查看可行位置 · 金点为落点 · 红圈为可吃'
  return '等待对方走棋…'
})

const resultSubText = computed(() => {
  const current = state.value
  if (!current) return ''
  const reason = current.winReason
  const reasonText
    = reason === 'den' ? (iWon.value ? '攻入对方兽穴' : '兽穴被攻陷')
      : reason === 'eliminated' ? (iWon.value ? '吃光对方动物' : '全军覆没')
        : reason === 'stuck' ? (iWon.value ? '对方困毙' : '无路可走')
          : iWon.value ? '对方中途离开' : '中途离场判负'
  return `${reasonText} · 共 ${roundCount.value} 回合`
})

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
  return (rps.winner === 'red' ? state.value?.red : state.value?.blue)?.nickname ?? '?'
})

/** 结果定格：status 从 rps → playing 时用最后一份 rps 数据停留 2s。 */
const rpsHold = ref(false)
const rpsHoldData = ref<{ winnerName: string; chosen: string; picks: { red: number | null; blue: number | null }; red: string; blue: string } | null>(null)
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
          winnerName: (winnerRole === 'red' ? st?.red : st?.blue)?.nickname ?? '?',
          chosen: rps.chosen,
          picks: rps.picks ?? { red: null, blue: null },
          red: st?.red?.nickname ?? '?',
          blue: st?.blue?.nickname ?? '?',
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

// ---------- 选中与落点提示 ----------

const selected = ref<{ r: number; c: number } | null>(null)
const hints = ref<JungleHint[]>([])

function clearSelection() {
  selected.value = null
  hints.value = []
}

// ---------- 棋盘渲染 ----------

const windowWidth = getWindowInfo().windowWidth
/** 原型：375 屏 → 卡 343×433（pad 14）、盘面 315×405（格 45）；等比换算到当前屏宽。 */
const cardWidth = Math.min(windowWidth - 16, 343)
const boardWidth = cardWidth - 28
const cell = boardWidth / 7
const boardHeight = cell * 9
const metrics: JungleBoardMetrics = boardMetrics(boardWidth, boardHeight)
let boardNode: CanvasNode | null = null
let boardRect: ElementRect | null = null

async function initBoard() {
  await nextTick()
  try {
    boardNode = await getCanvasNode('#jungle-board', instance)
    boardNode.canvas.width = boardWidth * boardNode.dpr
    boardNode.canvas.height = boardHeight * boardNode.dpr
    boardNode.ctx.scale(boardNode.dpr, boardNode.dpr)
    boardRect = await getElementRect('#jungle-board', instance)
    drawBoard()
  } catch (error) {
    console.warn('[jungle] init board failed:', error)
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawBoard() {
  if (!boardNode) return
  const { ctx } = boardNode
  const s = cell / 45

  ctx.clearRect(0, 0, boardWidth, boardHeight)
  ctx.fillStyle = COLOR_LAND
  ctx.fillRect(0, 0, boardWidth, boardHeight)

  // 地形格：河 / 陷阱 / 兽穴（原型 dou-* 实值）
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 7; c++) {
      const { x, y, size } = cellRect(r, c, metrics)
      if (isRiver(r, c)) {
        ctx.fillStyle = COLOR_WATER
        ctx.fillRect(x, y, size, size)
        ctx.fillStyle = COLOR_WAVE_1
        roundRectPath(ctx, x + 8 * s, y + 18 * s, 12 * s, 3 * s, 1.5 * s)
        ctx.fill()
        ctx.fillStyle = COLOR_WAVE_2
        roundRectPath(ctx, x + 25 * s, y + 27 * s, 9 * s, 3 * s, 1.5 * s)
        ctx.fill()
      } else if (isDenOf('blue', r, c) || isDenOf('red', r, c)) {
        ctx.fillStyle = COLOR_DEN
        ctx.fillRect(x, y, size, size)
        ctx.fillStyle = COLOR_DEN_TEXT
        ctx.font = `700 ${11 * s}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('兽穴', x + size / 2, y + size / 2)
      } else if (isTrapOf('blue', r, c) || isTrapOf('red', r, c)) {
        ctx.fillStyle = COLOR_TRAP
        ctx.fillRect(x, y, size, size)
        ctx.fillStyle = COLOR_TRAP_TEXT
        ctx.font = `600 ${13 * s}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('陷', x + size / 2, y + size / 2)
      }
      ctx.strokeStyle = COLOR_GRID
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
    }
  }

  const current = state.value
  if (!current) return

  // 跳河路线高亮（选中的狮虎准备跳过的水格）
  for (const hint of hints.value) {
    if (!hint.jump || !selected.value) continue
    const step = selected.value.c < hint.c ? 1 : -1
    for (let c = selected.value.c + step; c !== hint.c; c += step) {
      const { x, y, size } = cellRect(selected.value.r, c, metrics)
      ctx.fillStyle = COLOR_GOLD_TINT
      ctx.fillRect(x, y, size, size)
    }
  }

  // 棋子（水中鼠加白圈）
  for (const piece of current.pieces) {
    drawPiece(ctx, piece)
  }

  // 选中金圈 + 落点金点 / 可吃红圈
  if (selected.value) {
    const sel = cellRect(selected.value.r, selected.value.c, metrics)
    ctx.strokeStyle = COLOR_GOLD
    ctx.lineWidth = 3 * s
    ctx.beginPath()
    ctx.arc(sel.x + sel.size / 2, sel.y + sel.size / 2, 23 * s, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const hint of hints.value) {
    const rect = cellRect(hint.r, hint.c, metrics)
    const cx = rect.x + rect.size / 2
    const cy = rect.y + rect.size / 2
    if (hint.capture) {
      ctx.strokeStyle = COLOR_RED
      ctx.lineWidth = 3 * s
      ctx.beginPath()
      ctx.arc(cx, cy, 23 * s, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = COLOR_GOLD_DOT
      ctx.beginPath()
      ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawPiece(ctx: CanvasRenderingContext2D, piece: { side: JungleSide; animal: JungleAnimal; r: number; c: number }) {
  const { x, y, size } = cellRect(piece.r, piece.c, metrics)
  const s = cell / 45
  const cx = x + size / 2
  const cy = y + size / 2
  const red = piece.side === 'red'

  // 水中鼠：白色水圈
  if (isRiver(piece.r, piece.c)) {
    ctx.strokeStyle = COLOR_WATER_RING
    ctx.lineWidth = 1.5 * s
    ctx.beginPath()
    ctx.arc(cx, cy, 23 * s, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(cx, cy, 20 * s, 0, Math.PI * 2)
  ctx.fillStyle = red ? COLOR_RED : COLOR_BLUE
  ctx.fill()
  ctx.lineWidth = 2 * s
  ctx.strokeStyle = red ? COLOR_RED_DEEP : COLOR_BLUE_DEEP
  ctx.stroke()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 ${17 * s}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ANIMAL_CN[piece.animal], cx, cy - 1 * s)

  // 右下角阶数徽章
  const bx = cx + 13.5 * s
  const by = cy + 13.5 * s
  ctx.beginPath()
  ctx.arc(bx, by, 7.5 * s, 0, Math.PI * 2)
  ctx.fillStyle = COLOR_BADGE
  ctx.fill()
  ctx.fillStyle = red ? COLOR_RED : COLOR_BLUE
  ctx.font = `700 ${10 * s}px sans-serif`
  ctx.fillText(String(RANKS[piece.animal]), bx, by + 0.5 * s)
}

async function onBoardTap(event: unknown) {
  const current = state.value
  if (!current || current.status !== 'playing') return
  if (!isSeated.value) return
  if (!isMyTurn.value) {
    uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  const detail = (event as { detail?: { x?: number; y?: number } }).detail
  if (detail?.x === undefined || detail?.y === undefined) return
  if (!boardRect) boardRect = await getElementRect('#jungle-board', instance)
  const target = pointToCell(detail.x - boardRect.left, detail.y - boardRect.top, metrics)
  if (!target) {
    clearSelection()
    drawBoard()
    return
  }
  const piece = pieceAt(current.pieces, target.r, target.c)
  if (piece && piece.side === mySide.value) {
    // 再点同子取消；点其他己方子切换选中
    if (selected.value && selected.value.r === target.r && selected.value.c === target.c) {
      clearSelection()
    } else {
      selected.value = { r: target.r, c: target.c }
      hints.value = findLegalMoves(current.pieces, mySide.value, target.r, target.c)
    }
    drawBoard()
    return
  }
  if (selected.value) {
    const hit = hints.value.find((h) => h.r === target.r && h.c === target.c)
    if (hit) {
      const from = selected.value
      clearSelection()
      drawBoard()
      await submitMove(from.r, from.c, target.r, target.c)
      return
    }
    clearSelection()
    drawBoard()
  }
}

// 状态变化即重画 + 播报（吃子 / 开局）
let prevPly = 0
let prevStatus = ''
watch(
  state,
  (next) => {
    clearSelection()
    drawBoard()
    if (!next) {
      prevPly = 0
      prevStatus = ''
      return
    }
    const firstLoad = prevStatus === ''
    if (!firstLoad && next.status === 'playing' && prevStatus === 'rps') {
      uni.showToast({ title: '对局开始，红方先行', icon: 'none' })
    }
    if (!firstLoad && next.ply > prevPly && next.lastMove?.captured) {
      const captured = next.lastMove.captured
      uni.showToast({
        title: captured.side === myColor.value ? `你的${ANIMAL_CN[captured.animal]}被吃掉了` : `吃掉了对方的${ANIMAL_CN[captured.animal]}`,
        icon: 'none',
      })
    }
    if (!firstLoad && next.status === 'playing' && prevStatus === 'playing' && next.turn === myColor.value) {
      uni.showToast({ title: '轮到你了', icon: 'none' })
    }
    prevPly = next.ply
    prevStatus = next.status
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
    selected.value = null
    hints.value = []
    await requestRematch()
  })
}

/** 结算卡「离开房间」：退出并返回上一页。 */
async function onLeaveAndBack() {
  await exitRoom()
  joinCode.value = ''
  uni.navigateBack({ fail: () => {} })
}

/** 数据栏返回：waiting/finished 直接退；对局中二次确认（离开判负）。 */
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

/** 认输（🚩）：确认后判负但留在房间看结算。 */
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
  title: state.value ? `来下斗兽棋！房间码 ${state.value.code}` : '来下斗兽棋！',
  path: state.value ? `/pages/jungle/index?room=${state.value.code}` : '/pages/jungle/index',
}))
</script>

<style lang="scss" scoped>
.jungle {
  min-height: 100vh;
  padding: 0 16px 24rpx;
  box-sizing: border-box;
  background: #fff8f0;

  /* ── 大厅 ── */
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
    margin-bottom: 64rpx;

    &-chips {
      display: flex;
      align-items: center;
      gap: 32rpx;
    }

    &-chip {
      width: 112rpx;
      height: 112rpx;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 48rpx;
      font-weight: 700;

      &--blue {
        background: #5b8fb9;
        border: 4rpx solid #3d6e96;
      }

      &--red {
        background: #e85d4a;
        border: 4rpx solid #b8402e;
      }
    }

    &-vs {
      font-size: 36rpx;
      font-weight: 900;
      color: #c08a1e;
    }

    &-title {
      font-size: $font-title;
      font-weight: 600;
      color: $color-text;
      margin-top: 24rpx;
    }

    &-sub {
      font-size: $font-caption;
      color: $color-text-secondary;
      margin-top: 8rpx;
    }
  }

  &__primary {
    width: 480rpx;
    height: 96rpx;
    line-height: 96rpx;
    border-radius: $radius-lg;
    background: #f4b942;
    color: #6b4a12;
    font-size: $font-body;
    font-weight: 600;
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

  &__rules-link {
    margin-top: 28rpx;
    font-size: $font-body;
    color: #c08a1e;
    text-decoration: underline;
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
      color: #c08a1e;
      border: 2rpx solid #f4b942;
      font-size: $font-body;

      &::after {
        border: none;
      }
    }
  }

  /* ── 数据栏 ── */
  &__topbar {
    position: relative;
    display: flex;
    align-items: center;
    height: 96rpx;
  }

  &__back {
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    background: #f7eddf;
    display: flex;
    align-items: center;
    justify-content: center;

    &-icon {
      font-size: 44rpx;
      color: $color-text-secondary;
      margin-top: -4rpx;
    }
  }

  &__title {
    display: flex;
    flex-direction: column;
    margin-left: 24rpx;

    &-main {
      font-size: 32rpx;
      font-weight: 600;
      color: $color-text;
    }

    &-sub {
      font-size: 20rpx;
      color: $color-text-secondary;
      margin-top: 4rpx;
    }
  }

  &__ply {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: center;

    &-num {
      font-size: 44rpx;
      font-weight: 600;
      color: $color-text;
      line-height: 1.1;
    }

    &-label {
      font-size: 20rpx;
      color: $color-text-secondary;
    }
  }

  /* ── 双方栏 ── */
  &__bar {
    position: relative;
    display: flex;
    align-items: center;
    height: 108rpx;
  }

  &__avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    &-hint {
      font-size: 32rpx;
      color: #b9a98f;
    }

    &--blue {
      background: #f7eddf;
    }

    &--red {
      background: #f9e0da;
      margin-left: 6rpx;
    }
  }

  &__turn-bar {
    position: absolute;
    left: -10rpx;
    top: 24rpx;
    width: 6rpx;
    height: 60rpx;
    border-radius: 4rpx;
    background: #f4b942;
  }

  &__bar-info {
    display: flex;
    flex-direction: column;
    margin-left: 20rpx;
    min-width: 0;
  }

  &__bar-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__bar-name {
    font-size: 26rpx;
    font-weight: 600;
    color: $color-text;
    max-width: 220rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pill {
    padding: 2rpx 16rpx;
    border-radius: 16rpx;
    color: #fff;
    font-size: 20rpx;
    line-height: 32rpx;

    &--blue {
      background: #5b8fb9;
    }

    &--red {
      background: #e85d4a;
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

  &__bar-status {
    font-size: 20rpx;
    color: $color-text-secondary;
    margin-top: 6rpx;

    &--mine {
      color: #c08a1e;
      font-weight: 600;
    }
  }

  &__invite {
    margin-left: auto;
    height: 64rpx;
    line-height: 64rpx;
    padding: 0 32rpx;
    border-radius: $radius-md;
    background: #f4b942;
    color: #6b4a12;
    font-size: $font-caption;
    font-weight: 600;
    border: none;

    &::after {
      border: none;
    }
  }

  &__tray {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;

    &-label {
      font-size: 18rpx;
      color: #b9a98f;
      margin-bottom: 6rpx;
    }

    &-chips {
      display: flex;
      gap: 8rpx;
    }

    &-chip {
      width: 44rpx;
      height: 44rpx;
      border-radius: 50%;
      background: #efe6d8;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #b9a98f;
      font-size: 22rpx;
    }

    &-empty {
      font-size: 20rpx;
      color: #b9a98f;
    }
  }

  /* ── 棋盘卡 ── */
  &__board-card {
    position: relative;
    margin: 0 auto;
    padding: 28rpx;
    background: #fff;
    border: 2rpx solid #f0e4d7;
    border-radius: 32rpx;
    box-sizing: border-box;
    box-shadow: $shadow-card;
  }

  &__board {
    display: block;
  }

  &__board-hit {
    position: absolute;
    inset: 0;
  }

  /* ── 操作区 ── */
  &__actions {
    display: flex;
    justify-content: center;
    gap: 48rpx;
    margin-top: 16rpx;
  }

  &__action {
    position: relative;
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: #f7eddf;
    display: flex;
    align-items: center;
    justify-content: center;

    &-icon {
      font-size: 40rpx;
      line-height: 1;
    }

    &-unread {
      position: absolute;
      top: -6rpx;
      right: -6rpx;
      min-width: 32rpx;
      box-sizing: border-box;
      background: #e85d4a;
      color: #fff;
      font-size: 18rpx;
      border-radius: 999rpx;
      padding: 0 8rpx;
      line-height: 30rpx;
      text-align: center;
    }
  }

  &__hint {
    display: block;
    text-align: center;
    font-size: 22rpx;
    color: $color-text-secondary;
    margin-top: 16rpx;
  }
}

/* ── 猜拳定选边 ── */
.jungle__rps-mask {
  position: fixed;
  inset: 0;
  background: rgba(62, 50, 38, 0.72);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
}
.jungle__rps {
  width: 82%;
  max-width: 620rpx;
  background: #fff;
  border-radius: 40rpx;
  border: 4rpx solid #4a3f35;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}
.jungle__rps-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  width: 100%;
}
.jungle__rps-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #4a3f35;
}
.jungle__rps-sub {
  font-size: 22rpx;
  color: #7d6f60;
}
.jungle__rps-sides {
  display: flex;
  align-items: center;
  gap: 28rpx;
}
.jungle__rps-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  min-width: 160rpx;
  padding: 14rpx 10rpx;
  border-radius: 16rpx;
  border: 3rpx solid transparent;
}
.jungle__rps-side--win {
  border-color: #f4b942;
  background: rgba(244, 185, 66, 0.15);
  animation: jungle-rps-pulse 1s ease-in-out infinite;
}
@keyframes jungle-rps-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}
.jungle__rps-chip {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 36rpx;
  font-weight: 700;
}
.jungle__rps-chip--red {
  background: #e85d4a;
  border: 4rpx solid #b8402e;
}
.jungle__rps-chip--blue {
  background: #5b8fb9;
  border: 4rpx solid #3d6e96;
}
.jungle__rps-name {
  font-size: 24rpx;
  color: #4a3f35;
  max-width: 180rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jungle__rps-status {
  font-size: 20rpx;
  color: #7d6f60;
}
.jungle__rps-pick {
  font-size: 26rpx;
  font-weight: 800;
  color: #4a3f35;
}
.jungle__rps-vs {
  font-size: 34rpx;
  font-weight: 900;
  color: #e85d4a;
}
.jungle__rps-btns {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
  justify-content: center;
}
.jungle__rps-btn {
  min-width: 140rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 28rpx;
  font-weight: 700;
  background: #4a3f35;
  color: #fff;
  border-radius: 16rpx;
  border: none;
  padding: 0 24rpx;
}
.jungle__rps-btn--red {
  min-width: 240rpx;
  background: #e85d4a;
}
.jungle__rps-btn--blue {
  min-width: 240rpx;
  background: #5b8fb9;
}
.jungle__rps-btn[disabled] {
  opacity: 0.45;
}
.jungle__rps-wait {
  font-size: 24rpx;
  color: #7d6f60;
}

/* ── 结算遮罩 ── */
.jungle__scrim {
  position: fixed;
  inset: 0;
  background: rgba(62, 50, 38, 0.72);
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
}
.jungle__result-card {
  width: 598rpx;
  background: #fff;
  border-radius: 40rpx;
  padding: 48rpx 44rpx 44rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26rpx;
}
.jungle__result-deco {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.jungle__deco-line {
  width: 72rpx;
  height: 5rpx;
  border-radius: 4rpx;
  background: rgba(244, 185, 66, 0.5);
}
.jungle__deco-leaf {
  font-size: 30rpx;
}
.jungle__result-title {
  font-size: 44rpx;
  font-weight: 700;
  color: #4a3f35;
}
.jungle__result-sub {
  font-size: 24rpx;
  color: #7d6f60;
  text-align: center;
}
.jungle__result-stats {
  width: 100%;
  background: #f7eddf;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  box-sizing: border-box;
}
.jungle__stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.jungle__stat-label {
  font-size: 24rpx;
  color: #7d6f60;
}
.jungle__stat-values {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.jungle__stat-num {
  font-size: 32rpx;
  font-weight: 700;

  &--red {
    color: #e85d4a;
  }

  &--blue {
    color: #5b8fb9;
  }
}
.jungle__stat-colon {
  font-size: 28rpx;
  color: #7d6f60;
}
.jungle__result-badge {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(244, 185, 66, 0.15);
  color: #c08a1e;
  font-size: 22rpx;
  font-weight: 600;
}
.jungle__result-rematch {
  width: 510rpx;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 28rpx;
  background: #f4b942;
  color: #6b4a12;
  font-size: 30rpx;
  font-weight: 600;
  border: none;

  &::after {
    border: none;
  }
}
.jungle__result-leave {
  width: 510rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 28rpx;
  background: #f7eddf;
  color: #4a3f35;
  font-size: 28rpx;
  border: none;

  &::after {
    border: none;
  }
}

/* ── 规则抽屉 ── */
.jungle__rules-scrim {
  position: fixed;
  inset: 0;
  background: rgba(62, 50, 38, 0.72);
  z-index: 96;
}
.jungle__drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 82vh;
  background: #fff8f0;
  border-radius: 40rpx 40rpx 0 0;
  padding: 32rpx 44rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  box-sizing: border-box;
}
.jungle__drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.jungle__drawer-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #4a3f35;
}
.jungle__drawer-close {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #f7eddf;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7d6f60;
  font-size: 26rpx;
}
.jungle__drawer-scroll {
  flex: 1;
  min-height: 0;
}
.jungle__rule {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 24rpx;
}
.jungle__rule-label {
  align-self: flex-start;
  background: #4a3f35;
  border-radius: 12rpx;
  padding: 6rpx 20rpx;
  color: #fff;
  font-size: 24rpx;
  font-weight: 700;
}
.jungle__rule-text {
  font-size: 26rpx;
  color: #4a3f35;
  line-height: 1.6;
}
.jungle__rank-chain {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-wrap: wrap;
}
.jungle__rank-chip {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: #fff;
  border: 2rpx solid #e8d9c4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a3f35;
  font-size: 24rpx;
  font-weight: 700;
}
.jungle__rank-gt {
  font-size: 20rpx;
  font-weight: 700;
  color: #7d6f60;
}
.jungle__rule-note {
  align-self: flex-start;
  background: #f9e0da;
  border-radius: 999rpx;
  padding: 8rpx 20rpx;
  color: #b8402e;
  font-size: 22rpx;
  font-weight: 600;
}
.jungle__mini {
  display: flex;
}
.jungle__mini-cell {
  width: 56rpx;
  height: 56rpx;
  border: 2rpx solid #e8d9c4;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &--land {
    background: #f7eedf;
  }

  &--water {
    background: #c9e7f0;
  }

  &--trap {
    background: #f7dfd3;
  }

  &--den {
    background: #4a3f35;
  }

  &--jump {
    background: #c9e7f0;
    box-shadow: inset 0 0 0 4rpx rgba(244, 185, 66, 0.35);
  }
}
.jungle__mini-chip {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;

  &--red {
    background: #e85d4a;
  }

  &--blue {
    background: #5b8fb9;
  }
}
.jungle__mini-arrow {
  color: #c08a1e;
  font-size: 28rpx;
  font-weight: 700;
}
.jungle__mini-mark {
  color: #c05b4a;
  font-size: 20rpx;
  font-weight: 600;

  &--den {
    color: #fff8f0;
  }
}
.jungle__rule-tail {
  display: block;
  text-align: center;
  font-size: 22rpx;
  color: #7d6f60;
  padding-bottom: 16rpx;
}

/* ── 聊天气泡（双方栏锚定） ── */
.jungle__bar {
  position: relative;
}
.jungle__bubble {
  position: absolute;
  left: 96rpx;
  top: calc(100% + 8rpx);
  max-width: 360rpx;
  padding: 10rpx 20rpx;
  background: #fff;
  border: 2rpx solid rgba(74, 63, 53, 0.15);
  border-radius: 18rpx;
  box-shadow: 0 4rpx 12rpx rgba(74, 63, 53, 0.18);
  font-size: 24rpx;
  color: #4a3f35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 12;
  animation: jungle-bubble-pop 0.18s ease-out;
}
.jungle__bar--me .jungle__bubble {
  top: auto;
  bottom: calc(100% + 8rpx);
}
.jungle__bubble--emoji {
  font-size: 40rpx;
  padding: 6rpx 18rpx;
}
@keyframes jungle-bubble-pop {
  from {
    opacity: 0;
    transform: translateY(8rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
