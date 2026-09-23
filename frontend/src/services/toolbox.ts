import type { AdminTool, ToolboxAccount, ToolboxHomeData, ToolboxUser } from '@/types/toolbox'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: ToolboxUser
}

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:9501').replace(/\/$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || ''

/** 五子棋 WS 通道由 API_BASE 派生（http→ws，https→wss），apiKey/token 走 query（小程序 header 不可靠）。 */
export function gomokuWsUrl(path: string, params: Record<string, string>): string {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  const query = Object.entries({ apiKey: API_KEY, ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `${wsBase}${path}?${query}`
}
export const AUTH_STORAGE_KEY = 'shuxia-food-auth-token-v1'
export const USER_STORAGE_KEY = 'shuxia-food-auth-user-v1'

export function storedUser(): ToolboxUser | null {
  try {
    const raw = uni.getStorageSync(USER_STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    const user = raw as ToolboxUser
    return typeof user.id === 'number' ? user : null
  } catch {
    return null
  }
}

export async function fetchHomeTools(): Promise<ToolboxHomeData> {
  return requestWithSession(() => request<ToolboxHomeData>('/api/tools/home', 'GET', undefined, true))
}

export async function saveHomeTools(toolKeys: string[]): Promise<ToolboxHomeData> {
  return requestWithSession(() => request<ToolboxHomeData>('/api/tools/home', 'POST', { toolKeys }, true))
}

export async function fetchAccount(): Promise<ToolboxAccount> {
  const account = await requestWithSession(() => request<ToolboxAccount>('/api/auth/me', 'GET', undefined, true))
  uni.setStorageSync(USER_STORAGE_KEY, account.user)
  return account
}

export async function loginWithWechatProfile(): Promise<ToolboxAccount> {
  let profile: Record<string, unknown> = {}
  try {
    profile = await getWechatProfile()
  } catch {
    // 拒绝资料授权时仍可完成账号登录并同步工具偏好。
  }
  const login = await loginWithWechat(profile)
  const account = await request<ToolboxAccount>('/api/auth/me', 'GET', undefined, true)
  uni.setStorageSync(USER_STORAGE_KEY, account.user)
  return account
}

export async function saveUserProfile(profile: { nickname: string, avatarUrl: string }): Promise<ToolboxUser> {
  const response = await requestWithSession(() => request<{ user: ToolboxUser }>('/api/auth/profile', 'POST', profile, true))
  uni.setStorageSync(USER_STORAGE_KEY, response.user)
  return response.user
}

export async function uploadAvatar(filePath: string): Promise<string> {
  const response = await requestWithSession(() => uploadFile<{ avatarUrl: string }>('/api/auth/avatar', filePath))
  return response.avatarUrl
}

export function resolveAvatarUrl(avatarUrl: string): string {
  return avatarUrl.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl
}

export async function fetchAdminTools(): Promise<AdminTool[]> {
  const response = await requestWithSession(() => request<{ tools: AdminTool[] }>('/api/admin/tools', 'GET', undefined, true))
  return response.tools
}

export async function setAdminToolPublication(toolKey: string, published: boolean): Promise<AdminTool> {
  const response = await requestWithSession(() => request<{ tool: AdminTool }>('/api/admin/tools/publication', 'POST', { toolKey, published }, true))
  return response.tool
}

export async function saveAdminToolOrder(toolKeys: string[]): Promise<AdminTool[]> {
  const response = await requestWithSession(() => request<{ tools: AdminTool[] }>('/api/admin/tools/order', 'POST', { toolKeys }, true))
  return response.tools
}

export interface FeatureFlags {
  aiEnabled: boolean
  /** UNO 房间自由文字聊天（快捷句/表情不受影响）；旧后端未返回时按 true 处理 */
  unoChatTextEnabled?: boolean
  /** 冒险棋房间自由文字聊天（快捷句/表情/贴纸不受影响）；旧后端未返回时按 true 处理 */
  adventureChatTextEnabled?: boolean
  /** 游戏榜单总开关（默认关=安全默认）；旧后端未返回时保持 false */
  gameRankEnabled?: boolean
}

/** 公开的全局功能开关（无需登录）：决定 AI 入口是否展示，服务端另有硬拦截兜底。 */
export async function fetchFeatures(): Promise<FeatureFlags> {
  return request<FeatureFlags>('/api/config/features', 'GET')
}

export async function fetchAdminFeatures(): Promise<FeatureFlags> {
  return requestWithSession(() => request<FeatureFlags>('/api/admin/features', 'GET', undefined, true))
}

export async function setAdminAiEnabled(aiEnabled: boolean): Promise<FeatureFlags> {
  return requestWithSession(() => request<FeatureFlags>('/api/admin/features', 'POST', { aiEnabled }, true))
}

export async function setAdminGameRankEnabled(gameRankEnabled: boolean): Promise<FeatureFlags> {
  return requestWithSession(() => request<FeatureFlags>('/api/admin/features', 'POST', { gameRankEnabled }, true))
}

export async function setAdminUnoChatTextEnabled(unoChatTextEnabled: boolean): Promise<FeatureFlags> {
  return requestWithSession(() => request<FeatureFlags>('/api/admin/features', 'POST', { unoChatTextEnabled }, true))
}

export async function requestUserApi<T>(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, timeout?: number): Promise<T> {
  return requestWithSession(() => request<T>(path, method, data, true, timeout))
}

async function requestWithSession<T>(operation: () => Promise<T>): Promise<T> {
  await ensureToken()
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('请先微信登录')) throw error
    clearSession()
    await ensureToken()
    return operation()
  }
}

async function ensureToken(): Promise<string> {
  const existing = String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')
  if (existing) return existing
  return (await loginWithWechat({})).token
}

/** 拉起 wx.login 换 code（页面自管登录态时复用，业务请求请走 requestUserApi/apiRequest）。 */
export function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (result) => result.code ? resolve(result.code) : reject(new Error('微信登录未返回 code')),
      fail: () => reject(new Error('微信登录失败')),
    })
  })
}

