/**
 * 军棋房间状态机：双通道同步——WebSocket 优先（实时推送），
 * 连接失败 3 次或异常断开时降级为带版本号的 HTTP 轮询；onShow 启动、onHide 停止。
 * 走子/布阵都不做乐观提交（战斗裁决与约束校验在服务端）：提交后以服务端权威状态为准，
 * 失败拉回权威态。
 */

import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, gomokuWsUrl } from '@/services/toolbox'
import { createRoom, fetchRoomState, joinRoom, leaveRoom, movePiece, rematch, rpsRoom, sendJunqiChat, submitLayout } from '@/services/junqi'
import type { JunqiLayoutPiece, JunqiRoomState, JunqiSide, JunqiWsFrame } from '@/types/junqi'

const WS_MAX_FAILURES = 3
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const HEARTBEAT_MS = 25000
const POLL_INTERVALS = { waiting: 3000, layout: 2500, rps: 1500, playing: 1500, finished: 4000 } as const
const POLL_MAX_BACKOFF_MS = 10000

export function useJunqiRoom() {
  const state = ref<JunqiRoomState | null>(null)
  const transport = ref<'ws' | 'polling'>('ws')
  const moving = ref(false)
  const myCode = ref('')

  const myColor = computed<JunqiSide | null>(() => {
    const role = state.value?.myRole
    return role === 'red' || role === 'blue' ? role : null
  })
  const isSeated = computed(() => myColor.value !== null)
  const isMyTurn = computed(
    () => state.value?.status === 'playing' && state.value.turn !== null && state.value.turn === myColor.value,
  )
  const opponent = computed(() => {
    if (!state.value || !isSeated.value) return null
    return myColor.value === 'red' ? state.value.blue : state.value.red
  })

  let socket: UniApp.SocketTask | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let wsFailures = 0
  let wsAttempt = 0
  let connectWatchdog: ReturnType<typeof setTimeout> | null = null
  let pollFailures = 0
  let running = false
  let manuallyClosed = false

  function toast(message: string) {
    uni.showToast({ title: message, icon: 'none' })
  }

  /** 应用远端状态；版本更旧的帧直接丢弃（防乱序）。 */
  function applyState(next: JunqiRoomState) {
    if (state.value && next.version < state.value.version && next.code === state.value.code) return
    if (state.value && next.code !== state.value.code) return
    state.value = next
  }

  async function enterRoom(next: JunqiRoomState) {
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

  /** 提交布阵并就绪（layout 阶段）。 */
  async function readyLayout(pieces: JunqiLayoutPiece[]) {
    const current = state.value
    if (!current || moving.value) return
    moving.value = true
    try {
      applyState(await submitLayout(current.code, pieces))
    } catch (error) {
      try {
        const fresh = await fetchRoomState(current.code, 0)
        if (fresh.changed) applyState(fresh)
      } catch {
        /* 网络异常时保留当前展示，等下一次同步 */
      }
      toast(error instanceof Error ? error.message : '布阵提交失败')
    } finally {
      moving.value = false
    }
  }

  async function submitMove(fr: number, fc: number, tr: number, tc: number) {
    const current = state.value
    if (!current || moving.value) return
    if (!isMyTurn.value) {
      toast(current.status === 'playing' ? '还没轮到你' : '对局不在进行中')
      return
    }
    moving.value = true
    try {
      applyState(await movePiece(current.code, fr, fc, tr, tc))
    } catch (error) {
      // 不做本地回滚：期间可能已有 WS 推送，直接拉权威状态
      try {
        const fresh = await fetchRoomState(current.code, 0)
        if (fresh.changed) applyState(fresh)
      } catch {
        /* 网络异常时保留当前展示，等下一次同步 */
      }
      toast(error instanceof Error ? error.message : '走子失败')
    } finally {
      moving.value = false
    }
  }

  async function requestRematch() {
    const current = state.value
    if (!current) return
    try {
      applyState(await rematch(current.code))
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败')
    }
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
    const attempt = ++wsAttempt
    socket = uni.connectSocket({
      url: gomokuWsUrl('/junqi/ws', { token, code: myCode.value }),
      complete: () => {},
    })
    socket.onOpen(() => {
      if (attempt !== wsAttempt) return
      if (connectWatchdog) { clearTimeout(connectWatchdog); connectWatchdog = null }
      wsFailures = 0
      heartbeatTimer = setInterval(() => {
        socket?.send({ data: '{"type":"ping"}' })
      }, HEARTBEAT_MS)
    })
    socket.onMessage((event) => {
      let frame: JunqiWsFrame
      try {
        frame = JSON.parse(String(event.data)) as JunqiWsFrame
      } catch {
        return
      }
      if (frame.type === 'state') applyState(frame.state)
      if (frame.type === 'error') toast(frame.message)
    })
    // 连接看门狗：部分平台连不上时既不回调 onError 也不回调 onClose，超时按失败处理
    connectWatchdog = setTimeout(() => handleWsFailure(attempt), 6000)
    socket.onClose(() => handleWsFailure(attempt))
    // onError 后 onClose 不保证触发（连接从未建立时部分平台不回调）——失败处理不能只挂在 onClose 上
    socket.onError(() => {
      socket?.close({})
      handleWsFailure(attempt)
    })
  }

  function clearConnectWatchdog() {
    if (connectWatchdog) {
      clearTimeout(connectWatchdog)
      connectWatchdog = null
    }
  }

  /** 统一 WS 失败处理：计数 → 重试或降级轮询；attempt 防陈旧回调/重复计数。 */
  function handleWsFailure(attempt: number) {
    if (attempt !== wsAttempt || !running || manuallyClosed || transport.value !== 'ws') return
    clearHeartbeat()
    clearConnectWatchdog()
    wsFailures++
    if (wsFailures >= WS_MAX_FAILURES) {
      degradeToPolling()
      return
    }
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connectWs, RECONNECT_DELAYS[Math.min(wsFailures - 1, RECONNECT_DELAYS.length - 1)])
  }

  function closeWs() {
    manuallyClosed = true
    clearHeartbeat()
    clearConnectWatchdog()
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
    const base = (POLL_INTERVALS as Record<string, number>)[status] ?? POLL_INTERVALS.waiting
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
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /** 猜拳出拳（rps 阶段）。 */
  async function rps(pick: string) {
    const current = state.value
    if (!current) return
    applyState(await rpsRoom(current.code, pick))
  }

  /** 聊天：不用 busy 锁（不打断对局操作），失败由 toast 提示。 */
  async function sendChat(kind: string, payload: { id?: string; text?: string }): Promise<boolean> {
    const current = state.value
    if (!current) return false
    try {
      applyState(await sendJunqiChat(current.code, kind, payload))
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : '发送失败')
      return false
    }
  }

  return {
    rps,
    sendChat,
    state,
    transport,
    moving,
    myCode,
    isSeated,
    myColor,
    isMyTurn,
    opponent,
    createAndEnter,
    joinByCode,
    readyLayout,
    submitMove,
    requestRematch,
    exitRoom,
    startSync,
    stopSync,
  }
}
