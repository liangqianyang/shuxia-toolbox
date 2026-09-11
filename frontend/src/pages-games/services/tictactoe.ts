/** 井字棋房间 HTTP 接口薄封装。 */

import { requestUserApi } from '@/services/toolbox'
import type { TicTacToeRoomState, TicTacToeStateResponse } from '@/types/tictactoe'

/** 创建房间（创建者临时坐 X；首局猜拳定 X）。 */
export function createRoom(): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>('/api/tictactoe/room', 'POST')
}

export function joinRoom(code: string): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/join`, 'POST')
}

/** 猜拳出拳（r/p/s），胜者执 X 先行。 */
export function rpsRoom(code: string, pick: string): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/rps`, 'POST', { pick })
}

export function fetchRoomState(code: string, since: number): Promise<TicTacToeStateResponse> {
  return requestUserApi<TicTacToeStateResponse>(`/api/tictactoe/room/${code}?since=${since}`, 'GET')
}

export function moveAt(code: string, index: number): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/move`, 'POST', { index })
}

export function rematch(code: string): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/rematch`, 'POST')
}

export function leaveRoom(code: string): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/leave`, 'POST')
}

/** 房间聊天（phrase 传 id / emoji 传表情字符 / sticker 传 id / text 传文字）。 */
export function sendTictactoeChat(code: string, kind: string, payload: { id?: string; text?: string }): Promise<TicTacToeRoomState> {
  return requestUserApi<TicTacToeRoomState>(`/api/tictactoe/room/${code}/chat`, 'POST', { kind, ...payload })
}
