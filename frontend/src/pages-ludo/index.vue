<template>
  <view class="ludo">
    <!-- 大厅 -->
    <view v-if="!state" class="lobby">
      <image class="lobby__logo" :src="cdnUrl('/static/icons/ludo-1.png')" mode="aspectFit" />
      <view class="lobby__title">飞行棋</view>
      <view class="lobby__subtitle">2-4 人联机 · 经典规则 · 掷骰起飞飞跃终点</view>
      <button class="lobby__create" :disabled="acting" @tap="onCreate">创建房间</button>
      <view class="lobby__join">
        <input v-model="joinCode" class="lobby__input" type="number" maxlength="4" placeholder="输入 4 位房间码" />
        <button class="lobby__join-btn" :disabled="acting" @tap="onJoin">加入</button>
      </view>
      <text class="lobby__rules" @tap="rulesOpen = true">❓ 玩法说明</text>
    </view>

    <!-- 房间 -->
    <view v-else class="room">
      <view class="room__header">
        <text class="room__code" @tap="copyCode">房号 {{ state.code }} ⧉</text>
        <view class="room__header-actions">
          <text class="room__sound" @tap="rulesOpen = true">❓</text>
          <text class="room__sound" @tap="toggleSound">{{ soundOn ? '🔊' : '🔇' }}</text>
          <button open-type="share" class="room__share">邀请</button>
          <text class="room__leave" @tap="onLeave">离开</text>
        </view>
      </view>

      <!-- 资料提示：没设置过头像昵称时引导完善 -->
      <view v-if="showProfileBanner" class="profile-banner" @tap="openProfileEditor">
        <text>✈️ 你还没有头像昵称，点我设置，让棋友认出你</text>
        <text class="profile-banner__go">去设置 ›</text>
      </view>

      <!-- 等待开局 -->
      <view v-if="state.status === 'waiting'" class="waiting">
        <view class="waiting__players">
          <view v-for="p in state.players" :key="p.userId" class="waiting__player">
            <image v-if="p.avatarUrl" :src="avatarOf(p.avatarUrl)" class="waiting__avatar" />
            <view v-else class="waiting__avatar waiting__avatar--placeholder">✈️</view>
            <text class="waiting__name">{{ p.nickname }}</text>
            <text v-if="p.seat === state.ownerSeat" class="waiting__owner">房主</text>
            <view class="waiting__dot" :class="{ 'waiting__dot--off': !p.online }" />
          </view>
          <view v-for="i in emptySeats" :key="'e' + i" class="waiting__player waiting__player--empty">
            <view class="waiting__avatar waiting__avatar--placeholder">＋</view>
            <text class="waiting__name">等待加入</text>
          </view>
        </view>
        <button v-if="isOwner" class="waiting__start" :disabled="acting || state.players.length < 2" @tap="start">
          开始游戏（{{ state.players.length }}/4）
        </button>
        <view v-else class="waiting__hint">等待房主开局…（{{ state.players.length }}/4）</view>
      </view>

      <!-- 牌桌 -->
      <template v-else>
        <!-- 玩家条 -->
        <view class="players-bar">
          <view
            v-for="p in state.players"
            :key="p.userId"
            class="pchip"
            :class="{ 'pchip--current': p.seat === state.currentSeat && state.status === 'playing', 'pchip--left': p.left }"
          >
            <view class="pchip__avatar-wrap">
              <image v-if="p.avatarUrl" :src="avatarOf(p.avatarUrl)" class="pchip__avatar" />
              <view v-else class="pchip__avatar pchip__avatar--placeholder">✈️</view>
              <view class="pchip__color" :style="{ background: colorHex(p.color) }" />
              <view v-if="!p.online" class="pchip__off" />
            </view>
            <view class="pchip__meta">
              <text class="pchip__name">{{ p.nickname }}</text>
              <view class="pchip__stats">
                <text class="pchip__planes">🛬 {{ p.finishedCount }}/4</text>
                <text v-if="p.place" class="pchip__place">第{{ p.place }}名</text>
                <text v-if="p.auto" class="pchip__auto">托管</text>
                <text v-else-if="p.idle" class="pchip__idle">挂机</text>
                <text v-else-if="p.left" class="pchip__lefttag">已离开</text>
              </view>
            </view>
            <view v-if="p.seat === state.currentSeat && state.status === 'playing'" class="pchip__timer">{{ turnCountdown }}</view>
          </view>
        </view>

        <!-- 棋盘 -->
        <view class="board-wrap">
          <view class="board" :style="{ width: boardCss + 'px', height: boardCss + 'px' }">
            <image v-if="boardImg" :src="boardImg" class="board__img" mode="aspectFit" />
            <view
              v-for="pl in planeSprites"
              :key="pl.seat + '-' + pl.p"
              class="plane"
              :class="{ 'plane--mine': isMyMovePhase && pl.seat === state.mySeat && canMovePlane(pl.p), 'plane--done': pl.done }"
              :style="{ left: pl.x + '%', top: pl.y + '%' }"
              @tap="onPlaneTap(pl)"
            >
              <image class="plane__img" :src="cdnUrl('/pages-ludo/static/ludo/planes/' + planeAsset(pl.color))" mode="aspectFit" />
            </view>
          </view>

          <!-- 事件播报条 -->
          <view class="event-banner" :class="{ 'event-banner--show': bannerVisible }">{{ bannerText }}</view>
        </view>

        <!-- 骰子区 -->
        <view class="dice-zone">
          <view class="dice-zone__current">
            <text class="dice-zone__whose">{{ currentText }}</text>
            <view v-if="state.status === 'playing' && state.roll" class="dice-zone__countdown">{{ turnCountdown }}s</view>
          </view>
          <view class="dice-zone__body">
            <image class="dice" :class="{ 'dice--rolling': diceRolling }" :src="diceFaceSrc" mode="aspectFit" />
            <button
              v-if="isMyTurn && state.phase === 'roll'"
              class="dice-zone__roll"
              :disabled="acting || diceRolling"
              @tap="onRoll"
            >掷骰子</button>
            <button
              v-else-if="isMyMovePhase"
              class="dice-zone__roll dice-zone__roll--move"
              disabled
            >点亮的飞机可走（{{ myLegalMoves.length }} 架）</button>
            <view v-else-if="myAuto" class="dice-zone__auto-on">托管中，代你行动…</view>
            <view v-else class="dice-zone__wait">{{ state.status === 'playing' ? '等待其他玩家…' : '' }}</view>
          </view>
          <view class="dice-zone__actions">
            <button class="dice-zone__auto" :class="{ 'dice-zone__auto--on': myAuto }" :disabled="acting" @tap="toggleMyAuto">
              {{ myAuto ? '取消托管' : '托管' }}
            </button>
          </view>
        </view>

        <!-- 定先手（开局掷骰仪式 + 结果定格） -->
        <view v-if="state.opening || openingResult" class="result-mask">
          <!-- 结果定格：全员点数 + 先手者高亮 -->
          <view v-if="!state.opening && openingResult" class="opening">
            <view class="opening__title">🏆 先手诞生</view>
            <view class="opening__grid">
              <view
                v-for="p in state.players.filter((x) => !x.left)"
                :key="p.seat"
                class="opening__side"
                :class="{ 'opening__side--win': p.seat === openingResult.winner, 'opening__side--dim': p.seat !== openingResult.winner }"
              >
                <view v-if="p.seat === openingResult.winner" class="opening__crown">👑 先手</view>
                <image class="opening__avatar" :src="avatarOf(p.avatarUrl)" mode="aspectFill" />
                <view class="opening__name">{{ p.nickname }}</view>
                <view v-if="openingResult.rolls[String(p.seat)] !== undefined" class="opening__dice">🎲 <text class="opening__sum">{{ openingResult.rolls[String(p.seat)] }}</text></view>
              </view>
            </view>
            <view class="opening__wait">{{ nickOf(openingResult.winner) }} 掷得先手，出发！</view>
          </view>
          <view v-else-if="state.opening" class="opening">
            <view class="opening__title">🎯 定先手<text v-if="state.opening.round > 1"> · 并列重掷第 {{ state.opening.round }} 轮</text></view>
            <view class="opening__grid">
              <view
                v-for="p in state.players.filter((x) => !x.left)"
                :key="p.seat"
                class="opening__side"
                :class="{ 'opening__side--tie': state.opening.tieSeats.includes(p.seat) }"
              >
                <image class="opening__avatar" :src="avatarOf(p.avatarUrl)" mode="aspectFill" />
                <view class="opening__name">{{ p.nickname }}</view>
                <view v-if="state.opening.rolls[String(p.seat)] !== undefined" class="opening__dice">🎲 <text class="opening__sum">{{ state.opening.rolls[String(p.seat)] }}</text></view>
                <view v-else-if="state.opening.pending.includes(p.seat)" class="opening__wait">待掷…</view>
                <view v-else class="opening__wait">本轮轮空</view>
              </view>
            </view>
            <view class="opening__countdown">{{ turnCountdown }}s 后未掷自动代掷</view>
            <button v-if="state.opening.mine" class="opening__btn" :disabled="acting || diceRolling" @tap="onRoll">{{ diceRolling ? '🎲 掷骰中…' : '🎲 掷骰定先手' }}</button>
            <view v-else class="opening__wait">等其他人掷骰…</view>
          </view>
        </view>

        <!-- 结算面板 -->
        <view v-if="state.status === 'finished'" class="result-mask">
          <view class="result">
            <image class="result__art" :src="winnerArt" mode="aspectFit" />
            <view class="result__title">{{ resultTitle }}</view>
            <view class="result__ranks">
              <view v-for="r in resultRanks" :key="r.seat" class="result__row" :class="{ 'result__row--me': r.seat === state.mySeat }">
                <text class="result__place" :class="'result__place--' + r.place">{{ r.place }}</text>
                <image v-if="r.avatarUrl" :src="avatarOf(r.avatarUrl)" class="result__avatar" />
                <view v-else class="result__avatar result__avatar--placeholder">✈️</view>
                <text class="result__name">{{ r.nickname }}</text>
                <text class="result__detail">🛬 {{ r.finishedCount }}/4 · 胜 {{ r.wins }}</text>
              </view>
            </view>
            <view class="result__actions">
              <button class="result__rematch" :disabled="acting" @tap="requestRematch">再来一局</button>
              <button class="result__exit" @tap="onLeave">离开房间</button>
            </view>
          </view>
        </view>
      </template>
    </view>

    <!-- 昵称头像完善弹层 -->
    <view v-if="profileEditing" class="profile-mask" @tap="closeProfileEditor">
      <view class="profile" @tap.stop>
        <view class="profile__title">设置头像昵称</view>
        <button class="profile__avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
          <image v-if="profileAvatar" :src="profileAvatar" class="profile__avatar" mode="aspectFit" />
          <view v-else class="profile__avatar profile__avatar--placeholder">＋</view>
          <text class="profile__hint">点头像选择</text>
        </button>
        <input v-model="profileNickname" class="profile__input" type="nickname" maxlength="20" placeholder="输入昵称（2-20 字）" />
        <button class="profile__save" :disabled="acting" @tap="saveMyProfile">保存</button>
      </view>
    </view>

    <!-- 玩法说明 -->
    <GameRulesModal :visible="rulesOpen" title="飞行棋 · 玩法说明" :sections="GAME_RULES" @close="rulesOpen = false" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { cdnUrl } from '@/utils/cdn'
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app'
import { useLudoRoom } from './composables/useLudoRoom'
import { ludoBoardImage, LUDO_COLORS } from './utils/ludoRender'
import { posToPoint } from './utils/ludoBoard'
import { playLudoSound, ludoSoundEnabled, setLudoSoundEnabled } from './utils/ludoSound'
import { resolveAvatarUrl, saveUserProfile, uploadAvatar } from '@/services/toolbox'
import GameRulesModal from '@/components/GameRulesModal.vue'

