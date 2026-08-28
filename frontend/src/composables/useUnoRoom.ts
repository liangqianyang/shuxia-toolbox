/**
 * UNO 房间状态机：双通道同步——WebSocket 优先（实时推送），
 * 连接失败 3 次或异常断开时降级为带版本号的 HTTP 轮询；onShow 启动、onHide 停止。
 *
 * UNO 特有：服务端主动推进回合超时（Timer 清扫器 + 写操作懒检查），
 * 客户端只做本地倒计时展示，归零时拉一次权威状态兜底（懒检查触发点）。
 */

import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, gomokuWsUrl } from '@/services/toolbox'
import {
  catchUno,
  challengeWild4,
  chooseColor,
  createRoom,
  dealerDraw,
  declineChallenge,
  declareUno,
  drawCard,
  fetchRoomState,
  joinRoom,
  leaveRoom,
  passTurn,
  playCard,
  rematch,
  startGame,
} from '@/services/uno'
import { canPlay } from '@/utils/uno'
import type { UnoColor, UnoRoomState, UnoWsFrame } from '@/types/uno'

const WS_MAX_FAILURES = 3
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const HEARTBEAT_MS = 25000
const POLL_INTERVALS = { waiting: 3000, playing: 1500, finished: 4000 } as const
const POLL_MAX_BACKOFF_MS = 10000

