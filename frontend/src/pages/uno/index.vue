<template>
  <view class="uno">
    <!-- 大厅 -->
    <view v-if="!state" class="lobby">
      <image class="lobby__logo" src="/static/icons/uno-1.png" mode="aspectFit" />
      <view class="lobby__title">枫趣牌局</view>
      <view class="lobby__subtitle">2-10 人联机 · 轻松开局 · 枫叶小精灵陪你玩</view>
      <button class="lobby__create" :disabled="acting" @tap="onCreate">创建房间</button>
      <view class="lobby__join">
        <input v-model="joinCode" class="lobby__input" type="number" maxlength="4" placeholder="输入 4 位房间码" />
        <button class="lobby__join-btn" :disabled="acting" @tap="onJoin">加入</button>
      </view>
    </view>

    <!-- 房间 -->
    <view v-else class="room">
      <view class="room__header">
        <text class="room__code" @tap="copyCode">房号 {{ state.code }} ⧉</text>
        <view class="room__header-actions">
          <text class="room__sound" @tap="toggleSound">{{ soundOn ? '🔊' : '🔇' }}</text>
          <button open-type="share" class="room__share">邀请</button>
          <text class="room__leave" @tap="onLeave">离开</text>
        </view>
      </view>

      <!-- 资料提示：没设置过头像昵称时引导完善 -->
      <view v-if="showProfileBanner" class="profile-banner" @tap="openProfileEditor">
        <text>🍁 你还没有头像昵称，点我设置，让牌友认出你</text>
        <text class="profile-banner__go">去设置 ›</text>
      </view>

      <!-- 等待开局 -->
      <view v-if="state.status === 'waiting'" class="waiting">
        <view class="waiting__players">
          <view v-for="p in state.players" :key="p.userId" class="waiting__player">
            <image v-if="p.avatarUrl" :src="avatarOf(p.avatarUrl)" class="waiting__avatar" />
            <view v-else class="waiting__avatar waiting__avatar--placeholder">🍁</view>
            <text class="waiting__name">{{ p.nickname }}</text>
            <text v-if="p.seat === state.ownerSeat" class="waiting__owner">房主</text>
            <view class="waiting__dot" :class="{ 'waiting__dot--off': !p.online }" />
          </view>
        </view>
        <button v-if="isOwner" class="waiting__start" :disabled="acting || state.players.length < 2" @tap="start">
          开始游戏（{{ state.players.length }}/10）
        </button>
        <view v-else class="waiting__hint">等待房主开局…（{{ state.players.length }}/10）</view>
      </view>

      <!-- 牌桌 -->
      <template v-else>
        <!-- 抽牌比大小定庄家（首局） -->
        <view v-if="state.phase === 'dealerDraw'" class="dealer">
          <view class="dealer__title">🎲 抽牌比大小定庄家</view>
          <view class="dealer__sub">数字最大的玩家成为庄家先出牌 · {{ turnCountdown }}s 后未抽的将自动代抽</view>
          <view class="dealer__players">
            <view v-for="p in state.players" :key="p.userId" class="dealer__player">
              <image v-if="p.avatarUrl" :src="avatarOf(p.avatarUrl)" class="dealer__avatar" />
              <view v-else class="dealer__avatar dealer__avatar--placeholder">🍁</view>
              <text class="dealer__name">{{ p.nickname }}</text>
              <image
                v-if="dealerDrawOf(p.seat) && images[dealerDrawOf(p.seat)!]"
                :src="images[dealerDrawOf(p.seat)!]"
                class="dealer__card"
                mode="aspectFit"
              />
              <view v-else class="dealer__card dealer__card--pending">?</view>
            </view>
          </view>
          <button v-if="isSeated && !myDealerDrawn" class="dealer__draw" :disabled="acting" @tap="drawDealer">🍁 抽一张</button>
          <view v-else-if="isSeated" class="dealer__waiting">已抽，等其他玩家…</view>
        </view>

        <template v-else>
        <!-- 对手排 -->
        <view class="opponents">
          <view
            v-for="p in opponents"
            :key="p.userId"
            class="opp"
            :class="{ 'opp--current': p.seat === state.currentSeat, 'opp--left': p.left }"
          >
            <view class="opp__avatar-wrap">
              <image v-if="p.avatarUrl" :src="avatarOf(p.avatarUrl)" class="opp__avatar" />
              <view v-else class="opp__avatar opp__avatar--placeholder">🍁</view>
              <view class="opp__dot" :class="{ 'opp__dot--off': !p.online }" />
              <view v-if="p.seat === state.currentSeat && state.status === 'playing'" class="opp__timer">{{ turnCountdown }}</view>
            </view>
            <text class="opp__name">{{ p.nickname }}</text>
            <view class="opp__cards">
              <image v-if="images[BACK_KEY]" :src="images[BACK_KEY]" class="opp__back" />
              <text class="opp__count">×{{ p.handCount }}</text>
            </view>
            <view v-if="p.left" class="opp__tag">已离开</view>
            <view v-else-if="p.idle" class="opp__tag">挂机中</view>
            <view v-else-if="p.unoDeclared" class="opp__tag opp__tag--uno">UNO!</view>
          </view>
        </view>

        <!-- 桌面中央（+ 动作播报条） -->
        <view class="table-zone">
          <view class="table">
            <view class="table__pile" @tap="onDeckTap">
              <image v-if="images[BACK_KEY]" :src="images[BACK_KEY]" class="table__card" />
              <text class="table__pile-count">{{ state.deckCount }}</text>
              <text v-if="isMyTurn && !state.drawnCard && !state.challenge?.mine" class="table__pile-hint">{{ state.drawStack ? `摸 ${state.drawStack.count} 张` : '点我摸牌' }}</text>
            </view>
            <view class="table__info">
              <view class="table__color" :style="{ background: colorMeta.color }">{{ colorMeta.season }}</view>
              <view class="table__direction">{{ state.direction === 1 ? '↻ 顺时针' : '↺ 逆时针' }}</view>
            </view>
            <view class="table__top">
              <image v-if="state.topCard && images[state.topCard]" :src="images[state.topCard]" class="table__card" />
            </view>
          </view>
          <view class="event-banner" :class="{ 'event-banner--show': bannerVisible }">{{ bannerText }}</view>
        </view>

        <!-- 叠加加牌提示条 -->
        <view v-if="state.drawStack" class="stack-bar">
          <text class="stack-bar__text">
            🃏 加牌累计 {{ state.drawStack.count }} 张！{{ isMyTurn ? (state.drawStack.only4 ? '只能出 +4 继续叠，或点牌堆全摸' : '出 +2/+4 继续叠，或点牌堆全摸') : '等待应对…' }}
          </text>
        </view>

        <!-- +4 质疑条 -->
        <view v-if="state.challenge" class="challenge">
          <template v-if="state.challenge.mine">
            <text class="challenge__text">被 +4 了！质疑对方，或叠 +4 反击（{{ challengeCountdown }}s）</text>
            <button class="challenge__btn" :disabled="acting" @tap="challenge">质疑</button>
            <button class="challenge__btn challenge__btn--plain" :disabled="acting" @tap="decline">不质疑，摸 4 张</button>
          </template>
          <text v-else class="challenge__text">等待被 +4 的玩家决定是否质疑…（{{ challengeCountdown }}s）</text>
        </view>

        <!-- UNO 条 -->
        <view v-if="canSayUno || canCatchUno" class="uno-bar">
          <button v-if="canSayUno" class="uno-bar__say" :disabled="acting" @tap="sayUno">🍁 喊 UNO！</button>
          <button v-if="canCatchUno" class="uno-bar__catch" :disabled="acting" @tap="reportUno(unoSeat)">TA 没喊 UNO，举报！</button>
        </view>

        <!-- 我的手牌 -->
        <view class="hand">
          <view class="hand__status">
            <template v-if="state.status === 'playing'">
              <text v-if="state.colorPick && !state.colorPick.mine">等待 {{ colorPickPlayerName }} 选择开局颜色…</text>
              <text v-else-if="isMyTurn" class="hand__status--mine">
                {{ myTurnHint }}（{{ turnCountdown }}s）
              </text>
              <text v-else>等待 {{ currentPlayerName }} 出牌…</text>
            </template>
          </view>
          <scroll-view scroll-x class="hand__scroll" :show-scrollbar="false" enhanced>
            <view class="hand__cards">
              <view
                v-for="(card, i) in state.myHand ?? []"
                :key="i"
                class="hand__card"
                :class="{
                  'hand__card--selected': selectedIndex === i,
                  'hand__card--dim': isMyTurn && !canIPlay(card),
                }"
                :style="{ marginLeft: i === 0 ? '0' : '-' + cardOverlap + 'rpx' }"
                @tap="onCardTap(i)"
              >
                <image v-if="images[card]" :src="images[card]" class="hand__img" mode="aspectFit" />
                <text v-if="card === state.drawnCard" class="hand__new">新</text>
              </view>
            </view>
          </scroll-view>
          <view v-if="isMyTurn" class="hand__actions">
            <template v-if="selectedCard">
              <button v-if="myHandCount === 2" class="hand__btn hand__btn--uno" :disabled="acting" @tap="onPlay(true)">
                喊 UNO 并出牌
              </button>
              <button class="hand__btn" :disabled="acting" @tap="onPlay(false)">
                {{ myHandCount === 2 ? '直接出牌（不喊）' : '出牌' }}
              </button>
            </template>
            <button v-if="state.drawnCard && !selectedCard" class="hand__btn hand__btn--plain" :disabled="acting" @tap="pass">
              不出，跳过本轮
            </button>
          </view>
        </view>

        <!-- 结算面板 -->
        <view v-if="state.status === 'finished'" class="result-mask">
          <view class="result">
            <view class="result__title">🎉 {{ winnerName }} 获胜！</view>
            <view class="result__reason">{{ winReasonText }}</view>
            <view class="result__scores">
              <view v-for="p in state.players" :key="p.userId" class="result__row">
                <text class="result__name">{{ p.nickname }}</text>
                <text class="result__score">
                  本局 +{{ state.roundScores?.[p.userId] ?? 0 }} · 总分 {{ state.scores[p.userId] ?? 0 }}
                </text>
              </view>
            </view>
            <button class="result__btn" :disabled="acting" @tap="requestRematch">再来一局</button>
            <button class="result__btn result__btn--plain" @tap="onLeave">离开房间</button>
          </view>
        </view>
        </template>
      </template>
    </view>

    <!-- 资料设置弹层（微信头像选择 + 昵称输入） -->
    <view v-if="profileEditorVisible" class="color-mask" @tap="profileEditorVisible = false">
      <view class="color-panel" @tap.stop>
        <view class="color-panel__title">设置昵称和头像</view>
        <view class="profile">
          <button class="profile__avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
            <image v-if="profileAvatar" :src="profileAvatar" class="profile__avatar" mode="aspectFill" />
            <text v-else class="profile__avatar-hint">🍁<br/>选头像</text>
          </button>
          <input v-model="profileNickname" class="profile__nickname" type="nickname" placeholder="输入昵称" maxlength="20" />
          <button class="profile__save" :disabled="savingProfile" @tap="saveMyProfile">保存</button>
        </view>
      </view>
    </view>

    <!-- 选色弹层：出百搭牌选色 / 开局首张变色牌选色；面板上移以便看清手牌 -->
    <view v-if="colorPickerVisible" class="color-mask" @tap="onMaskTap">
      <view class="color-panel" @tap.stop>
        <view class="color-panel__title">{{ colorPickMode === 'start' ? '你翻开了变色牌，选择开局季节' : '为它选择一个季节' }}</view>
        <view v-if="colorPickMode === 'wild' && pendingWildCard && images[pendingWildCard]" class="color-panel__preview">
          <image :src="images[pendingWildCard]" class="color-panel__card" mode="aspectFit" />
        </view>
        <view class="color-panel__row">
          <view
            v-for="c in UNO_COLORS"
            :key="c"
            class="color-panel__item"
            :style="{ background: COLOR_META[c].color }"
            @tap="onPickColor(c)"
          >
            <text class="color-panel__season">{{ COLOR_META[c].season }}</text>
            <text class="color-panel__cname">{{ COLOR_META[c].name }}</text>
          </view>
        </view>
        <button v-if="colorPickMode === 'wild'" class="color-panel__cancel" @tap="cancelColorPick">先不出这张</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useUnoRoom } from '@/composables/useUnoRoom'