const rulesOpen = ref(false)

/** 玩法说明（玩家视角精简版）。 */
const GAME_RULES: { heading?: string; lines: string[] }[] = [
  {
    heading: '🎯 目标',
    lines: [
      '2-4 人联机，每人 4 架飞机，率先让全部飞机到达终点者获胜',
      '排名按完成顺序结算，中途退出永远排在留下的人之后',
    ],
  },
  {
    heading: '🛫 起飞与掷 6',
    lines: [
      '开局全员各掷一颗骰子定先手，点数最大者先行；最大点并列的重新掷',
      '掷出 6 点才能让飞机从机场起飞；掷 6 移动后再掷一次（连环机会）',
      '掷 6 且刚好完成最后一架飞机时不再追加回合',
    ],
  },
  {
    heading: '⚡ 己色格与飞行',
    lines: [
      '落在自己颜色的格子（每 4 格一个）自动向前跳 4 格；48 死格不跳，跳完不再连跳',
      '飞行格（跑道中段）触发飞行：碾压弧线下的敌机、直接飞到 28 格再接跳到 32',
      '跳跃落在飞行格同样触发飞行——骰子 → 跳 → 飞 → 跳的大连招就来自这里',
    ],
  },
  {
    heading: '💥 击落与保护',
    lines: [
      '落在敌机所在格（非星标格）将其击落送回机场',
      '星标格（各色起飞格）受保护：不可击落、可多机共存',
    ],
  },
  {
    heading: '🏁 终点',
    lines: ['到终点需要精确步数，超出的部分反弹回来'],
  },
  {
    heading: '⏱️ 超时与托管',
    lines: [
      '掷骰/走子各 20 秒，超时自动代走；连续 3 次超时进入挂机模式',
      '可随时开托管，真人操作即刻接管',
    ],
  },
]
import { getWindowInfo } from '@/utils/canvasAdapter'
import type { LudoColor, LudoEvent, LudoRoomState } from '@/types/ludo'

