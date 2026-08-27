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

      <!-- 等待开局 -->
      <view v-if="state.status === 'waiting'" class="waiting">
        <view class="waiting__players">
          <view v-for="p in state.players" :key="p.userId" class="waiting__player">
            <image v-if="p.avatarUrl" :src="p.avatarUrl" class="waiting__avatar" />
            <view v-else class="waiting__avatar waiting__avatar--placeholder">🍁</view>
            <text class="waiting__name">{{ p.nickname }}{{ p.seat === state.ownerSeat ? '（房主）' : '' }}</text>
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
        <!-- 对手排 -->
        <view class="opponents">
          <view
            v-for="p in opponents"
            :key="p.userId"
            class="opp"
            :class="{ 'opp--current': p.seat === state.currentSeat, 'opp--left': p.left }"
          >
            <view class="opp__avatar-wrap">
              <image v-if="p.avatarUrl" :src="p.avatarUrl" class="opp__avatar" />
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

        <!-- 桌面中央 -->
        <view class="table">
          <view class="table__pile" @tap="onDeckTap">
            <image v-if="images[BACK_KEY]" :src="images[BACK_KEY]" class="table__card" />
            <text class="table__pile-count">{{ state.deckCount }}</text>
            <text v-if="isMyTurn && !state.drawnCard" class="table__pile-hint">点我摸牌</text>
          </view>
          <view class="table__info">
            <view class="table__color" :style="{ background: colorMeta.color }">{{ colorMeta.season }}</view>
            <view class="table__direction">{{ state.direction === 1 ? '↻ 顺时针' : '↺ 逆时针' }}</view>
          </view>
          <view class="table__top">
            <image v-if="state.topCard && images[state.topCard]" :src="images[state.topCard]" class="table__card" />
          </view>
        </view>

        <!-- +4 质疑条 -->
        <view v-if="state.challenge" class="challenge">
          <template v-if="state.challenge.mine">
            <text class="challenge__text">被 +4 了！怀疑对方手上有同色牌？（{{ challengeCountdown }}s）</text>
            <button class="challenge__btn" :disabled="acting" @tap="challenge">质疑</button>
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
              <text v-if="isMyTurn" class="hand__status--mine">
                {{ state.drawnCard ? '可以出刚摸的牌，或选择不出' : '轮到你了' }}（{{ turnCountdown }}s）
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
                @tap="onCardTap(i)"
              >
                <image v-if="images[card]" :src="images[card]" class="hand__img" mode="aspectFit" />
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
              这张不出
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
    </view>

    <!-- 选色弹层：遮罩调浅，选色时仍能看清自己的手牌 -->
    <view v-if="colorPickerVisible" class="color-mask" @tap="cancelColorPick">
      <view class="color-panel" @tap.stop>
        <view class="color-panel__title">为它选择一个季节</view>
        <view v-if="pendingWildCard && images[pendingWildCard]" class="color-panel__preview">
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
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onHide, onLoad, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { useUnoRoom } from '@/composables/useUnoRoom'
import { useUnoCards } from '@/composables/useUnoCards'
import { BACK_KEY } from '@/utils/unoCards'
import { COLOR_META, UNO_COLORS, isWild } from '@/utils/uno'
import { playUnoSound, setUnoSoundEnabled, unoSoundEnabled } from '@/utils/unoSound'
import type { UnoColor } from '@/types/uno'

const {
  state,
  acting,
  isSeated,
  isOwner,
  isMyTurn,
  opponents,
  myHandCount,
  turnCountdown,
  challengeCountdown,
  unoWindowCountdown,
  canIPlay,
  createAndEnter,
  joinByCode,
  start,
  play,
  draw,
  pass,
  challenge,
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
const pendingWildCard = ref('')
const soundOn = ref(unoSoundEnabled())
let pendingWild: { card: string; declaredUno: boolean } | null = null

function toggleSound() {
  soundOn.value = !soundOn.value
  setUnoSoundEnabled(soundOn.value)
  uni.showToast({ title: soundOn.value ? '音效已开启' : '音效已关闭', icon: 'none' })
}

// 桌面事件 → 提示音：出牌/摸牌/喊 UNO/获胜（所有在线玩家都会听到，WS 推送驱动）
watch(
  () => state.value?.version,
  () => {
    const type = state.value?.lastEvent?.type
    if (!type) return
    if (type === 'win') playUnoSound('win')
    else if (type === 'uno' || type === 'catch') playUnoSound('uno')
    else if (['draw', 'timeout', 'wild4_draw', 'challenge_guilty', 'challenge_innocent'].includes(type)) playUnoSound('draw')
    else if (['play', 'skip', 'reverse', 'draw2', 'wild', 'wild4'].includes(type)) playUnoSound('play')
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
  if (reason === 'last_man') return '成为最后的玩家'
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

const unoSeat = computed(() => state.value?.uno?.seat ?? -1)

// 牌面图片按需渲染：手牌/顶牌/牌背变化时补齐
watch(
  () => [state.value?.myHand, state.value?.topCard] as const,
  () => {
    const keys = [BACK_KEY]
    if (state.value?.topCard) keys.push(state.value.topCard)
    if (state.value?.myHand) keys.push(...state.value.myHand)
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
  if (!canIPlay(card)) {
    uni.showToast({ title: '这张牌出不了', icon: 'none' })
    return
  }
  selectedIndex.value = selectedIndex.value === index ? -1 : index
}

function onPlay(declaredUno: boolean) {
  const card = selectedCard.value
  if (!card) return
  if (isWild(card)) {
    pendingWild = { card, declaredUno }
    pendingWildCard.value = card
    colorPickerVisible.value = true
    return
  }
  selectedIndex.value = -1
  void play(card, null, declaredUno)
}

function onPickColor(color: UnoColor) {
  colorPickerVisible.value = false
  pendingWildCard.value = ''
  const pending = pendingWild
  pendingWild = null
  if (!pending) return
  selectedIndex.value = -1
  void play(pending.card, color, pending.declaredUno)
}

function cancelColorPick() {
  colorPickerVisible.value = false
  pendingWildCard.value = ''
  pendingWild = null
}

function onDeckTap() {
  if (!isMyTurn.value || state.value?.drawnCard) return
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
  &__player { display: flex; flex-direction: column; align-items: center; width: 140rpx; position: relative; }
  &__avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: $maple-light;
    &--placeholder { display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
  }
  &__name { font-size: 24rpx; margin-top: 10rpx; max-width: 140rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
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
  }
  &__hint { margin-top: 70rpx; font-size: 28rpx; color: rgba(73, 62, 55, 0.6); }
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
  width: 150rpx;
  padding: 12rpx 6rpx;
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
  &__name { font-size: 22rpx; margin-top: 8rpx; max-width: 138rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
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

// ---------- 质疑 / UNO 条 ----------
.challenge,
.uno-bar {
  display: flex;
  align-items: center;
  justify-content: center;
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
  }
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
  &__cards { display: inline-flex; align-items: flex-end; padding: 20rpx 24rpx 8rpx; min-height: 240rpx; }
  &__card {
    width: 140rpx;
    height: 210rpx;
    margin-left: -44rpx;
    border-radius: 16rpx;
    transition: transform 0.15s ease;
    &:first-child { margin-left: 0; }
    &--selected { transform: translateY(-28rpx); }
    &--dim { opacity: 0.78; filter: grayscale(0.3); }
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
  align-items: center;
  justify-content: center;
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
}
</style>