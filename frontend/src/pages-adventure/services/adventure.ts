/** 枫趣冒险房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { AdventureMyRoom, AdventureRoomState, AdventureStateResponse } from '@/types/adventure'

export function createAdventureRoom(): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>('/api/adventure/room', 'POST')
}

export function joinAdventureRoom(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/join`, 'POST')
}

export function fetchAdventureRoomState(code: string, since: number): Promise<AdventureStateResponse> {
  return requestUserApi<AdventureStateResponse>(`/api/adventure/room/${code}?since=${since}`, 'GET')
}

export function fetchMyAdventureRooms(): Promise<AdventureMyRoom[]> {
  return requestUserApi<AdventureMyRoom[]>('/api/adventure/my-rooms', 'GET')
}

export function startAdventureGame(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/start`, 'POST')
}

export function rollAdventureDice(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/roll`, 'POST')
}

export function playAdventureItem(code: string, id: string, targetSeat?: number): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/item`, 'POST', {
    id,
    target: targetSeat ?? null,
  })
}

export function confirmAdventureMove(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/move`, 'POST')
}

export function chooseAdventureOption(code: string, value: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/choose`, 'POST', { value })
}

/** value：选人阶段=对手座位；猜拳='r'|'p'|'s'；暗标=数字。 */
export function submitAdventureDuel(code: string, value: string | number): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/duel`, 'POST', { value })
}

export function placeAdventureBet(code: string, onSeat: number): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/bet`, 'POST', { on: onSeat })
}

export function toggleAdventureAuto(code: string, on: boolean): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/auto`, 'POST', { on })
}

export function saveAdventureRoom(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/save`, 'POST')
}

export function resumeAdventureRoom(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/resume`, 'POST')
}

export function sendAdventureChat(code: string, kind: string, payload: { id?: string; text?: string }): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/chat`, 'POST', { kind, ...payload })
}

export function adventureRematch(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/rematch`, 'POST')
}

export function leaveAdventureRoom(code: string): Promise<AdventureRoomState> {
  return requestUserApi<AdventureRoomState>(`/api/adventure/room/${code}/leave`, 'POST')
}