const {
  state,
  acting,
  isSeated,
  isOwner,
  isMyTurn,
  isMyMovePhase,
  myLegalMoves,
  myAuto,
  turnCountdown,
  canMovePlane,
  createAndEnter,
  joinByCode,
  start,
  roll,
  move,
  setAuto,
  requestRematch,
  exitRoom,
  startSync,
  stopSync,
} = useLudoRoom()

const joinCode = ref('')
const soundOn = ref(ludoSoundEnabled())

/** 等待室空位占位数（补齐 4 席展示）。 */
const emptySeats = computed(() => {
  const count = state.value?.players.length ?? 0
  return Math.max(0, 4 - count)
})

// ---------- 棋盘渲染 ----------
const boardCss = ref(320)
const boardImg = ref('')

async function ensureBoard() {
  const { windowWidth, pixelRatio } = getWindowInfo()
  const css = Math.min(windowWidth - 24, 560)
  boardCss.value = css
  try {
    boardImg.value = await ludoBoardImage(Math.min(Math.round(css * pixelRatio), 1600))
  } catch {
    boardImg.value = '' // 渲染失败仍可玩（棋盘底色由 CSS 兜底）
  }
}

// ---------- 飞机精灵 ----------
interface PlaneSprite {
  seat: number
  p: number
  color: LudoColor | null
  x: number
  y: number
  done: boolean
}

const planeSprites = computed<PlaneSprite[]>(() => {
  const current = state.value
  if (!current || !current.planes) return []
  const sprites: PlaneSprite[] = []
  // 同格多机微错位（星标/跑道共存、己机叠格）
  const cellGroups = new Map<string, number>()
  current.planes.forEach((row, seat) => {
    row.forEach((pos, p) => {
      const color = current.colors?.[seat] ?? null
      const pt = posToPoint(color ?? 0, pos, p)
      const key = pos >= 51 && pos < 56 ? `home-${seat}-${pos}` : `${color}-${pos}`
      const idx = cellGroups.get(key) ?? 0
      cellGroups.set(key, idx + 1)
      sprites.push({
        seat,
        p,
        color,
        x: pt.x * 100 + (idx % 2 === 1 ? 3.2 : 0) - (idx > 1 ? 1.6 : 0),
        y: pt.y * 100 + (idx > 1 ? 3.2 : 0),
        done: pos === 56,
      })
    })
  })
  return sprites
})

