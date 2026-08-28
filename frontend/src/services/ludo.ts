/** 飞行棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { LudoRoomState, LudoStateResponse } from '@/types/ludo'

export function createLudoRoom(): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>('/api/ludo/room', 'POST')
}

export function joinLudoRoom(code: string): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/join`, 'POST')
}

export function fetchLudoRoomState(code: string, since: number): Promise<LudoStateResponse> {
  return requestUserApi<LudoStateResponse>(`/api/ludo/room/${code}?since=${since}`, 'GET')
}

export function startLudoGame(code: string): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/start`, 'POST')
}

export function rollDice(code: string): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/roll`, 'POST')
}

export function movePlane(code: string, plane: number): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/move`, 'POST', { plane })
}

export function toggleAuto(code: string, on: boolean): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/auto`, 'POST', { on })
}

export function ludoRematch(code: string): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/rematch`, 'POST')
}

export function leaveLudoRoom(code: string): Promise<LudoRoomState> {
  return requestUserApi<LudoRoomState>(`/api/ludo/room/${code}/leave`, 'POST')
}
