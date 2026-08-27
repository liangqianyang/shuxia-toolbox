/** UNO 房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { UnoColor, UnoRoomState, UnoStateResponse } from '@/types/uno'

export function createRoom(): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>('/api/uno/room', 'POST')
}

export function joinRoom(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/join`, 'POST')
}

export function fetchRoomState(code: string, since: number): Promise<UnoStateResponse> {
  return requestUserApi<UnoStateResponse>(`/api/uno/room/${code}?since=${since}`, 'GET')
}

export function startGame(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/start`, 'POST')
}

export function playCard(code: string, card: string, chosenColor: UnoColor | null, declaredUno: boolean): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/play`, 'POST', {
    card,
    chosenColor: chosenColor ?? '',
    declaredUno,
  })
}

export function drawCard(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/draw`, 'POST')
}

export function passTurn(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/pass`, 'POST')
}

export function challengeWild4(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/challenge`, 'POST')
}

export function declareUno(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/declare-uno`, 'POST')
}

export function catchUno(code: string, seat: number): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/catch-uno`, 'POST', { seat })
}

export function rematch(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/leave`, 'POST')
}
