/**
 * 枫趣冒险房间状态机：双通道同步——WebSocket 优先（实时推送），
 * 连接失败 3 次或异常断开时降级为带版本号的 HTTP 轮询；onShow 启动、onHide 停止。
 * 断线重连 = 同 token 重新握手（服务端替换旧 fd 并立即推全量首帧）。
 *
 * 冒险棋特有：单一 deadline 覆盖所有窗口（掷骰 20s/道具确认 10s/选择 8s/决斗 10s），
 * 客户端只有一个倒计时展示；窗口归属由 pendingChoice/pendingDuel 表达，
 * 合法动作全部服务端下发，客户端不做重算。聊天不占 acting 锁（不打断操作）。
 */

import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, gomokuWsUrl } from '@/services/toolbox'
import {
  adventureRematch,
  chooseAdventureOption,
  configAdventureRoom,
  confirmAdventureMove,
  createAdventureRoom,
  fetchAdventureRoomState,
  fetchMyAdventureRooms,
  joinAdventureRoom,
  leaveAdventureRoom,
  playAdventureItem,
  placeAdventureBet,
  resumeAdventureRoom,
  rollAdventureDice,
  saveAdventureRoom,
  sendAdventureChat,
  startAdventureGame,
  submitAdventureDuel,
  toggleAdventureAuto,
} from '../services/adventure'
import type {
  AdventureMyRoom,
  AdventureRoomState,
  AdventureWsFrame,
} from '@/types/adventure'

const WS_MAX_FAILURES = 3
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const HEARTBEAT_MS = 25000
const POLL_INTERVALS = { waiting: 3000, playing: 1500, finished: 4000 } as const
const POLL_MAX_BACKOFF_MS = 10000