import { useUnoCards } from '@/composables/useUnoCards'
import { resolveAvatarUrl, saveUserProfile, uploadAvatar } from '@/services/toolbox'
import { BACK_KEY } from '@/utils/unoCards'
import { COLOR_META, UNO_COLORS, cardLabel, isWild } from '@/utils/uno'
import { playUnoSound, setUnoSoundEnabled, unoSoundEnabled } from '@/utils/unoSound'
import type { UnoColor } from '@/types/uno'

const {
  state,
  acting,
  isSeated,
  isOwner,
  isMyTurn,
  myPlayer,
  opponents,
  myHandCount,
  turnCountdown,
  challengeCountdown,
  unoWindowCountdown,
  canIPlay,
  createAndEnter,
  joinByCode,
  start,
  drawDealer,
  play,
  draw,
  pass,
  challenge,
  decline,
  chooseStartColor,
  sayUno,
  reportUno,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useUnoRoom()

const { images, ensure, preload } = useUnoCards()

const joinCode = ref('')
const selectedIndex = ref(-1)
const colorPickerVisible = ref(false)
const colorPickMode = ref<'wild' | 'start'>('wild')
const pendingWildCard = ref('')
const soundOn = ref(unoSoundEnabled())
let pendingWild: { card: string; declaredUno: boolean } | null = null

function toggleSound() {
  soundOn.value = !soundOn.value
  setUnoSoundEnabled(soundOn.value)
  uni.showToast({ title: soundOn.value ? '音效已开启' : '音效已关闭', icon: 'none' })
}

/** 头像相对路径（/uploads/avatar/…）补全为后端绝对地址 */
function avatarOf(url: string): string {
  return url ? resolveAvatarUrl(url) : ''
}

// ---------- 房间内完善资料（微信头像昵称授权） ----------

const profileEditorVisible = ref(false)
const profileNickname = ref('')
const profileAvatar = ref('')
const savingProfile = ref(false)

/** 已入座但还没设置过头像昵称时，显示引导横幅 */
const showProfileBanner = computed(() => {
  const me = myPlayer.value
  return Boolean(me && (!me.avatarUrl || !me.nickname || me.nickname === '牌友'))
})

function openProfileEditor() {
  profileNickname.value = myPlayer.value?.nickname === '牌友' ? '' : (myPlayer.value?.nickname ?? '')
  profileAvatar.value = myPlayer.value?.avatarUrl ? avatarOf(myPlayer.value.avatarUrl) : ''
  profileEditorVisible.value = true
}

function onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  const url = String(event.detail?.avatarUrl || '')
  if (url) profileAvatar.value = url
}

