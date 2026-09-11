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

export function dealerDraw(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/dealer-draw`, 'POST')
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

export function declineChallenge(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/decline-challenge`, 'POST')
}

export function chooseColor(code: string, color: UnoColor): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/choose-color`, 'POST', { color })
}

export function declareUno(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/declare-uno`, 'POST')
}

export function catchUno(code: string, seat: number): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/catch-uno`, 'POST', { seat })
}

/** 房间聊天：phrase 传快捷句 id；emoji 传表情字符本身；text 传自由文字（服务端过审）。 */
export function sendChatMessage(code: string, kind: 'phrase' | 'emoji' | 'text', value: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/chat`, 'POST', {
    kind,
    id: kind === 'text' ? '' : value,
    text: kind === 'text' ? value : '',
  })
}

export function rematch(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<UnoRoomState> {
  return requestUserApi<UnoRoomState>(`/api/uno/room/${code}/leave`, 'POST')
}
