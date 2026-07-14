import type { AdminTool, ToolboxAccount, ToolboxHomeData, ToolboxUser } from '@/types/toolbox'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface LoginResponse {
  token: string
  expiresAt: string
  user: ToolboxUser
}

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:9501').replace(/\/$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || ''
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

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (result) => result.code ? resolve(result.code) : reject(new Error('微信登录未返回 code')),
      fail: () => reject(new Error('微信登录失败')),
    })
  })
}

function getWechatProfile(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const api = typeof wx !== 'undefined' && typeof wx.getUserProfile === 'function' ? wx : null
    if (!api) {
      resolve({})
      return
    }
    api.getUserProfile({
      desc: '用于展示枫叶小屋中的头像和昵称',
      success: (result: { userInfo?: Record<string, unknown> }) => resolve(result.userInfo ?? {}),
      fail: (error: { errMsg?: string }) => reject(new Error(error.errMsg || '用户未授权微信资料')),
    })
  })
}

function request<T>(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, withUserToken = false): Promise<T> {
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
      timeout: 8000,
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