async function saveMyProfile() {
  if (savingProfile.value) return
  const nickname = profileNickname.value.trim()
  if (!nickname) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }
  savingProfile.value = true
  try {
    let avatarUrl = profileAvatar.value
    if (avatarUrl.startsWith('wxfile://') || avatarUrl.startsWith('http://tmp/')) {
      avatarUrl = await uploadAvatar(avatarUrl)
    } else if (myPlayer.value?.avatarUrl && avatarUrl === avatarOf(myPlayer.value.avatarUrl)) {
      avatarUrl = myPlayer.value.avatarUrl // 已存在后端的头像，回传相对路径即可
    }
    await saveUserProfile({ nickname, avatarUrl })
    profileEditorVisible.value = false
    uni.showToast({ title: '资料已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '资料保存失败', icon: 'none' })
  } finally {
    savingProfile.value = false
  }
}

// ---------- 动作播报条（对手出了什么牌、变了什么色，全员可见） ----------

const bannerText = ref('')
const bannerVisible = ref(false)
let bannerTimer: ReturnType<typeof setTimeout> | null = null

function seatName(seat: unknown): string {
  if (typeof seat !== 'number' || !state.value) return ''
  return state.value.players.find((p) => p.seat === seat)?.nickname ?? ''
}

function seasonName(color: unknown): string {
  const c = String(color ?? '')
  return c === 'r' || c === 'g' || c === 'b' || c === 'y' ? `「${COLOR_META[c].season}」` : ''
}

function eventText(ev: { type: string; card?: string; [key: string]: unknown }): string {
  const name = seatName(ev.seat)
  const label = ev.card ? cardLabel(String(ev.card)) : ''
  switch (ev.type) {
    case 'play':
      return `${name} 出了 ${label}${ev.unoDeclared ? '，并喊了 UNO！' : ''}`
    case 'skip':
      return `${name} 出了跳过牌，${seatName(ev.skippedSeat)} 被跳过`
    case 'reverse':
      return `${name} 出了反转牌，方向掉转`
    case 'draw2':
      return ev.stackCount && Number(ev.stackCount) > 2
        ? `${name} 叠加 +2，累计要摸 ${ev.stackCount} 张！`
        : `${name} 出了 +2，${seatName(ev.toSeat)} 可叠加或摸 2 张`
    case 'wild':
      return `${name} 出了变色牌，指定${seasonName(ev.color)}季`
    case 'wild4':
      return ev.stacked
        ? `${name} 叠加 +4，累计要摸 ${ev.stackCount} 张！`
        : `${name} 出了王牌 +4 并指定${seasonName(ev.color)}季，${seatName(ev.toSeat)} 可质疑`
    case 'stack_draw':
      return `${name} 摸了 ${ev.count} 张加牌并跳过`
    case 'wild4_draw':
      return `${seatName(ev.toSeat)} 摸 4 张并跳过`
    case 'challenge_guilty':
      return `质疑成功！${seatName(ev.fromSeat)} 的 +4 违规，改摸 4 张`
    case 'challenge_innocent':
      return `质疑失败，${name} 摸 6 张`
    case 'draw':
      return `${name} 摸了 1 张牌`
    case 'draw_pass':
      return `${name} 摸牌后仍无牌可出，跳过`
    case 'timeout':
      return `${name} 超时，自动摸牌跳过`
    case 'pass':
      return `${name} 选择不出`
    case 'uno':
      return `${name} 喊了 UNO！`
    case 'catch':
      return `${seatName(ev.bySeat)} 举报 ${name} 没喊 UNO，罚摸 2 张`
    case 'color_pick':
      return ev.auto ? `${name} 超时，随机${seasonName(ev.color)}季开局` : `${name} 选择${seasonName(ev.color)}季开局`
    case 'win':
      return `${name} 出完所有手牌！`
    case 'leave':
      return `${name} 离开了牌局`
    case 'win_last_man':
      return `其他玩家都已离开或离线，${name} 获胜！`
    case 'dealer_draw':
      return `${name} 抽到了 ${label}`
    case 'dealer':
      return ev.byWinner
        ? `上局赢家 ${name} 作为庄家先出牌`
        : `🎲 ${name} 抽的牌最大，成为庄家先出牌！`
    default:
      return ''
  }
}

function showBanner(text: string) {
  if (!text) return
  bannerText.value = text
  bannerVisible.value = true
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => {
    bannerVisible.value = false
  }, 2600)
}