export function useAdventureRoom() {
  const state = ref<AdventureRoomState | null>(null)
  const transport = ref<'ws' | 'polling'>('ws')
  const acting = ref(false)
  const myCode = ref('')
  const myRooms = ref<AdventureMyRoom[]>([])

  const isSeated = computed(() => state.value?.mySeat !== null && state.value?.mySeat !== undefined)
  const mySeat = computed<number | null>(() => state.value?.mySeat ?? null)
  const isOwner = computed(() => isSeated.value && state.value?.ownerSeat === state.value?.mySeat)
  const inPlay = computed(() => state.value?.status === 'playing' || state.value?.status === 'saved')
  const isMyTurn = computed(
    () => state.value?.status === 'playing' && state.value.currentSeat !== null && state.value.currentSeat === state.value.mySeat,
  )
  /** 我的「掷骰后决策」窗口（可打道具 + 确认走子）。 */
  const isMyResolve = computed(() => isMyTurn.value && state.value?.phase === 'resolve')
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
  /** 当前等待我操作的选择窗。 */
  const myChoice = computed(() => {
    const choice = state.value?.pendingChoice
    return choice && choice.mine ? choice : null
  })
  /** 我参与的决斗窗。 */
  const myDuel = computed(() => {
    const duel = state.value?.pendingDuel
    return duel && duel.mine ? duel : null
  })
  const myAuto = computed(() => myPlayer.value?.auto ?? false)

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
    turnCountdown.value = current && (current.status === 'playing') ? current.turnTtl : 0
    if (!current || current.status !== 'playing' || !myCode.value) return
    countdownTimer = setInterval(() => {
      if (turnCountdown.value > 0) turnCountdown.value--
      if (turnCountdown.value === 0) {
        clearCountdownTimer()
        zeroPollTimer = setInterval(() => {
          void fetchAdventureRoomState(myCode.value, 0)
            .then((fresh) => {
              if (fresh.changed) applyState(fresh as unknown as AdventureRoomState)
            })
            .catch(() => {})
        }, 1000)
      }
    }, 1000)
  }

  /** 应用远端状态；版本更旧的帧直接丢弃（防乱序）。 */
  function applyState(next: AdventureRoomState) {
    if (state.value && next.version < state.value.version && next.code === state.value.code) return
    if (state.value && next.code !== state.value.code) return
    state.value = next
    syncCountdowns()
  }

  async function enterRoom(next: AdventureRoomState) {
    state.value = next
    myCode.value = next.code
    startSync()
  }

  async function createAndEnter() {
    await enterRoom(await createAdventureRoom())
  }

  async function joinByCode(code: string) {
    if (!/^[0-9]{4}$/.test(code)) {
      toast('房间码是 4 位数字')
      return
    }
    await enterRoom(await joinAdventureRoom(code))
  }

  async function refreshMyRooms() {
    try {
      myRooms.value = await fetchMyAdventureRooms()
    } catch {
      myRooms.value = []
    }
  }

  /** 动作统一入口：busy 锁 + 错误 toast；成功以权威回包落地。 */
  async function act(action: () => Promise<AdventureRoomState>) {
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
    await act(() => startAdventureGame(current.code))
  }

  /** 房主在等待室设定路线长度（40/60/80/100）。 */
  async function setGoal(goal: number) {
    const current = state.value
    if (!current) return
    await act(() => configAdventureRoom(current.code, goal))
  }

  /** 掷骰（act 阶段专属）。 */
  async function roll() {
    const current = state.value
    if (!current) return
    if (!isMyTurn.value || current.phase !== 'act') return
    await act(() => rollAdventureDice(current.code))
  }

  /** 打道具（resolve 窗口或自己回合任意阶段，按道具 when 约束）。 */
  async function useItem(id: string, targetSeat?: number) {
    const current = state.value
    if (!current || !isMyTurn.value) return
    await act(() => playAdventureItem(current.code, id, targetSeat))
  }

  /** 确认走子（resolve 阶段专属）。 */
  async function confirmMove() {
    const current = state.value
    if (!current) return
    if (!isMyResolve.value) return
    await act(() => confirmAdventureMove(current.code))
  }

  /** 选择窗提交（岔路/埋伏/商店/山神/擂台）。 */
  async function choose(value: string) {
    const current = state.value
    if (!current) return
    await act(() => chooseAdventureOption(current.code, value))
  }

  /** 决斗输入（选人/出拳/暗标）。 */
  async function duel(value: string | number) {
    const current = state.value
    if (!current) return
    await act(() => submitAdventureDuel(current.code, value))
  }

  /** 决斗押注（旁观者）。 */
  async function bet(onSeat: number) {
    const current = state.value
    if (!current) return
    await act(() => placeAdventureBet(current.code, onSeat))
  }

  /** 托管开关（开启后本人回合立即由服务端代走）。 */
  async function setAuto(on: boolean) {
    const current = state.value
    if (!current || !isSeated.value) return
    await act(() => toggleAdventureAuto(current.code, on))
  }

  /** 房主保存对局（下次继续）。 */
  async function saveRoom() {
    const current = state.value
    if (!current) return
    await act(() => saveAdventureRoom(current.code))
  }

  /** 继续已保存的对局。 */
  async function resumeRoom() {
    const current = state.value
    if (!current) return
    await act(() => resumeAdventureRoom(current.code))
  }

  /** 聊天：不用 acting 锁（不打断对局操作），失败由 toast 提示。 */
  async function sendChat(kind: string, payload: { id?: string; text?: string }): Promise<boolean> {
    const current = state.value
    if (!current) return false
    try {
      applyState(await sendAdventureChat(current.code, kind, payload))
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : '发送失败')
      return false
    }
  }

  async function requestRematch() {
    const current = state.value
    if (!current) return
    await act(() => adventureRematch(current.code))
  }

  async function exitRoom() {
    const current = state.value
    const seated = isSeated.value
    stopSync()
    state.value = null
    myCode.value = ''
    if (!current || !seated) return
    try {
      await leaveAdventureRoom(current.code)
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
      url: gomokuWsUrl('/adventure/ws', { token, code: myCode.value }),
      complete: () => {},
    })
    socket.onOpen(() => {
      wsFailures = 0
      heartbeatTimer = setInterval(() => {
        socket?.send({ data: '{"type":"ping"}' })
      }, HEARTBEAT_MS)
    })
    socket.onMessage((event) => {
      let frame: AdventureWsFrame
      try {
        frame = JSON.parse(String(event.data)) as AdventureWsFrame
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
      const response = await fetchAdventureRoomState(myCode.value, state.value?.version ?? 0)
      pollFailures = 0
      // 后端协议：changed:true 的响应即完整状态（serialize 各字段与 changed 合并返回）
      if (response.changed) applyState(response as unknown as AdventureRoomState)
    } catch {
      pollFailures++
    }
    const status = state.value?.status ?? 'waiting'
    const base = status === 'playing' || status === 'saved'
      ? POLL_INTERVALS.playing
      : status === 'finished'
        ? POLL_INTERVALS.finished
        : POLL_INTERVALS.waiting
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
    myRooms,
    isSeated,
    mySeat,
    isOwner,
    inPlay,
    isMyTurn,
    isMyResolve,
    myPlayer,
    myAuto,
    myChoice,
    myDuel,
    opponents,
    turnCountdown,
    refreshMyRooms,
    createAndEnter,
    joinByCode,
    start,
    setGoal,
    roll,
    useItem,
    confirmMove,
    choose,
    duel,
    bet,
    setAuto,
    saveRoom,
    resumeRoom,
    sendChat,
    requestRematch,
    exitRoom,
    startSync,
    stopSync,
  }
}
