/**
 * 飞行棋房间状态机：双通道同步——WebSocket 优先（实时推送），
 * 连接失败 3 次或异常断开时降级为带版本号的 HTTP 轮询；onShow 启动、onHide 停止。
 *
 * 飞行棋特有：两阶段回合（roll 掷骰 → move 选机），服务端主动推进阶段超时
 * （Timer 清扫器 + 写操作懒检查），客户端只做本地倒计时展示，
 * 归零时拉一次权威状态兜底（懒检查触发点）。
 */

import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, gomokuWsUrl } from '@/services/toolbox'
import {
  createLudoRoom,
  fetchLudoRoomState,
  joinLudoRoom,
  leaveLudoRoom,
  ludoRematch,
  movePlane,
  rollDice,
  startLudoGame,
  toggleAuto,
} from '@/services/ludo'
import type { LudoMoveItem, LudoRoomState, LudoWsFrame } from '@/types/ludo'

const WS_MAX_FAILURES = 3
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const HEARTBEAT_MS = 25000
const POLL_INTERVALS = { waiting: 3000, playing: 1500, finished: 4000 } as const
const POLL_MAX_BACKOFF_MS = 10000

export function useLudoRoom() {
  const state = ref<LudoRoomState | null>(null)
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
  const opponents = computed(() => {
    const current = state.value
    if (!current) return []
    return current.players.filter((p) => p.seat !== current.mySeat)
  })
  /** 当前是否处于我的「选机走子」阶段。 */
  const isMyMovePhase = computed(
    () => isMyTurn.value && state.value?.phase === 'move',
  )
  /** 我的合法走法（move 阶段高亮可走的机）。 */
  const myLegalMoves = computed<LudoMoveItem[]>(() =>
    isMyMovePhase.value ? (state.value?.legalMoves ?? []) : [],
  )
  /** 我的托管状态。 */
  const myAuto = computed(() => myPlayer.value?.auto ?? false)

  /** 某架飞机当前能否走（即时高亮；权威以后端为准）。 */
  function canMovePlane(planeIdx: number): boolean {
    return myLegalMoves.value.some((m) => m.p === planeIdx)
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
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  /** 倒计时归零后以 1s 间隔拉权威状态，直到版本变化（Timer 清扫有 ~1s 延迟 + 网络 RTT）。 */
  let zeroPollTimer: ReturnType<typeof setInterval> | null = null

  function clearCountdownTimer() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    if (zeroPollTimer) {
      clearInterval(zeroPollTimer)
      zeroPollTimer = null
    }
  }

  function syncCountdowns() {
    clearCountdownTimer()
    const current = state.value
    turnCountdown.value = current?.status === 'playing' ? current.turnTtl : 0
    if (!current || current.status !== 'playing' || !myCode.value) return
    countdownTimer = setInterval(() => {
      if (turnCountdown.value > 0) turnCountdown.value--
      if (turnCountdown.value === 0) {
        clearCountdownTimer()
        zeroPollTimer = setInterval(() => {
          void fetchLudoRoomState(myCode.value, 0)
            .then((fresh) => {
              if (fresh.changed) applyState(fresh as unknown as LudoRoomState)
            })
            .catch(() => {})
        }, 1000)
      }
    }, 1000)
  }

  /** 应用远端状态；版本更旧的帧直接丢弃（防乱序）。 */
  function applyState(next: LudoRoomState) {
    if (state.value && next.version < state.value.version && next.code === state.value.code) return
    if (state.value && next.code !== state.value.code) return
    state.value = next
    syncCountdowns()
  }

  async function enterRoom(next: LudoRoomState) {
    state.value = next
    myCode.value = next.code
    startSync()
  }

  async function createAndEnter() {
    await enterRoom(await createLudoRoom())
  }

  async function joinByCode(code: string) {
    if (!/^[0-9]{4}$/.test(code)) {
      toast('房间码是 4 位数字')
      return
    }
    await enterRoom(await joinLudoRoom(code))
  }

  /** 动作统一入口：busy 锁 + 错误 toast；成功以权威回包落地。 */
  async function act(action: () => Promise<LudoRoomState>) {
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
    await act(() => startLudoGame(current.code))
  }

  /** 掷骰（roll 阶段专属）。 */
  async function roll() {
    const current = state.value
    if (!current) return
    if (!isMyTurn.value || current.phase !== 'roll') return
    await act(() => rollDice(current.code))
  }

  /** 走子（move 阶段专属，plane 必须在合法走法内）。 */
  async function move(planeIdx: number) {
    const current = state.value
    if (!current) return
    if (!isMyMovePhase.value || !canMovePlane(planeIdx)) return
    await act(() => movePlane(current.code, planeIdx))
  }

  /** 托管开关（开启后本人回合立即由服务端代走）。 */
  async function setAuto(on: boolean) {
    const current = state.value
    if (!current || !isSeated.value) return
    await act(() => toggleAuto(current.code, on))
  }

  async function requestRematch() {
    const current = state.value
    if (!current) return
    await act(() => ludoRematch(current.code))
  }

  async function exitRoom() {
    const current = state.value
    const seated = isSeated.value
    stopSync()
    state.value = null
    myCode.value = ''
    if (!current || !seated) return
    try {
      await leaveLudoRoom(current.code)
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
      url: gomokuWsUrl('/ludo/ws', { token, code: myCode.value }),
      complete: () => {},
    })
    socket.onOpen(() => {
      wsFailures = 0
      heartbeatTimer = setInterval(() => {
        socket?.send({ data: '{"type":"ping"}' })
      }, HEARTBEAT_MS)
    })
    socket.onMessage((event) => {
      let frame: LudoWsFrame
      try {
        frame = JSON.parse(String(event.data)) as LudoWsFrame
      } catch {
        return
      }
      if (frame.type === 'state' && frame.state) applyState(frame.state)
      if (frame.type === 'error') toast(frame.message ?? '连接异常')
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
      const response = await fetchLudoRoomState(myCode.value, state.value?.version ?? 0)
      pollFailures = 0
      // 后端协议：changed:true 的响应即完整状态（serialize 各字段与 changed 合并返回）
      if (response.changed) applyState(response as unknown as LudoRoomState)
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
    isMyMovePhase,
    myLegalMoves,
    myPlayer,
    myAuto,
    opponents,
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
  }
}