// 桌面事件 → 提示音 + 播报条（所有在线玩家都会收到，WS 推送驱动）
watch(
  () => state.value?.version,
  () => {
    const ev = state.value?.lastEvent
    if (!ev?.type) return
    const type = ev.type
    if (type === 'win' || type === 'win_last_man') playUnoSound('win')
    else if (type === 'uno' || type === 'catch' || type === 'dealer') playUnoSound('uno')
    else if (type === 'play' && ev.unoDeclared) playUnoSound('uno') // 喊 UNO 并出牌
    else if (['draw', 'draw_pass', 'stack_draw', 'timeout', 'wild4_draw', 'challenge_guilty', 'challenge_innocent'].includes(type)) playUnoSound('draw')
    else if (['play', 'skip', 'reverse', 'draw2', 'wild', 'wild4', 'color_pick', 'dealer_draw'].includes(type)) playUnoSound('play')
    showBanner(eventText(ev))
  },
)

const selectedCard = computed(() => {
  const hand = state.value?.myHand
  if (!hand || selectedIndex.value < 0 || selectedIndex.value >= hand.length) return null
  return hand[selectedIndex.value]
})

const colorMeta = computed(() => {
  const color = state.value?.currentColor
  if (color === 'r' || color === 'g' || color === 'b' || color === 'y') return COLOR_META[color]
  return { season: '—', color: '#8a8a8a', name: '', deep: '#666666' }
})

const currentPlayerName = computed(() => {
  const current = state.value
  if (!current || current.currentSeat === null) return ''
  return current.players.find((p) => p.seat === current.currentSeat)?.nickname ?? ''
})

const winnerName = computed(() => {
  const current = state.value
  if (!current || current.winnerUserId === null) return ''
  return current.players.find((p) => p.userId === current.winnerUserId)?.nickname ?? ''
})

const winReasonText = computed(() => {
  const reason = state.value?.winReason
  if (reason === 'forfeit') return '对手逃跑，判你获胜'
  if (reason === 'last_man') return '其他玩家都已离开或离线，你是最后的玩家'
  return '出完了所有手牌'
})