export function useUnoRoom() {
  const state = ref<UnoRoomState | null>(null)
  const transport = ref<'ws' | 'polling'>('ws')
  const acting = ref(false)
  const myCode = ref('')

  const isSeated = computed(() => state.value?.mySeat !== null && state.value?.mySeat !== undefined)
  const isOwner = computed(() => isSeated.value && state.value?.ownerSeat === state.value?.mySeat)
  const isMyTurn = computed(
    () => state.value?.status === 'playing' && state.value.currentSeat !== null && state.value.currentSeat === state.value.mySeat,
  )
  const myPlayer = computed(() => {
    const current = state.value
    if (!current || current.mySeat === null) return null
    return current.players.find((p) => p.seat === current.mySeat) ?? null
  })
  /** 其他玩家（牌桌上方环形排布用）。 */
  const opponents = computed(() => {
    const current = state.value
    if (!current) return []
    return current.players.filter((p) => p.seat !== current.mySeat)
  })
  /** 手牌数（含未开局时的 0）。 */
  const myHandCount = computed(() => state.value?.myHand?.length ?? 0)
  /** 某张牌我能否出（即时置灰；权威以后端为准）。
   *  叠加态：+2 起的叠可出 +2/+4，叠过 +4 后只能再叠 +4；被 +4 的质疑窗口内只能叠 +4。 */
  function canIPlay(card: string): boolean {
    const current = state.value
    if (!current || !isMyTurn.value || !current.topCard) return false
    const v = card[1]
    if (current.challenge?.mine) return v === 'F'
    if (current.drawStack) return current.drawStack.only4 ? v === 'F' : v === 'D' || v === 'F'
    return canPlay(card, current.topCard, current.currentColor)
  }

  let socket: UniApp.SocketTask | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let wsFailures = 0
  let pollFailures = 0
  let running = false
  let manuallyClosed = false

  function toast(message: string) {
    uni.showToast({ title: message, icon: 'none' })
  }

  // ---------- 本地倒计时（展示用；服务端 Timer 是权威推进） ----------

  const turnCountdown = ref(0)
  const challengeCountdown = ref(0)
  const unoWindowCountdown = ref(0)
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  function clearCountdownTimer() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  /** 远端状态落地后同步各倒计时；回合/质疑倒计时归零时拉权威状态（触发服务端懒推进）。 */
  function syncCountdowns() {
    clearCountdownTimer()
    const current = state.value
    turnCountdown.value = current?.status === 'playing' ? current.turnTtl : 0
    challengeCountdown.value = current?.challenge?.ttl ?? 0
    unoWindowCountdown.value = current?.uno?.selfWindowTtl ?? 0
    if (!current || current.status !== 'playing' || !myCode.value) return
    countdownTimer = setInterval(() => {
      if (turnCountdown.value > 0) turnCountdown.value--
      if (challengeCountdown.value > 0) challengeCountdown.value--
      if (unoWindowCountdown.value > 0) unoWindowCountdown.value--
      if (turnCountdown.value === 0 || (challengeCountdown.value === 0 && state.value?.challenge)) {
        clearCountdownTimer()
        void fetchRoomState(myCode.value, 0)
          .then((fresh) => {
            if (fresh.changed) applyState(fresh)
          })
          .catch(() => {})
      }
    }, 1000)
  }

  /** 应用远端状态；版本更旧的帧直接丢弃（防乱序）。 */
  function applyState(next: UnoRoomState) {
    if (state.value && next.version < state.value.version && next.code === state.value.code) return
    if (state.value && next.code !== state.value.code) return
    state.value = next
    syncCountdowns()
  }

  async function enterRoom(next: UnoRoomState) {
    state.value = next
    myCode.value = next.code
    startSync()
  }

  async function createAndEnter() {
    await enterRoom(await createRoom())
  }

  async function joinByCode(code: string) {
    if (!/^[0-9]{4}$/.test(code)) {
      toast('房间码是 4 位数字')
      return
    }
    await enterRoom(await joinRoom(code))
  }

  /** 动作统一入口：busy 锁 + 错误 toast；成功以权威回包落地。 */
  async function act(action: () => Promise<UnoRoomState>) {
    if (acting.value) return
    acting.value = true
    try {
      applyState(await action())
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败')
    } finally {
      acting.value = false
    }
  }

  async function start() {
    const current = state.value
    if (!current) return
    await act(() => startGame(current.code))
  }

  async function drawDealer() {
    const current = state.value
    if (!current) return
    await act(() => dealerDraw(current.code))
  }

  async function play(card: string, chosenColor: UnoColor | null, declaredUno: boolean) {
    const current = state.value
    if (!current) return
    if (!isMyTurn.value) {
      toast('还没轮到你')
      return
    }
    await act(() => playCard(current.code, card, chosenColor, declaredUno))
  }

  async function draw() {
    const current = state.value
    if (!current || !isMyTurn.value) return
    await act(() => drawCard(current.code))
  }

  async function pass() {
    const current = state.value
    if (!current || !isMyTurn.value) return
    await act(() => passTurn(current.code))
  }

  async function challenge() {
    const current = state.value
    if (!current) return
    await act(() => challengeWild4(current.code))
  }

  async function decline() {
    const current = state.value
    if (!current) return
    await act(() => declineChallenge(current.code))
  }

  async function chooseStartColor(color: UnoColor) {
    const current = state.value
    if (!current) return
    await act(() => chooseColor(current.code, color))
  }

  async function sayUno() {
    const current = state.value
    if (!current) return
    await act(() => declareUno(current.code))
  }

  async function reportUno(seat: number) {
    const current = state.value
    if (!current) return
    await act(() => catchUno(current.code, seat))
  }

  async function requestRematch() {
    const current = state.value
    if (!current) return
    await act(() => rematch(current.code))
  }

  async function exitRoom() {
    const current = state.value
    const seated = isSeated.value
    stopSync()
    state.value = null
    myCode.value = ''
    if (!current || !seated) return
    try {
      await leaveRoom(current.code)
    } catch {
      // 离开是尽力而为：房已关/网断都无需提示
    }
  }

  // ---------- WS 通道 ----------

  function connectWs() {
    if (!running || !myCode.value || transport.value !== 'ws') return
    const token = String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')
    if (!token) {
      degradeToPolling()
      return
    }
    manuallyClosed = false
    socket = uni.connectSocket({
      url: gomokuWsUrl('/uno/ws', { token, code: myCode.value }),
      complete: () => {},
    })
    socket.onOpen(() => {
      wsFailures = 0
      heartbeatTimer = setInterval(() => {
        socket?.send({ data: '{"type":"ping"}' })
      }, HEARTBEAT_MS)
    })
    socket.onMessage((event) => {
      let frame: UnoWsFrame
      try {
        frame = JSON.parse(String(event.data)) as UnoWsFrame
      } catch {
        return
      }
      if (frame.type === 'state') applyState(frame.state)
      if (frame.type === 'error') toast(frame.message)
    })
    socket.onClose(() => {
      clearHeartbeat()
      if (!running || manuallyClosed || transport.value !== 'ws') return
      wsFailures++
      if (wsFailures >= WS_MAX_FAILURES) {
        degradeToPolling()
        return
      }
      reconnectTimer = setTimeout(connectWs, RECONNECT_DELAYS[Math.min(wsFailures - 1, RECONNECT_DELAYS.length - 1)])
    })
    socket.onError(() => {
      socket?.close({})
    })
  }

  function closeWs() {
    manuallyClosed = true
    clearHeartbeat()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    socket?.close({})
    socket = null
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function degradeToPolling() {
    closeWs()
    transport.value = 'polling'
    schedulePoll(0)
  }

  // ---------- 轮询降级 ----------

  function schedulePoll(delay: number) {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = setTimeout(pollOnce, delay)
  }

  async function pollOnce() {
    if (!running || !myCode.value || transport.value !== 'polling') return
    try {
      const response = await fetchRoomState(myCode.value, state.value?.version ?? 0)
      pollFailures = 0
      if (response.changed) applyState(response)
    } catch {
      pollFailures++
    }
    const status = state.value?.status ?? 'waiting'
    const base = status === 'playing' ? POLL_INTERVALS.playing : status === 'finished' ? POLL_INTERVALS.finished : POLL_INTERVALS.waiting
    schedulePoll(Math.min(base * 2 ** pollFailures, POLL_MAX_BACKOFF_MS))
  }

  // ---------- 生命周期 ----------

  function startSync() {
    if (!myCode.value) return
    running = true
    if (transport.value === 'ws') connectWs()
    else schedulePoll(0)
  }

  function stopSync() {
    running = false
    closeWs()
    clearCountdownTimer()
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  return {
    state,
    transport,
    acting,
    myCode,
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
  }
}
