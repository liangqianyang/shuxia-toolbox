/** 象棋房间 HTTP 接口薄封装：自动 wx.login + 401 重试由 requestUserApi 提供。 */

import { requestUserApi } from '@/services/toolbox'
import type { XiangqiRoomState, XiangqiStateResponse } from '@/types/xiangqi'

/** 创建房间（创建者临时坐红；猜拳胜者执红先行）。 */
export function createRoom(): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>('/api/xiangqi/room', 'POST')
}

export function joinRoom(code: string): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/join`, 'POST')
}

/** 猜拳出拳（r/p/s），胜者执红先行。 */
export function rpsRoom(code: string, pick: string): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/rps`, 'POST', { pick })
}

export function fetchRoomState(code: string, since: number): Promise<XiangqiStateResponse> {
  return requestUserApi<XiangqiStateResponse>(`/api/xiangqi/room/${code}?since=${since}`, 'GET')
}

export function movePiece(code: string, fr: number, fc: number, tr: number, tc: number): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/move`, 'POST', { fr, fc, tr, tc })
}

export function rematch(code: string): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/leave`, 'POST')
}

/** 房间聊天（phrase 传 id / emoji 传表情字符 / sticker 传 id / text 传文字）。 */
export function sendXiangqiChat(code: string, kind: string, payload: { id?: string; text?: string }): Promise<XiangqiRoomState> {
  return requestUserApi<XiangqiRoomState>(`/api/xiangqi/room/${code}/chat`, 'POST', { kind, ...payload })
}