/** 我可喊 UNO：处于被举报窗口（补喊），或手牌只剩 1 张且还没喊过。 */
const canSayUno = computed(() => {
  const current = state.value
  if (!current || current.status !== 'playing' || !isSeated.value) return false
  if (current.uno?.mine) return true
  return myHandCount.value === 1 && !current.players.find((p) => p.seat === current.mySeat)?.unoDeclared
})

/** 我可举报：有人没喊 UNO，3s 自喊宽限已过，且不是我自己。 */
const canCatchUno = computed(() => {
  const current = state.value
  if (!current || current.status !== 'playing' || !isSeated.value || !current.uno) return false
  return !current.uno.mine && unoWindowCountdown.value === 0
})

/** 手牌动态重叠：牌少全展开，牌多逐张叠（每张至少露出 48rpx 数字角），再多交给横向滚动。 */
const cardOverlap = computed(() => {
  const n = myHandCount.value
  if (n <= 1) return 0
  const total = 140 * n
  const avail = 750 - 32 * 2 // 页面左右留白后可用宽度
  if (total <= avail) return 0
  return Math.min(Math.ceil((total - avail) / (n - 1)), 92)
})

const unoSeat = computed(() => state.value?.uno?.seat ?? -1)

/** 抽牌定庄家：某座位抽到的牌 */
function dealerDrawOf(seat: number): string | null {
  return state.value?.dealerDraws?.[String(seat)] ?? null
}

const myDealerDrawn = computed(() => {
  const current = state.value
  return Boolean(current && current.mySeat !== null && current.dealerDraws && current.dealerDraws[String(current.mySeat)] !== undefined)
})

/** 我的回合提示：按实际局面给出张数准确的指引 */
const myTurnHint = computed(() => {
  const current = state.value
  if (!current) return ''
  if (current.drawnCard) return '已摸牌：出任意能出的牌，或选择不出'
  const stack = current.drawStack
  if (stack) {
    return stack.only4
      ? `被叠了 +4，累计 ${stack.count} 张：只能出 +4 反击，或点牌堆全摸`
      : `被加牌累计 ${stack.count} 张：出 +2/+4 叠加，或点牌堆全摸`
  }
  if (current.challenge?.mine) return '被 +4 了：质疑、叠 +4 反击，或不质疑摸 4 张'
  return '轮到你了：出牌或摸一张'
})

const colorPickPlayerName = computed(() => {
  const current = state.value
  if (!current?.colorPick) return ''
  return current.players.find((p) => p.seat === current.colorPick?.seat)?.nickname ?? ''
})

// 牌面图片按需渲染：手牌/顶牌/牌背/抽牌定庄家的牌变化时补齐
watch(
  () => [state.value?.myHand, state.value?.topCard, state.value?.dealerDraws] as const,
  () => {
    const keys = [BACK_KEY]
    if (state.value?.topCard) keys.push(state.value.topCard)
    if (state.value?.myHand) keys.push(...state.value.myHand)
    if (state.value?.dealerDraws) keys.push(...Object.values(state.value.dealerDraws))
    ensure(keys)
  },
  { immediate: true, deep: true },
)

// 状态变化时收回已不在手上的选中
watch(selectedCard, (card) => {
  if (card === null) selectedIndex.value = -1
})

function onCardTap(index: number) {
  if (!isMyTurn.value) {
    uni.showToast({ title: '还没轮到你', icon: 'none' })
    return
  }
  const card = state.value?.myHand?.[index]
  if (!card) return
  // 已选中的牌任何时候都可以点按取消选中（哪怕摸牌后已不可出）
  if (selectedIndex.value === index) {
    selectedIndex.value = -1
    return
  }
  if (!canIPlay(card)) {
    const current = state.value
    const tip = current?.challenge?.mine
      ? '被 +4 了：只能叠 +4 反击'
      : current?.drawStack
        ? (current.drawStack.only4 ? '叠过 +4 后只能再叠 +4，或点牌堆全摸' : '只能出 +2/+4 叠加，或点牌堆全摸')
        : '这张牌出不了'
    uni.showToast({ title: tip, icon: 'none' })
    return
  }
  selectedIndex.value = index
}

function onPlay(declaredUno: boolean) {
  const card = selectedCard.value
  if (!card) return
  if (isWild(card)) {
    pendingWild = { card, declaredUno }
    pendingWildCard.value = card
    colorPickMode.value = 'wild'
    colorPickerVisible.value = true
    return
  }
  selectedIndex.value = -1
  void play(card, null, declaredUno)
}

function onPickColor(color: UnoColor) {
  if (colorPickMode.value === 'start') {
    colorPickerVisible.value = false
    void chooseStartColor(color)
    return
  }
  colorPickerVisible.value = false
  pendingWildCard.value = ''
  const pending = pendingWild
  pendingWild = null
  if (!pending) return
  selectedIndex.value = -1
  void play(pending.card, color, pending.declaredUno)
}

/** 开局选色必须选一个（官方规则），只有出牌选色可取消 */
function onMaskTap() {
  if (colorPickMode.value === 'wild') cancelColorPick()
}

function cancelColorPick() {
  colorPickerVisible.value = false
  pendingWildCard.value = ''
  pendingWild = null
}

