export type AnniversarySceneType = 'birthday' | 'relationship' | 'wedding' | 'travel' | 'deadline' | 'baby' | 'habit' | 'custom'
export type AnniversaryCalendarType = 'solar' | 'lunar'
export type AnniversaryRepeatType = 'none' | 'yearly'
export type AnniversaryCountMode = 'countdown' | 'countup'
export type AnniversaryCardTemplate = 'minimal' | 'calendar' | 'photo' | 'boarding' | 'certificate' | 'progress' | 'festival'
export type AnniversaryCardTone = 'warm' | 'fresh' | 'classic' | 'rose' | 'ink'

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
  calendarAddedAt: string
  calendarRepeatType: AnniversaryRepeatType | ''
  coverImage: string
  cardTemplate: AnniversaryCardTemplate
  cardTone: AnniversaryCardTone
  sortOrder: number
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
  coverImage: string
  cardTemplate: AnniversaryCardTemplate
  cardTone: AnniversaryCardTone
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
