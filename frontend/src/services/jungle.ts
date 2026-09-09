/** 斗兽棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { JungleRoomState, JungleStateResponse } from '@/types/jungle'

/** 执子颜色由开局猜拳定选边（胜者选执红/执蓝），创建不传色。 */
export function createRoom(): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>('/api/jungle/room', 'POST')
}

/** 猜拳出拳（r/p/s）。 */
export function rpsRoom(code: string, pick: string): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/rps`, 'POST', { pick })
}

/** 胜者选边（red/blue；红先）。 */
export function chooseJungleColor(code: string, color: string): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/choose-color`, 'POST', { color })
}

export function joinRoom(code: string): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/join`, 'POST')
}

export function fetchRoomState(code: string, since: number): Promise<JungleStateResponse> {
  return requestUserApi<JungleStateResponse>(`/api/jungle/room/${code}?since=${since}`, 'GET')
}

export function movePiece(code: string, fr: number, fc: number, tr: number, tc: number): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/move`, 'POST', { fr, fc, tr, tc })
}

export function rematch(code: string): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/leave`, 'POST')
}

/** 房间聊天（phrase 传 id / emoji 传表情字符 / sticker 传 id / text 传文字）。 */
export function sendJungleChat(code: string, kind: string, payload: { id?: string; text?: string }): Promise<JungleRoomState> {
  return requestUserApi<JungleRoomState>(`/api/jungle/room/${code}/chat`, 'POST', { kind, ...payload })
}