function planeAsset(color: LudoColor | null): string {
  if (color === 0) return 'red_plane.png'
  if (color === 1) return 'yellow_plane.png'
  if (color === 2) return 'blue_plane.png'
  return 'green_plane.png'
}

function colorHex(color: LudoColor | null): string {
  return LUDO_COLORS[color ?? 0]?.hex ?? '#999'
}

// ---------- 骰子 ----------
const diceRolling = ref(false)
let diceAnimTimer: ReturnType<typeof setInterval> | null = null

const diceFaceSrc = computed(() => {
  void diceTick.value // 掷骰动画期间由定时器触发重算（轮播 roll_1..4 帧）
  const current = state.value
  if (diceRolling.value) {
    return cdnUrl(`/pages-ludo/static/ludo/dice/roll_${1 + (Math.floor(diceTick.value / 120) % 4)}.png`)
  }
  if (current?.roll) return cdnUrl(`/pages-ludo/static/ludo/dice/dice_${current.roll}.png`)
  return cdnUrl('/pages-ludo/static/ludo/dice/dice_6.png')
})

const currentText = computed(() => {
  const current = state.value
  if (!current || current.status !== 'playing') return ''
  const player = current.players.find((p) => p.seat === current.currentSeat)
  if (!player) return ''
  const who = player.seat === current.mySeat ? '你' : player.nickname
  if (player.auto) return `${who}（托管）行动中`
  if (current.phase === 'move') return `${who} 选机走子…`
  return `${who} 掷骰中…`
})

async function onRoll() {
  if (diceRolling.value) return
  diceRolling.value = true
  if (diceAnimTimer) clearInterval(diceAnimTimer)
  diceAnimTimer = setInterval(() => {
    // 触发 diceFaceSrc 重算（滚动帧轮播）
    diceTick.value = Date.now()
  }, 120)
  playLudoSound('roll')
  try {
    await roll()
  } finally {
    setTimeout(() => {
      diceRolling.value = false
      if (diceAnimTimer) {
        clearInterval(diceAnimTimer)
        diceAnimTimer = null
      }
    }, 380)
  }
}

const diceTick = ref(0)

function onPlaneTap(pl: PlaneSprite) {
  if (!isMyMovePhase.value || pl.seat !== state.value?.mySeat) return
  if (!canMovePlane(pl.p)) return
  void move(pl.p)
}

async function toggleMyAuto() {
  await setAuto(!myAuto.value)
}

// ---------- 事件播报 + 音效 ----------
const bannerText = ref('')
const bannerVisible = ref(false)
let bannerTimer: ReturnType<typeof setTimeout> | null = null
let lastSeq = 0
let lastRoomCode = ''

function nameOfSeat(current: LudoRoomState, seat: number | null | undefined): string {
  if (seat === null || seat === undefined) return ''
  const p = current.players.find((x) => x.seat === seat)
  if (!p) return ''
  return p.seat === current.mySeat ? '你' : p.nickname
}

function nickOf(seat: number | null | undefined): string {
  if (seat === null || seat === undefined) return '?'
  return state.value?.players.find((p) => p.seat === seat)?.nickname ?? '?'
}

function eventText(current: LudoRoomState, ev: LudoEvent): string {
  const name = nameOfSeat(current, ev.seat)
  const suffix = ev.auto ? '（托管）' : ''
  switch (ev.t) {
    case 'start': return '🎲 对局开始！掷骰定先手'
    case 'openRoll': return '' // 定先手浮层实时展示，不占播报条
    case 'openTie': return '🎲 最大点并列，并列者重掷！'
    case 'firstPlayer': return `🎲 ${nickOf(ev.seat)} 掷得先手！`
    case 'roll': return `${name}${suffix} 掷出 ${ev.v} 点`
    case 'skip': return `${name}${suffix} 无处可走，跳过`
    case 'takeoff': return `${name}${suffix} 起飞 ✈️`
    case 'jump': return `${name}${suffix} 踩到己色格，跳跃 +4`
    case 'fly': return `${name}${suffix} 走上航线，飞行！🛫`
    case 'crush': return `⚡ ${name}${suffix} 的航线碾压了敌机`
    case 'capture': return `💥 ${name}${suffix} 击落敌机`
    case 'finish': return `🏁 ${name}${suffix} 一架飞机到达终点`
    case 'timeout': return `${name} 超时，自动行动`
    case 'autoOn': return `${name} 开启托管`
    case 'autoOff': return `${name} 取消托管`
    case 'leave': return `${name} 离开了`
    case 'win': return `🎉 ${name} 获胜！`
    case 'rematch': return '再来一局！'
    case 'places': return '本局结束'
    case 'autoCap': return '托管异常，已暂停'
    default: return ''
  }
}

/** 定先手结果定格：最后一轮全员点数 + 先手者，浮层多停留一会儿再收起。 */
const openingResult = ref<{ winner: number; rolls: Record<string, number> } | null>(null)
let openingResultTimer: ReturnType<typeof setTimeout> | null = null

