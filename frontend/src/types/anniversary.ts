export type AnniversarySceneType = 'birthday' | 'relationship' | 'wedding' | 'travel' | 'deadline' | 'baby' | 'habit' | 'custom'
export type AnniversaryCalendarType = 'solar' | 'lunar'
export type AnniversaryRepeatType = 'none' | 'yearly'
export type AnniversaryCountMode = 'countdown' | 'countup'
export type AnniversaryCardTemplate = 'minimal' | 'calendar' | 'photo' | 'boarding' | 'certificate' | 'progress' | 'festival'
export type AnniversaryCardTone = 'warm' | 'fresh' | 'classic' | 'rose' | 'ink'

/** 共享角色：owner 创建者 / editor 可编辑公共内容 / viewer 只读（个人偏好仍可改） */
export type AnniversaryRole = 'owner' | 'editor' | 'viewer'

/** 个人偏好（每人一份，互不影响） */
export interface AnniversaryMyPrefs {
  remindDaysBefore: number
  remindTime: string
  cardTemplate: AnniversaryCardTemplate
  cardTone: AnniversaryCardTone
  coverImage: string
}

export interface AnniversaryEvent {
  id: number
  title: string
  sceneType: AnniversarySceneType
  eventDate: string
  calendarType: AnniversaryCalendarType
  lunarYear: number | null
  lunarMonth: number | null
  lunarDay: number | null
  isLunarLeapMonth: boolean
  repeatType: AnniversaryRepeatType
  countMode: AnniversaryCountMode
  remindDaysBefore: number
  remindTime: string
  calendarAddedAt: string
  calendarRepeatType: AnniversaryRepeatType | ''
  coverImage: string
  cardTemplate: AnniversaryCardTemplate
  cardTone: AnniversaryCardTone
  sortOrder: number
  role: AnniversaryRole
  ownerId: number
  shared: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface AnniversaryDraft {
  id?: number
  title: string
  sceneType: AnniversarySceneType
  eventDate: string
  calendarType: AnniversaryCalendarType
  lunarYear: number | null
  lunarMonth: number | null
  lunarDay: number | null
  isLunarLeapMonth: boolean
  repeatType: AnniversaryRepeatType
  countMode: AnniversaryCountMode
  remindDaysBefore: number
  remindTime: string
  coverImage: string
  cardTemplate: AnniversaryCardTemplate
  cardTone: AnniversaryCardTone
}

/** 邀请预览（被邀请方确认前看到的内容） */
export interface AnniversaryInvitePreview {
  event: {
    title: string
    sceneType: AnniversarySceneType
    eventDate: string
    countMode: AnniversaryCountMode
  }
  inviter: {
    nickname: string
    avatarUrl: string
  }
  role: 'editor' | 'viewer'
  expiresAt: string
}

/** 成员列表条目 */
export interface AnniversaryMemberInfo {
  userId: number
  nickname: string
  avatarUrl: string
  role: AnniversaryRole
  joinedAt: string
}

export interface AnniversaryMembersResponse {
  members: AnniversaryMemberInfo[]
  myRole: AnniversaryRole
  ownerId: number
}

export interface AnniversaryOccurrence {
  date: string
  daysUntil: number
  elapsedDays: number
  nextAnniversaryYears: number
  label: string
  detail: string
}

export interface AnniversaryMilestone {
  event: AnniversaryEvent
  targetDays: number
  remainingDays: number
  date: string
  label: string
}

export interface AnniversarySummary {
  today: AnniversaryEvent[]
  upcoming: AnniversaryEvent[]
  todayCount: number
  upcomingCount: number
  nextEvent: AnniversaryEvent | null
  nextMilestone: AnniversaryMilestone | null
}
