/** 五子棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { GomokuRoomState, GomokuStateResponse } from '@/types/gomoku'

/** 执子颜色由开局猜拳定选边，创建不再传色。 */
export function createRoom(): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>('/api/gomoku/room', 'POST')
}

/** 猜拳出拳（r/p/s）。 */
export function rpsRoom(code: string, pick: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/rps`, 'POST', { pick })
}

/** 胜者选边（black/white）。 */
export function chooseGomokuColor(code: string, color: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/choose-color`, 'POST', { color })
}

export function joinRoom(code: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/join`, 'POST')
}

export function fetchRoomState(code: string, since: number): Promise<GomokuStateResponse> {
  return requestUserApi<GomokuStateResponse>(`/api/gomoku/room/${code}?since=${since}`, 'GET')
}

export function placeMove(code: string, x: number, y: number): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/move`, 'POST', { x, y })
}

export function rematch(code: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/rematch`, 'POST')
}

export function requestUndo(code: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/undo-request`, 'POST')
}

export function respondUndo(code: string, accept: boolean): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/undo-respond`, 'POST', { accept })
}

export function leaveRoom(code: string): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>(`/api/gomoku/room/${code}/leave`, 'POST')
}