function holdOpeningResult(winner: number, rolls: Record<string, number>) {
  openingResult.value = { winner, rolls: { ...rolls } }
  if (openingResultTimer) clearTimeout(openingResultTimer)
  openingResultTimer = setTimeout(() => (openingResult.value = null), 2500)
}

function eventSound(ev: LudoEvent) {
  switch (ev.t) {
    case 'roll': playLudoSound('roll'); break
    case 'firstPlayer': playLudoSound('takeoff'); break
    case 'takeoff': playLudoSound('takeoff'); break
    case 'fly': playLudoSound('fly'); break
    case 'capture': case 'crush': playLudoSound('capture'); break
    case 'finish': playLudoSound('finish'); break
    case 'win': playLudoSound('win'); break
  }
}

watch(
  () => state.value?.version,
  () => {
    const current = state.value
    if (!current) return
    if (current.code !== lastRoomCode) {
      // 换房/首次进房：快进到最新事件，不把历史事件当新播报
      lastRoomCode = current.code
      const seqs = (current.events ?? []).map((e) => e.seq)
      lastSeq = seqs.length ? Math.max(...seqs) : 0
      return
    }
    const events = current.events ?? []
    for (const ev of events) {
      if (ev.seq <= lastSeq) continue
      lastSeq = ev.seq
      if (ev.t === 'firstPlayer' && ev.seat != null && ev.v && typeof ev.v === 'object') {
        holdOpeningResult(ev.seat, ev.v as Record<string, number>)
      }
      const text = eventText(current, ev)
      if (text) {
        bannerText.value = text
        bannerVisible.value = true
        if (bannerTimer) clearTimeout(bannerTimer)
        bannerTimer = setTimeout(() => {
          bannerVisible.value = false
        }, 2400)
      }
      eventSound(ev)
    }
  },
)

// ---------- 结算 ----------
const winnerArt = computed(() => {
  const current = state.value
  if (!current) return cdnUrl('/pages-ludo/static/ludo/result/ranking.png')
  return current.mySeat !== null && current.places?.[String(current.mySeat)] === 1
    ? cdnUrl('/pages-ludo/static/ludo/result/victory.png')
    : cdnUrl('/pages-ludo/static/ludo/result/ranking.png')
})

const resultTitle = computed(() => {
  const current = state.value
  if (!current) return ''
  const my = current.mySeat !== null ? current.places?.[String(current.mySeat)] : null
  if (my === 1) return '冠军是你的！'
  return my ? `你获得了第 ${my} 名` : '本局结束'
})

const resultRanks = computed(() => {
  const current = state.value
  if (!current) return []
  return current.players
    .map((p) => ({
      seat: p.seat,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      finishedCount: p.finishedCount,
      place: p.place ?? 9,
      wins: current.scores?.[String(p.userId)] ?? 0,
    }))
    .sort((a, b) => a.place - b.place)
})

// ---------- 资料完善 ----------
const profileEditing = ref(false)
const profileAvatar = ref('')
const profileNickname = ref('')

const showProfileBanner = computed(() => {
  const me = state.value?.players?.find((p) => p.seat === state.value?.mySeat)
  return !!(isSeated.value && me && (!me.avatarUrl || !me.nickname || me.nickname === '飞行棋友'))
})

function openProfileEditor() {
  const me = state.value?.players?.find((p) => p.seat === state.value?.mySeat)
  profileAvatar.value = me?.avatarUrl ? avatarOf(me.avatarUrl) : ''
  profileNickname.value = me?.nickname && me.nickname !== '飞行棋友' ? me.nickname : ''
  profileEditing.value = true
}

function closeProfileEditor() {
  profileEditing.value = false
}

function onChooseAvatar(e: { detail: { avatarUrl: string } }) {
  profileAvatar.value = e.detail.avatarUrl
}

async function saveMyProfile() {
  const nickname = profileNickname.value.trim()
  if (nickname.length < 2) {
    uni.showToast({ title: '昵称至少 2 个字', icon: 'none' })
    return
  }
  try {
    let avatarUrl = profileAvatar.value
    if (avatarUrl.startsWith('wxfile://') || avatarUrl.startsWith('http://tmp/')) {
      avatarUrl = await uploadAvatar(avatarUrl)
    } else if (avatarUrl.startsWith('http')) {
      // 已有远端头像：原样提交（后端接受相对路径或完整 URL）
    }
    await saveUserProfile({ nickname, avatarUrl })
    profileEditing.value = false
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  }
}

function avatarOf(url: string): string {
  return resolveAvatarUrl(url)
}

// ---------- 基础操作 ----------
async function onCreate() {
  try {
    await createAndEnter()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '创建失败', icon: 'none' })
  }
}

async function onJoin() {
  try {
    await joinByCode(joinCode.value.trim())
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加入失败', icon: 'none' })
  }
}

function copyCode() {
  const code = state.value?.code
  if (!code) return
  uni.setClipboardData({ data: code })
}

function toggleSound() {
  soundOn.value = !soundOn.value
  setLudoSoundEnabled(soundOn.value)
}

async function onLeave() {
  await exitRoom()
}

