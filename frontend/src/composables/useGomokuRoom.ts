/**
 * 五子棋房间状态机：双通道同步——WebSocket 优先（实时推送），
 * 连接失败 3 次或异常断开时降级为带版本号的 HTTP 轮询；onShow 启动、onHide 停止。
 */

import { computed, ref } from 'vue'
import { AUTH_STORAGE_KEY, gomokuWsUrl } from '@/services/toolbox'
import { createRoom, fetchRoomState, joinRoom, leaveRoom, placeMove, rematch, requestUndo, respondUndo } from '@/services/gomoku'
import type { GomokuColor, GomokuRoomState, GomokuWsFrame } from '@/types/gomoku'

const WS_MAX_FAILURES = 3
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const HEARTBEAT_MS = 25000
const POLL_INTERVALS = { waiting: 3000, playing: 1500, finished: 4000 } as const
const POLL_MAX_BACKOFF_MS = 10000

export function useGomokuRoom() {
  const state = ref<GomokuRoomState | null>(null)
  const transport = ref<'ws' | 'polling'>('ws')
  const placing = ref(false)
  const myCode = ref('')

  const myColor = computed<GomokuColor | null>(() => {
    const role = state.value?.myRole
    return role === 'black' || role === 'white' ? role : null
  })
  const isSeated = computed(() => myColor.value !== null)
  const isMyTurn = computed(
    () => state.value?.status === 'playing' && state.value.turn !== null && state.value.turn === myColor.value,
  )
  const opponent = computed(() => {
    if (!state.value || !isSeated.value) return null
    return myColor.value === 'black' ? state.value.white : state.value.black
  })

  /** 我可发起悔棋：对局进行中、轮到我方对面（即最后一手是我落的）、有剩余次数、无未决请求。 */
  const canRequestUndo = computed(() => {
    const current = state.value
    if (!current || current.status !== 'playing' || !isSeated.value || !myColor.value) return false
    if (current.movesCount === 0 || current.turn !== null && current.turn === myColor.value) return false
    if (current.undo.pending !== null) return false
    return current.undo.remaining[myColor.value] > 0
  })

  /** 对方发了悔棋请求等我处理。 */
  const undoPendingForMe = computed(() => {
    const current = state.value
    if (!current || current.status !== 'playing' || !isSeated.value) return false
    return current.undo.pending !== null && !current.undo.pendingMine
  })

  const undoRemaining = computed(() => {
    const current = state.value
    if (!current || !myColor.value) return 0
    return current.undo.remaining[myColor.value]
  })

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

  /** 悔棋决策倒计时（秒），0 表示无未决请求。 */
  const undoCountdown = ref(0)
  let undoTimer: ReturnType<typeof setInterval> | null = null

  function clearUndoTimer() {
    if (undoTimer) {
      clearInterval(undoTimer)
      undoTimer = null
    }
    undoCountdown.value = 0
  }

  /** 远端状态落地后同步悔棋倒计时；归零时自动拉权威状态（服务器已惰性过期该请求）。 */
  function syncUndoCountdown() {
    clearUndoTimer()
    const ttl = state.value?.undo.pending !== null && state.value?.undo.pending !== undefined ? state.value.undo.pendingTtl : 0
    if (!ttl || !myCode.value) return
    undoCountdown.value = ttl
    undoTimer = setInterval(() => {
      undoCountdown.value--
      if (undoCountdown.value <= 0) {
        clearUndoTimer()
        void fetchRoomState(myCode.value, 0)
          .then((fresh) => {
            if (fresh.changed) applyState(fresh)
          })
          .catch(() => {})
      }
    }, 1000)
  }

  /** 应用远端状态；版本更旧的帧直接丢弃（防乱序）。 */
  function applyState(next: GomokuRoomState) {
    if (state.value && next.version < state.value.version && next.code === state.value.code) return
    if (state.value && next.code !== state.value.code) return
    state.value = next
    syncUndoCountdown()
  }

  async function enterRoom(next: GomokuRoomState) {
    state.value = next
    myCode.value = next.code
    startSync()
  }

  async function createAndEnter(color: GomokuColor) {
    await enterRoom(await createRoom(color))
  }

  async function joinByCode(code: string) {
    if (!/^[0-9]{4}$/.test(code)) {
      toast('房间码是 4 位数字')
      return
    }
    await enterRoom(await joinRoom(code))
  }

  async function tapIntersection(x: number, y: number) {
    const current = state.value
    if (!current || placing.value) return
    // 悔棋请求未处理前禁止落子：必须先同意或拒绝
    if (current.undo.pending !== null) {
      toast(current.undo.pendingMine ? '等待对方处理悔棋请求' : '对方请求悔棋，请先处理')
      return
    }
    if (!isMyTurn.value) {
      toast(current.status === 'playing' ? '还没轮到你' : '对局不在进行中')
      return
    }
    placing.value = true
    // 乐观渲染：本地先落子，服务端返回后以权威状态为准
    state.value = { ...current, moves: [...current.moves, { x, y }] }
    try {
      applyState(await placeMove(current.code, x, y))
    } catch (error) {
      // 回滚：期间可能已有 WS 推送，直接拉权威状态而不是恢复旧快照
      try {
        const fresh = await fetchRoomState(current.code, 0)
        if (fresh.changed) applyState(fresh)
      } catch {
        state.value = current
      }
      toast(error instanceof Error ? error.message : '落子失败')
    } finally {
      placing.value = false
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

  async function askUndo() {
    const current = state.value
    if (!current || !canRequestUndo.value) return
    try {
      applyState(await requestUndo(current.code))
      toast('已发送悔棋请求，等待对方同意')
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败')
    }
  }

  async function answerUndo(accept: boolean) {
    const current = state.value
    if (!current || !undoPendingForMe.value) return
    try {
      applyState(await respondUndo(current.code, accept))
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
    socket = uni.connectSocket({
      url: gomokuWsUrl('/gomoku/ws', { token, code: myCode.value }),
      complete: () => {},
    })
    socket.onOpen(() => {
      wsFailures = 0
      heartbeatTimer = setInterval(() => {
        socket?.send({ data: '{"type":"ping"}' })
      }, HEARTBEAT_MS)
    })
    socket.onMessage((event) => {
      let frame: GomokuWsFrame
      try {
        frame = JSON.parse(String(event.data)) as GomokuWsFrame
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
    clearUndoTimer()
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  return {
    state,
    transport,
    placing,
    myCode,
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
    tapIntersection,
    requestRematch,
    askUndo,
    answerUndo,
    exitRoom,
    startSync,
    stopSync,
  }
}
