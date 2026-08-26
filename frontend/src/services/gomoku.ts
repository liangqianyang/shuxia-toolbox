/** 五子棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { GomokuColor, GomokuRoomState, GomokuStateResponse } from '@/types/gomoku'

export function createRoom(color: GomokuColor): Promise<GomokuRoomState> {
  return requestUserApi<GomokuRoomState>('/api/gomoku/room', 'POST', { color })
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