// ---------- 生命周期 ----------
onLoad(async (query) => {
  await ensureBoard()
  const code = typeof query?.room === 'string' ? query.room : ''
  if (code && /^[0-9]{4}$/.test(code)) {
    try {
      await joinByCode(code)
    } catch {
      // 房间不存在等：停留大厅
    }
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

onShareAppMessage(() => {
  const current = state.value
  return {
    title: current ? `来飞行棋房间 ${current.code}，一决高下！` : '飞行棋：2-4 人联机',
    path: current?.sharePath ?? '/pages-ludo/index',
  }
})
</script>

<style lang="scss" scoped>
// 「飞行棋」色板：与枫趣牌局同款奶油白底 + 墨绿 + 枫叶红主色 + 金黄强调（60/25/10/5）
$felt: #21483D;
$cream: #FFF8ED;
$ink: #493E37;
$red: #E85D4A;
$gold: #F4B942;
$maple-light: #FBE4D5;

.ludo {
  min-height: 100vh;
  box-sizing: border-box;
  background: linear-gradient(180deg, $cream 0%, #FDF1E0 100%);
  color: $ink;

  // 去掉小程序 button 默认的 ::after 描边；disabled 时微信会套默认灰色，需显式覆盖
  button::after { border: none; }
  button[disabled] { opacity: 1; }
}

/* ---------- 大厅 ---------- */
.lobby {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx 0;

  &__logo {
    width: 240rpx;
    height: 240rpx;
    border-radius: 52rpx;
    box-shadow: 0 12rpx 32rpx rgba(73, 62, 55, 0.18);
  }

  &__title {
    margin-top: 32rpx;
    font-size: 52rpx;
    font-weight: 700;
    color: $felt;
    letter-spacing: 8rpx;
  }

  &__subtitle {
    margin-top: 14rpx;
    font-size: 24rpx;
    color: rgba(73, 62, 55, 0.6);
  }

  &__create {
    margin-top: 72rpx;
    width: 500rpx;
    background: $red;
    color: #fff;
    font-size: 32rpx;
    font-weight: 700;
    border-radius: 48rpx;

    &[disabled] { background: rgba($red, 0.45); color: rgba(255, 255, 255, 0.9); }
  }

  &__join {
    margin-top: 36rpx;
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__rules {
    margin-top: 28rpx;
    font-size: 26rpx;
    color: $ink;
    text-decoration: underline;
  }

  // 加入区样式与五子棋大厅同款：白底卡片 + 暖棕描边按钮
  &__input {
    width: 320rpx;
    height: 88rpx;
    padding: 0 24rpx;
    background: #ffffff;
    border: 2rpx solid #f0e4d7;
    border-radius: 20rpx;
    color: $ink;
    font-size: 28rpx;
    box-sizing: border-box;
    text-align: center;
    letter-spacing: 8rpx;
  }

  &__join-btn {
    width: 160rpx;
    height: 88rpx;
    line-height: 88rpx;
    border-radius: 20rpx;
    background: #ffffff;
    color: #a8744b;
    border: 2rpx solid #c8956c;
    font-size: 28rpx;
    box-sizing: border-box;

    &[disabled] { opacity: 0.55; }
  }
}

/* ---------- 房间骨架 ---------- */
.room {
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8rpx 8rpx 12rpx;
  }

  &__code {
    font-size: 28rpx;
    font-weight: 600;
    color: $ink;
    letter-spacing: 2rpx;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__sound { font-size: 32rpx; padding: 8rpx; }

  &__share {
    margin: 0;
    height: 56rpx;
    line-height: 56rpx;
    padding: 0 28rpx;
    background: $maple-light;
    color: $ink;
    font-size: 24rpx;
    border-radius: 28rpx;
  }

  &__leave {
    font-size: 24rpx;
    font-weight: 600;
    color: $red;
    background: rgba(232, 93, 74, 0.12);
    border-radius: 28rpx;
    padding: 8rpx 24rpx;
  }
}

.profile-banner {
  margin-top: 8rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(244, 185, 66, 0.2);
  border: 2rpx solid rgba(244, 185, 66, 0.55);
  border-radius: 20rpx;
  padding: 16rpx 24rpx;
  font-size: 24rpx;
  color: #8a6a1f;

  &__go { font-weight: 700; }
}

/* ---------- 等待室 ---------- */
.waiting {
  margin-top: 56rpx;

  &__players {
    display: flex;
    flex-wrap: wrap;
    gap: 24rpx;
    justify-content: center;
  }

  &__player {
    width: 200rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    background: #ffffff;
    border-radius: 24rpx;
    padding: 24rpx 12rpx 16rpx;
    box-shadow: 0 6rpx 18rpx rgba(73, 62, 55, 0.08);
  }

  &__avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: $maple-light;

    &--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 44rpx;
    }
  }

  &__name {
    margin-top: 12rpx;
    font-size: 24rpx;
    color: $ink;
    max-width: 170rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__owner {
    position: absolute;
    top: 12rpx;
    left: 12rpx;
    font-size: 20rpx;
    color: $felt;
    background: $gold;
    border-radius: 12rpx;
    padding: 2rpx 10rpx;
    font-weight: 700;
  }

  &__dot {
    position: absolute;
    top: 20rpx;
    right: 20rpx;
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    background: #4fbf6b;

    &--off { background: #b8b0a8; }
  }

  &__start,
  &__hint {
    margin: 56rpx auto 0;
  }

  &__start {
    width: 500rpx;
    background: $red;
    color: #fff;
    font-size: 30rpx;
    font-weight: 700;
    border-radius: 48rpx;

    &[disabled] { background: rgba($red, 0.45); color: rgba(255, 255, 255, 0.9); }
  }

  &__hint {
    text-align: center;
    font-size: 26rpx;
    color: rgba(73, 62, 55, 0.6);
  }
}

/* ---------- 玩家条 ---------- */
.players-bar {
  margin-top: 8rpx;
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.pchip {
  flex: 1;
  min-width: 220rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: #ffffff;
  border: 3rpx solid transparent;
  border-radius: 20rpx;
  padding: 12rpx 16rpx;
  position: relative;
  box-shadow: 0 4rpx 12rpx rgba(73, 62, 55, 0.06);

  &--current {
    border-color: $gold;
    background: #FDF3D8;
  }

  &--left { opacity: 0.5; }

  &__avatar-wrap { position: relative; }

  &__avatar {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: $maple-light;

    &--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30rpx;
    }
  }

  &__color {
    position: absolute;
    right: -4rpx;
    bottom: -4rpx;
    width: 22rpx;
    height: 22rpx;
    border-radius: 50%;
    border: 3rpx solid #ffffff;
  }

  &__off {
    position: absolute;
    left: -2rpx;
    top: -2rpx;
    width: 20rpx;
    height: 20rpx;
    border-radius: 50%;
    background: #b8b0a8;
    border: 3rpx solid #ffffff;
  }

  &__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__name {
    font-size: 22rpx;
    color: $ink;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__stats {
    display: flex;
    gap: 10rpx;
    font-size: 20rpx;
    color: rgba(73, 62, 55, 0.6);
  }

  &__place { color: #8a6a1f; font-weight: 700; }
  &__auto { color: #2f9e50; font-weight: 700; }
  &__idle { color: $red; }
  &__lefttag { color: #9a9189; }

  &__timer {
    font-size: 26rpx;
    font-weight: 900;
    color: $felt;
    background: $gold;
    border-radius: 50%;
    width: 52rpx;
    height: 52rpx;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ---------- 棋盘 ---------- */
.board-wrap {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.board {
  position: relative;
  background: $cream;
  border-radius: 24rpx;
  border: 4rpx solid rgba(33, 72, 61, 0.14);
  box-shadow: 0 12rpx 32rpx rgba(73, 62, 55, 0.16);

  &__img {
    width: 100%;
    height: 100%;
    border-radius: 20rpx;
  }
}

.plane {
  position: absolute;
  width: 9.2%;
  height: 9.2%;
  transform: translate(-50%, -50%);
  transition: left 0.45s cubic-bezier(0.34, 1.3, 0.64, 1), top 0.45s cubic-bezier(0.34, 1.3, 0.64, 1);
  z-index: 2;

  &__img {
    width: 100%;
    height: 100%;
    filter: drop-shadow(2rpx 4rpx 4rpx rgba(73, 62, 55, 0.35));
  }

  &--mine {
    z-index: 3;
    animation: plane-pulse 0.9s ease-in-out infinite;

    .plane__img {
      filter: drop-shadow(0 0 10rpx rgba(244, 185, 66, 0.95)) drop-shadow(2rpx 4rpx 4rpx rgba(73, 62, 55, 0.35));
    }
  }

  &--done { opacity: 0.85; }
}

@keyframes plane-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.16); }
}

.event-banner {
  margin-top: 14rpx;
  min-height: 56rpx;
  line-height: 56rpx;
  padding: 0 28rpx;
  border-radius: 28rpx;
  background: rgba(33, 72, 61, 0.92);
  color: $cream;
  font-size: 24rpx;
  opacity: 0;
  transform: translateY(8rpx);
  transition: opacity 0.25s, transform 0.25s;

  &--show {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- 骰子区 ---------- */
.dice-zone {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;

  &__current {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }

  &__whose {
    font-size: 24rpx;
    color: rgba(73, 62, 55, 0.7);
  }

  &__countdown {
    font-size: 22rpx;
    font-weight: 700;
    color: #8a6a1f;
  }

  &__body {
    display: flex;
    align-items: center;
    gap: 28rpx;
  }

  &__roll {
    margin: 0;
    width: 280rpx;
    background: $red;
    color: #fff;
    font-size: 30rpx;
    font-weight: 800;
    border-radius: 44rpx;
    animation: roll-breathe 1.4s ease-in-out infinite;

    &--move {
      background: rgba(244, 185, 66, 0.3);
      border: 3rpx solid rgba(244, 185, 66, 0.7);
      animation: none;
      color: #8a6a1f;
    }

    &[disabled] { opacity: 0.85; }
  }

  &__auto-on,
  &__wait {
    font-size: 24rpx;
    color: rgba(73, 62, 55, 0.55);
  }

  &__auto-on { color: #2f9e50; font-weight: 700; }

  &__actions { display: flex; }

  &__auto {
    margin: 0;
    height: 64rpx;
    line-height: 64rpx;
    padding: 0 36rpx;
    background: $maple-light;
    color: $ink;
    font-size: 24rpx;
    border-radius: 32rpx;

    &--on {
      background: #4fbf6b;
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.dice {
  width: 88rpx;
  height: 88rpx;

  &--rolling {
    animation: dice-shake 0.28s linear infinite;
  }
}

@keyframes dice-shake {
  0% { transform: rotate(-14deg) scale(1.04); }
  50% { transform: rotate(10deg) scale(0.96); }
  100% { transform: rotate(-14deg) scale(1.04); }
}

@keyframes roll-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

/* ---------- 结算 ---------- */
.result-mask {
  position: fixed;
  inset: 0;
  background: rgba(73, 62, 55, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.result {
  width: 600rpx;
  background: $cream;
  border-radius: 36rpx;
  border: 6rpx solid $felt;
  padding: 36rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;

  &__art {
    width: 200rpx;
    height: 164rpx;
  }

  &__title {
    margin-top: 10rpx;
    font-size: 38rpx;
    font-weight: 900;
    color: $felt;
  }

  &__ranks {
    margin-top: 24rpx;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 14rpx;
    background: rgba(33, 72, 61, 0.06);
    border-radius: 16rpx;
    padding: 12rpx 16rpx;

    &--me { background: rgba(244, 185, 66, 0.22); }
  }

  &__place {
    width: 44rpx;
    height: 44rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24rpx;
    font-weight: 900;
    background: rgba(33, 72, 61, 0.12);
    color: $felt;

    &--1 { background: $gold; color: $felt; }
    &--2 { background: #cfd4da; color: $felt; }
    &--3 { background: #e8b285; color: $felt; }
  }

  &__avatar {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    background: #ffffff;

    &--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26rpx;
    }
  }

  &__name {
    flex: 1;
    font-size: 26rpx;
    font-weight: 700;
    color: $ink;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__detail {
    font-size: 20rpx;
    color: rgba(73, 62, 55, 0.6);
  }

  &__actions {
    margin-top: 28rpx;
    display: flex;
    gap: 20rpx;
  }

  &__rematch {
    margin: 0;
    width: 240rpx;
    background: $red;
    color: #fff;
    font-size: 28rpx;
    font-weight: 800;
    border-radius: 42rpx;
  }

  &__exit {
    margin: 0;
    width: 180rpx;
    background: rgba(33, 72, 61, 0.08);
    color: $felt;
    font-size: 28rpx;
    border-radius: 42rpx;
  }
}

/* ---------- 资料弹层 ---------- */
.profile-mask {
  position: fixed;
  inset: 0;
  background: rgba(73, 62, 55, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.profile {
  width: 560rpx;
  background: $cream;
  border-radius: 32rpx;
  border: 6rpx solid $felt;
  padding: 36rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;

  &__title {
    font-size: 32rpx;
    font-weight: 900;
    color: $felt;
  }

  &__avatar-btn {
    margin: 28rpx 0 0;
    background: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }

  &__avatar {
    width: 128rpx;
    height: 128rpx;
    border-radius: 50%;
    background: rgba(33, 72, 61, 0.08);

    &--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48rpx;
      color: $felt;
    }
  }

  &__hint {
    font-size: 22rpx;
    color: rgba(73, 62, 55, 0.6);
  }

  &__input {
    margin-top: 28rpx;
    width: 100%;
    height: 88rpx;
    background: #ffffff;
    border: 3rpx solid rgba(33, 72, 61, 0.25);
    border-radius: 20rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    color: $ink;
  }

  &__save {
    margin-top: 28rpx;
    width: 100%;
    background: $gold;
    color: $felt;
    font-size: 30rpx;
    font-weight: 700;
    border-radius: 44rpx;
  }
}


/* ── 定先手浮层 ── */
.opening {
  width: 82%;
  max-width: 640rpx;
  background: #fff8ed;
  border-radius: 28rpx;
  border: 4rpx solid #21483d;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}
.opening__title { font-size: 32rpx; font-weight: 800; color: #21483d; }
.opening__grid { display: flex; flex-wrap: wrap; gap: 16rpx; justify-content: center; }
.opening__side {
  display: flex; flex-direction: column; align-items: center; gap: 6rpx; width: 156rpx;
  background: rgba(33, 72, 61, 0.05); border-radius: 16rpx; padding: 14rpx 8rpx;
  border: 3rpx solid transparent;
}
.opening__side--tie { border-color: #f4b942; background: rgba(244, 185, 66, 0.14); }
.opening__avatar { width: 76rpx; height: 76rpx; border-radius: 50%; }
.opening__name { font-size: 22rpx; color: #21483d; max-width: 140rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opening__dice { font-size: 22rpx; color: #21483d; }
.opening__sum { font-weight: 800; color: #e85d4a; font-size: 30rpx; }
.opening__wait { font-size: 20rpx; color: #9aa79e; }
.opening__countdown { font-size: 26rpx; font-weight: 800; color: #e85d4a; }
.opening__btn {
  width: 100%; height: 92rpx; line-height: 92rpx; font-size: 32rpx; font-weight: 700;
  background: #e85d4a; color: #fff; border-radius: 18rpx; border: none;
}
.opening__btn[disabled] { opacity: 0.45; }
.opening__side--win { border-color: #f4b942; background: rgba(244, 185, 66, 0.16); animation: opening-win-pulse 1s ease-in-out infinite; }
.opening__side--dim { opacity: 0.55; }
.opening__crown {
  font-size: 20rpx; font-weight: 800; background: #f4b942; color: #21483d;
  border-radius: 999rpx; padding: 4rpx 14rpx; box-shadow: 0 4rpx 10rpx rgba(0,0,0,0.25);
}
@keyframes opening-win-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
</style>