/** getUserProfile 弹窗拉资料；desc 会显示在微信授权弹窗里，可按工具定制。拒绝授权时 reject，调用方自行兜底。 */
export function getWechatProfile(desc = '用于展示枫叶小屋中的头像和昵称'): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const api = typeof wx !== 'undefined' && typeof wx.getUserProfile === 'function' ? wx : null
    if (!api) {
      resolve({})
      return
    }
    api.getUserProfile({
      desc,
      success: (result: { userInfo?: Record<string, unknown> }) => resolve(result.userInfo ?? {}),
      fail: (error: { errMsg?: string }) => reject(new Error(error.errMsg || '用户未授权微信资料')),
    })
  })
}

/** code+profile 换会话并持久化 token/user；返回值供页面同步自己的响应式状态。 */
export async function loginWechat(profile: Record<string, unknown> = {}): Promise<LoginResponse> {
  return loginWithWechat(profile)
}

/**
 * 低层通用请求（信封解包 + X-API-Key / X-User-Token 头）。
 * 页面级自助请求统一走这里，避免各页复制 uni.request 样板后超时/错误语义各自漂移。
 * opts.userToken: true = 读存储会话；字符串 = 显式 token（页面自管登录态）；false/'' = 不带。
 */
export function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  data?: Record<string, unknown>,
  opts: { userToken?: string | boolean, timeout?: number } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'X-API-Key': API_KEY }
    const token = typeof opts.userToken === 'string'
      ? opts.userToken
      : opts.userToken === true
        ? String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')
        : ''
    if (token) headers['X-User-Token'] = token
    uni.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header: headers,
      timeout: opts.timeout ?? 8000,
      success: (result) => {
        const body = result.data as ApiEnvelope<T>
        if (!body || body.code !== 0) {
          reject(new Error(body?.message || '接口返回异常'))
          return
        }
        resolve(body.data)
      },
      fail: (error) => reject(new Error(error.errMsg || '网络请求失败')),
    })
  })
}

async function loginWithWechat(profile: Record<string, unknown>): Promise<LoginResponse> {
  const code = await wxLoginCode()
  const data = await request<LoginResponse>('/api/auth/wechat-login', 'POST', { code, profile }, false)
  uni.setStorageSync(AUTH_STORAGE_KEY, data.token)
  uni.setStorageSync(USER_STORAGE_KEY, data.user)
  return data
}

function clearSession() {
  uni.removeStorageSync(AUTH_STORAGE_KEY)
  uni.removeStorageSync(USER_STORAGE_KEY)
}

function request<T>(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, withUserToken = false, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'X-API-Key': API_KEY }
    if (withUserToken) {
      const token = String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')
      if (token) headers['X-User-Token'] = token
    }
    uni.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header: headers,
      timeout,
      success: (result) => {
        const body = result.data as ApiEnvelope<T>
        if (!body || body.code !== 0) {
          reject(new Error(body?.message || '接口返回异常'))
          return
        }
        resolve(body.data)
      },
      fail: (error) => reject(new Error(error.errMsg || '网络请求失败')),
    })
  })
}

function uploadFile<T>(path: string, filePath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'X-API-Key': API_KEY }
    const token = String(uni.getStorageSync(AUTH_STORAGE_KEY) || '')
    if (token) headers['X-User-Token'] = token
    uni.uploadFile({
      url: `${API_BASE}${path}`,
      filePath,
      name: 'file',
      fileType: 'image',
      header: headers,
      timeout: 20000,
      success: (result) => {
        let body: ApiEnvelope<T> | null = null
        try {
          body = typeof result.data === 'string' ? JSON.parse(result.data) as ApiEnvelope<T> : result.data as ApiEnvelope<T>
        } catch {
          reject(new Error('头像上传响应异常'))
          return
        }
        if (!body || body.code !== 0) {
          reject(new Error(body?.message || '头像上传失败'))
          return
        }
        resolve(body.data)
      },
      fail: (error) => reject(new Error(error.errMsg || '头像上传失败')),
    })
  })
}