// 首张翻出变色牌：我是首位玩家时自动弹出选色
watch(
  () => state.value?.colorPick,
  (colorPick) => {
    if (colorPick?.mine) {
      colorPickMode.value = 'start'
      colorPickerVisible.value = true
    } else if (colorPickMode.value === 'start' && !colorPick) {
      colorPickerVisible.value = false
    }
  },
)

function onDeckTap() {
  if (!isMyTurn.value || state.value?.drawnCard) return
  selectedIndex.value = -1 // 摸牌后只能出摸的那张，先清掉选中态防卡死
  void draw()
}

async function onCreate() {
  await createAndEnter()
}

async function onJoin() {
  await joinByCode(joinCode.value.trim())
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
  void preload()
  const code = typeof query?.room === 'string' ? query.room : ''
  if (/^[0-9]{4}$/.test(code)) {
    void joinByCode(code)
  }
})

onShow(() => {
  if (state.value) startSync()
})

onHide(() => {
  stopSync()
})

onUnload(() => {
  stopSync()
})

onShareAppMessage(() => ({
  title: state.value ? `来一局枫趣牌局！房间码 ${state.value.code}` : '来一局枫趣牌局！',
  path: state.value ? `/pages/uno/index?room=${state.value.code}` : '/pages/uno/index',
}))
</script>

<style lang="scss" scoped>
// 「枫趣牌局」品牌色板：奶油白底 + 墨绿桌布 + 枫叶红主色 + 金黄强调（60/25/10/5）
$felt: #21483D;
$cream: #FFF8ED;
$ink: #493E37;
$red: #E85D4A;
$gold: #F4B942;
$maple-light: #FBE4D5;

.uno {
  min-height: 100vh;
  box-sizing: border-box;
  background: linear-gradient(180deg, $cream 0%, #FDF1E0 100%);
  color: $ink;

  // 去掉小程序 button 默认的 ::after 描边；disabled 时微信会套默认灰色，需显式覆盖
  button::after { border: none; }
  button[disabled] { opacity: 1; }
}

// ---------- 大厅 ----------
.lobby {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 48rpx 0;

  &__logo { width: 220rpx; height: 220rpx; border-radius: 48rpx; box-shadow: 0 12rpx 32rpx rgba(73, 62, 55, 0.18); }
  &__title { font-size: 56rpx; font-weight: 700; margin-top: 28rpx; color: $felt; }
  &__subtitle { font-size: 26rpx; color: rgba(73, 62, 55, 0.6); margin-top: 12rpx; }
  &__create {
    margin-top: 80rpx;
    width: 480rpx;
    background: $red;
    color: #fff;
    font-weight: 700;
    border-radius: 48rpx;

    &[disabled] { background: rgba($red, 0.45); color: rgba(255, 255, 255, 0.9); }
  }
  &__join { display: flex; gap: 20rpx; margin-top: 40rpx; }
  &__input {
    width: 320rpx;
    height: 88rpx;
    background: $maple-light;
    border-radius: 16rpx;
    padding: 0 24rpx;
    color: $ink;
    font-size: 32rpx;
  }
  &__join-btn {
    height: 88rpx;
    line-height: 88rpx;
    background: $felt;
    color: $cream;
    font-weight: 700;
    border-radius: 16rpx;
    font-size: 30rpx;

    &[disabled] { background: rgba($felt, 0.45); color: rgba(255, 248, 237, 0.9); }
  }
}

// ---------- 房间公共 ----------
.room { padding: 24rpx; }

.room__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 8rpx 16rpx;

  &-actions { display: flex; align-items: center; gap: 16rpx; }
}
.room__code { font-size: 30rpx; font-weight: 600; color: $ink; }
.room__sound { font-size: 34rpx; padding: 8rpx; }
.room__share {
  font-size: 24rpx;
  background: $maple-light;
  color: $ink;
  border-radius: 28rpx;
  padding: 0 28rpx;
  height: 56rpx;
  line-height: 56rpx;
}
.room__leave { font-size: 26rpx; color: rgba(73, 62, 55, 0.55); padding: 8rpx; }

// ---------- 资料引导 ----------
.profile-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 8rpx 20rpx;
  padding: 18rpx 24rpx;
  border-radius: 20rpx;
  background: #FDF3D8;
  border: 2rpx dashed $gold;
  font-size: 26rpx;
  color: $ink;

  &__go { color: $red; font-weight: 600; }
}

.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 28rpx;
  gap: 24rpx;

  &__avatar-btn {
    width: 140rpx;
    height: 140rpx;
    border-radius: 50%;
    padding: 0;
    background: $maple-light;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  &__avatar { width: 140rpx; height: 140rpx; border-radius: 50%; }
  &__avatar-hint { font-size: 24rpx; color: rgba(73, 62, 55, 0.55); text-align: center; line-height: 1.4; }
  &__nickname {
    width: 100%;
    height: 88rpx;
    background: $maple-light;
    border-radius: 16rpx;
    padding: 0 24rpx;
    box-sizing: border-box;
    font-size: 30rpx;
    color: $ink;
  }
  &__save {
    width: 100%;
    background: $red;
    color: #fff;
    font-weight: 700;
    border-radius: 40rpx;
  }
}

