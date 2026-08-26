export type ToolCategory = 'tool' | 'game'

export interface ToolboxTool {
  key: string
  category: ToolCategory
  name: string
  description: string
  icon: string
  route: string
}

export interface AdminTool extends ToolboxTool {
  isPublished: boolean
  sortOrder: number
}

export interface ToolboxHomeData {
  catalog: ToolboxTool[]
  homeToolKeys: string[]
}

export interface ToolboxUser {
  id: number
  openid: string
  nickname: string
  avatarUrl: string
}

export interface ToolboxAccount {
  user: ToolboxUser
  isAdmin: boolean
}
