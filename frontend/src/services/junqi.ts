/** 军棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { JunqiLayoutPiece, JunqiRoomState, JunqiStateResponse } from '@/types/junqi'

/** 创建房间（创建者临时坐红；红蓝只是座位标签，先手由猜拳定）。 */
export function createRoom(): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>('/api/junqi/room', 'POST')
}

export function joinRoom(code: string): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/join`, 'POST')
}

/** 提交布阵并就绪（25 项 {rank,r,c}，己方半场绝对坐标；服务端校验约束）。 */
export function submitLayout(code: string, pieces: JunqiLayoutPiece[]): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/layout`, 'POST', { pieces })
}

/** 猜拳出拳（r/p/s），胜者先行。 */
export function rpsRoom(code: string, pick: string): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/rps`, 'POST', { pick })
}

export function fetchRoomState(code: string, since: number): Promise<JunqiStateResponse> {
  return requestUserApi<JunqiStateResponse>(`/api/junqi/room/${code}?since=${since}`, 'GET')
}

export function movePiece(code: string, fr: number, fc: number, tr: number, tc: number): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/move`, 'POST', { fr, fc, tr, tc })
}

export function rematch(code: string): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/leave`, 'POST')
}

/** 房间聊天（phrase 传 id / emoji 传表情字符 / sticker 传 id / text 传文字）。 */
export function sendJunqiChat(code: string, kind: string, payload: { id?: string; text?: string }): Promise<JunqiRoomState> {
  return requestUserApi<JunqiRoomState>(`/api/junqi/room/${code}/chat`, 'POST', { kind, ...payload })
}