// ---------- 等待开局 ----------
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60rpx;

  &__players {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 28rpx;
    max-width: 640rpx;
  }
  &__player { display: flex; flex-direction: column; align-items: center; min-width: 140rpx; position: relative; }
  &__avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: $maple-light;
    &--placeholder { display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
  }
  &__name { font-size: 26rpx; margin-top: 10rpx; max-width: 240rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  &__owner {
    margin-top: 4rpx;
    font-size: 18rpx;
    font-weight: 700;
    color: $ink;
    background: $gold;
    padding: 2rpx 14rpx;
    border-radius: 16rpx;
  }
  &__dot {
    position: absolute;
    top: 4rpx;
    right: 24rpx;
    width: 18rpx;
    height: 18rpx;
    border-radius: 50%;
    background: #83cc90;
    border: 3rpx solid $cream;
    &--off { background: #b8b0a8; }
  }
  &__start {
    margin-top: 70rpx;
    width: 480rpx;
    background: $red;
    color: #fff;
    font-weight: 700;
    border-radius: 48rpx;

    &[disabled] { background: rgba($red, 0.45); color: rgba(255, 255, 255, 0.9); }
  }
  &__hint { margin-top: 70rpx; font-size: 28rpx; color: rgba(73, 62, 55, 0.6); }
}

// ---------- 抽牌定庄家 ----------
.dealer {
  margin: 24rpx 12rpx;
  padding: 40rpx 28rpx;
  background: $felt;
  border-radius: 36rpx;
  box-shadow: 0 12rpx 32rpx rgba(33, 72, 61, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;

  &__title { font-size: 38rpx; font-weight: 700; color: $cream; }
  &__sub { font-size: 24rpx; color: rgba(255, 248, 237, 0.75); margin-top: 12rpx; text-align: center; }
  &__players {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 28rpx;
    margin-top: 36rpx;
  }
  &__player { display: flex; flex-direction: column; align-items: center; min-width: 120rpx; }
  &__avatar {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: rgba(255, 248, 237, 0.2);
    &--placeholder { display: flex; align-items: center; justify-content: center; font-size: 32rpx; }
  }
  &__name { font-size: 22rpx; color: $cream; margin-top: 8rpx; max-width: 160rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  &__card {
    width: 96rpx;
    height: 144rpx;
    border-radius: 12rpx;
    margin-top: 12rpx;

    &--pending {
      background: rgba(255, 248, 237, 0.15);
      border: 2rpx dashed rgba(255, 248, 237, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 248, 237, 0.5);
      font-size: 40rpx;
    }
  }
  &__draw {
    margin-top: 40rpx;
    width: 360rpx;
    background: $gold;
    color: $ink;
    font-weight: 700;
    border-radius: 44rpx;
  }
  &__waiting { margin-top: 40rpx; font-size: 26rpx; color: rgba(255, 248, 237, 0.75); }
}

// ---------- 对手 ----------
.opponents {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16rpx;
  min-height: 170rpx;
}

.opp {
  min-width: 150rpx;
  padding: 12rpx 16rpx;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(73, 62, 55, 0.08);
  position: relative;

  &--current { background: #FDF3D8; box-shadow: 0 0 0 3rpx $gold; }
  &--left { opacity: 0.45; }

  &__avatar-wrap { position: relative; }
  &__avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    background: $maple-light;
    &--placeholder { display: flex; align-items: center; justify-content: center; font-size: 36rpx; }
  }
  &__dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    background: #83cc90;
    border: 3rpx solid #ffffff;
    &--off { background: #b8b0a8; }
  }
  &__timer {
    position: absolute;
    top: -14rpx;
    left: -14rpx;
    min-width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background: $red;
    color: #fff;
    font-size: 22rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }
  &__name { font-size: 24rpx; margin-top: 8rpx; max-width: 220rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  &__cards { display: flex; align-items: center; margin-top: 6rpx; }
  &__back { width: 30rpx; height: 45rpx; border-radius: 6rpx; }
  &__count { font-size: 24rpx; margin-left: 8rpx; font-weight: 600; }
  &__tag {
    margin-top: 6rpx;
    font-size: 20rpx;
    padding: 2rpx 14rpx;
    border-radius: 20rpx;
    background: $maple-light;
    color: $ink;

    &--uno { background: $red; color: #fff; font-weight: 700; }
  }
}

// ---------- 桌面中央（墨绿桌布） ----------
.table-zone {
  position: relative;
}

.event-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  max-width: 84%;
  padding: 16rpx 36rpx;
  border-radius: 44rpx;
  background: rgba(33, 72, 61, 0.94);
  color: #FFF8ED;
  font-size: 28rpx;
  font-weight: 600;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 6;

  &--show {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.table {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 48rpx;
  margin: 28rpx 12rpx 8rpx;
  padding: 36rpx 24rpx;
  min-height: 260rpx;
  background: $felt;
  border-radius: 36rpx;
  box-shadow: 0 12rpx 32rpx rgba(33, 72, 61, 0.3);

  &__card { width: 150rpx; height: 225rpx; border-radius: 18rpx; box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.35); }
  &__pile { position: relative; display: flex; flex-direction: column; align-items: center; }
  &__pile-count {
    position: absolute;
    bottom: 52rpx;
    right: -12rpx;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 20rpx;
    padding: 2rpx 14rpx;
    border-radius: 20rpx;
  }
  &__pile-hint { margin-top: 10rpx; font-size: 22rpx; color: $gold; }
  &__info { display: flex; flex-direction: column; align-items: center; gap: 16rpx; }
  &__color {
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36rpx;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.35);
    box-shadow: 0 0 0 6rpx rgba(255, 255, 255, 0.25);
  }
  &__direction { font-size: 22rpx; color: rgba(255, 248, 237, 0.8); }
}

// ---------- 质疑 / UNO 条 / 叠加条 ----------
.challenge,
.uno-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 20rpx;
  margin: 12rpx 24rpx;
  padding: 16rpx 24rpx;
  border-radius: 20rpx;
  background: $maple-light;

  &__text { font-size: 26rpx; }
  &__btn {
    font-size: 26rpx;
    background: $red;
    color: #fff;
    border-radius: 32rpx;
    padding: 0 36rpx;
    height: 64rpx;
    line-height: 64rpx;

    &--plain { background: rgba(73, 62, 55, 0.12); color: $ink; }
  }
}

.stack-bar {
  display: flex;
  justify-content: center;
  margin: 12rpx 24rpx;
  padding: 16rpx 24rpx;
  border-radius: 20rpx;
  background: rgba(232, 93, 74, 0.14);
  border: 2rpx dashed $red;

  &__text { font-size: 26rpx; font-weight: 600; color: $red; }
}

.uno-bar {
  background: #FDF3D8;

  &__say,
  &__catch {
    font-size: 28rpx;
    font-weight: 700;
    border-radius: 36rpx;
    padding: 0 40rpx;
    height: 72rpx;
    line-height: 72rpx;
  }
  &__say { background: $gold; color: $ink; }
  &__catch { background: $red; color: #fff; }
}

// ---------- 手牌 ----------
.hand {
  margin-top: 12rpx;

  &__status { text-align: center; font-size: 26rpx; color: rgba(73, 62, 55, 0.7); min-height: 40rpx;
    &--mine { color: $red; font-weight: 600; }
  }
  &__scroll { margin-top: 8rpx; white-space: nowrap; }
  &__cards { display: inline-flex; align-items: flex-end; padding: 20rpx 48rpx 8rpx 24rpx; min-height: 240rpx; box-sizing: content-box; }
  &__card {
    width: 140rpx;
    height: 210rpx;
    flex-shrink: 0;
    border-radius: 16rpx;
    position: relative;
    transition: transform 0.15s ease;
    &--selected { transform: translateY(-28rpx); }
    &--dim { opacity: 0.78; filter: grayscale(0.3); }
  }
  &__new {
    position: absolute;
    top: -10rpx;
    right: -6rpx;
    background: $gold;
    color: $ink;
    font-size: 18rpx;
    font-weight: 700;
    padding: 2rpx 10rpx;
    border-radius: 16rpx;
    box-shadow: 0 2rpx 6rpx rgba(73, 62, 55, 0.25);
  }
  &__img { width: 140rpx; height: 210rpx; border-radius: 16rpx; box-shadow: 0 4rpx 10rpx rgba(73, 62, 55, 0.15); }
  &__actions { display: flex; justify-content: center; gap: 20rpx; margin-top: 16rpx; min-height: 80rpx; }
  &__btn {
    font-size: 28rpx;
    font-weight: 700;
    border-radius: 40rpx;
    padding: 0 48rpx;
    height: 80rpx;
    line-height: 80rpx;
    background: $felt;
    color: $cream;

    &--uno { background: $red; color: #fff; }
    &--plain { background: $maple-light; color: $ink; }
  }
}

// ---------- 结算 ----------
.result-mask {
  position: fixed;
  inset: 0;
  background: rgba(73, 62, 55, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.result {
  width: 600rpx;
  background: $cream;
  color: $ink;
  border-radius: 28rpx;
  padding: 48rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;

  &__title { font-size: 40rpx; font-weight: 700; }
  &__reason { font-size: 26rpx; color: rgba(73, 62, 55, 0.6); margin-top: 10rpx; }
  &__scores { width: 100%; margin-top: 32rpx; }
  &__row { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; border-bottom: 1rpx solid rgba(73, 62, 55, 0.1); }
  &__btn {
    margin-top: 28rpx;
    width: 100%;
    background: $red;
    color: #fff;
    font-weight: 700;
    border-radius: 44rpx;

    &--plain { background: rgba(73, 62, 55, 0.1); color: $ink; margin-top: 16rpx; }
  }
}

// ---------- 选色 ----------
.color-mask {
  position: fixed;
  inset: 0;
  background: rgba(73, 62, 55, 0.18);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  box-sizing: border-box;
  z-index: 30;
}

.color-panel {
  width: 600rpx;
  background: $cream;
  border-radius: 28rpx;
  padding: 40rpx;

  &__title { text-align: center; font-size: 34rpx; font-weight: 700; color: $ink; }
  &__preview { display: flex; justify-content: center; margin-top: 20rpx; }
  &__card { width: 120rpx; height: 180rpx; border-radius: 14rpx; box-shadow: 0 4rpx 12rpx rgba(73, 62, 55, 0.2); }
  &__row { display: flex; justify-content: space-between; margin-top: 28rpx; }
  &__item {
    width: 120rpx;
    height: 120rpx;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 4rpx 12rpx rgba(73, 62, 55, 0.2);
  }
  &__season { font-size: 40rpx; font-weight: 700; text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.3); }
  &__cname { font-size: 20rpx; opacity: 0.9; }
  &__cancel {
    margin-top: 16rpx;
    width: 100%;
    background: rgba(73, 62, 55, 0.08);
    color: $ink;
    font-size: 28rpx;
    border-radius: 40rpx;
  }
}
</style>