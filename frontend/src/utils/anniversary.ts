import type {
  AnniversaryCardTemplate,
  AnniversaryCardTone,
  AnniversaryDraft,
  AnniversaryEvent,
  AnniversaryMilestone,
  AnniversaryOccurrence,
  AnniversarySceneType,
  AnniversarySummary,
} from '@/types/anniversary'
import { lunarDayLabel, lunarMonthLabel, lunarToSolar } from '@/utils/lunar'

export interface SceneOption {
  key: AnniversarySceneType
  name: string
  hint: string
}

export interface TemplateOption {
  key: AnniversaryCardTemplate
  name: string
  hint: string
}

export const SCENE_OPTIONS: SceneOption[] = [
  { key: 'birthday', name: '生日', hint: '每年重复，适合写入日历' },
  { key: 'relationship', name: '恋爱', hint: '记录第 100、520、1000 天' },
  { key: 'wedding', name: '结婚', hint: '周年与长日子都能算' },
  { key: 'travel', name: '旅行', hint: '出发前倒数提醒' },
  { key: 'deadline', name: '考试/截止', hint: '提前 7 天进入提醒' },
  { key: 'baby', name: '宝宝成长', hint: '满月、百天、一岁' },
  { key: 'habit', name: '坚持', hint: '7、21、100 天里程碑' },
  { key: 'custom', name: '自定义', hint: '任何值得记住的日子' },
]

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  { key: 'minimal', name: '极简', hint: '突出大数字' },
  { key: 'calendar', name: '日历', hint: '生日和截止日' },
  { key: 'photo', name: '照片', hint: '适合纪念照' },
  { key: 'boarding', name: '旅行', hint: '出发倒计时' },
  { key: 'certificate', name: '证书', hint: '周年与里程碑' },
  { key: 'progress', name: '进度', hint: '坚持和目标' },
  { key: 'festival', name: '节日', hint: '温柔祝福卡' },
]

export const TONE_OPTIONS: Array<{ key: AnniversaryCardTone, name: string }> = [
  { key: 'warm', name: '温柔' },
  { key: 'fresh', name: '清新' },
  { key: 'classic', name: '经典' },
  { key: 'rose', name: '纪念' },
  { key: 'ink', name: '素雅' },
]

export function emptyAnniversaryDraft(sceneType: AnniversarySceneType = 'birthday'): AnniversaryDraft {
  const today = formatDate(new Date())
  const countMode = ['relationship', 'wedding', 'baby', 'habit'].includes(sceneType) ? 'countup' : 'countdown'
  const repeatType = ['birthday', 'wedding'].includes(sceneType) ? 'yearly' : 'none'
  return {
    title: defaultTitleForScene(sceneType),
    sceneType,
    eventDate: today,
    calendarType: 'solar',
    lunarYear: null,
    lunarMonth: null,
    lunarDay: null,
    isLunarLeapMonth: false,
    repeatType,
    countMode,
    remindDaysBefore: sceneType === 'deadline' ? 7 : 1,
    coverImage: '',
    cardTemplate: recommendedTemplateForScene(sceneType),
    cardTone: sceneType === 'deadline' ? 'classic' : 'warm',
  }
}

export function draftFromEvent(event: AnniversaryEvent): AnniversaryDraft {
  return {
    id: event.id,
    title: event.title,
    sceneType: event.sceneType,
    eventDate: event.eventDate,
    calendarType: event.calendarType,
    lunarYear: event.lunarYear,
    lunarMonth: event.lunarMonth,
    lunarDay: event.lunarDay,
    isLunarLeapMonth: event.isLunarLeapMonth,
    repeatType: event.repeatType,
    countMode: event.countMode,
    remindDaysBefore: event.remindDaysBefore,
    coverImage: event.coverImage,
    cardTemplate: event.cardTemplate,
    cardTone: event.cardTone,
  }
}

export function summarizeAnniversaries(events: AnniversaryEvent[], now = new Date()): AnniversarySummary {
  const today = startOfDay(now)
  const active = events
    .map((event) => ({ event, occurrence: computeOccurrence(event, today) }))
    .sort((a, b) => a.occurrence.daysUntil - b.occurrence.daysUntil || a.event.sortOrder - b.event.sortOrder)

  const todayItems = active.filter((item) => item.occurrence.daysUntil === 0).map((item) => item.event)
  const upcoming = active
    .filter((item) => item.occurrence.daysUntil > 0 && item.occurrence.daysUntil <= 7)
    .map((item) => item.event)
  const nextEvent = active.find((item) => item.occurrence.daysUntil >= 0)?.event ?? null
  const nextMilestone = active
    .map((item) => nextMilestoneForEvent(item.event, today))
    .filter((item): item is AnniversaryMilestone => Boolean(item))
    .sort((a, b) => a.remainingDays - b.remainingDays)[0] ?? null

  return {
    today: todayItems,
    upcoming,
    todayCount: todayItems.length,
    upcomingCount: upcoming.length,
    nextEvent,
    nextMilestone,
  }
}

export function computeOccurrence(event: AnniversaryEvent, now = new Date()): AnniversaryOccurrence {
  const today = startOfDay(now)
  const base = dateFromString(event.eventDate)
  const occurrenceDate = nextOccurrenceDate(event, today)
  const daysUntil = daysBetween(today, occurrenceDate)
  const elapsedDays = Math.max(0, daysBetween(base, today) + 1)
  const nextAnniversaryYears = event.repeatType === 'yearly'
    ? Math.max(0, occurrenceDate.getFullYear() - base.getFullYear())
    : 0
  const label = event.countMode === 'countup'
    ? (elapsedDays > 0 ? `已经 ${elapsedDays} 天` : `还有 ${Math.abs(daysBetween(today, base))} 天开始`)
    : countdownLabel(daysUntil)

  return {
    date: formatDate(occurrenceDate),
    daysUntil,
    elapsedDays,
    nextAnniversaryYears,
    label,
    detail: occurrenceDetail(event, daysUntil, elapsedDays, nextAnniversaryYears),
  }
}

export function nextMilestoneForEvent(event: AnniversaryEvent, now = new Date()): AnniversaryMilestone | null {
  if (event.countMode !== 'countup') return null
  const today = startOfDay(now)
  const base = dateFromString(event.eventDate)
  const elapsedDays = Math.max(0, daysBetween(base, today) + 1)
  if (elapsedDays <= 0) return null
  const targetDays = milestoneDaysForScene(event.sceneType).find((target) => target > elapsedDays)
  if (!targetDays) return null
  const date = addDays(base, targetDays - 1)
  const remainingDays = Math.max(0, daysBetween(today, date))
  return {
    event,
    targetDays,
    remainingDays,
    date: formatDate(date),
    label: `第 ${targetDays} 天`,
  }
}

export function eventDateLabel(event: AnniversaryEvent): string {
  if (event.calendarType === 'lunar' && event.lunarMonth && event.lunarDay) {
    return `${event.lunarYear ?? ''} ${lunarMonthLabel(event.lunarMonth, event.isLunarLeapMonth)}${lunarDayLabel(event.lunarDay)}`
  }
  return event.eventDate.replace(/-/g, '.')
}

export function sceneName(sceneType: AnniversarySceneType): string {
  return SCENE_OPTIONS.find((item) => item.key === sceneType)?.name ?? '纪念日'
}

export function recommendedTemplateForScene(sceneType: AnniversarySceneType): AnniversaryCardTemplate {
  if (sceneType === 'birthday') return 'calendar'
  if (sceneType === 'travel') return 'boarding'
  if (sceneType === 'relationship' || sceneType === 'wedding') return 'certificate'
  if (sceneType === 'habit' || sceneType === 'deadline') return 'progress'
  if (sceneType === 'baby') return 'photo'
  return 'minimal'
}

export function defaultCopyForEvent(event: AnniversaryEvent, occurrence = computeOccurrence(event)): string {
  if (event.sceneType === 'travel') return `把期待装进口袋，${occurrence.daysUntil} 天后出发。`
  if (event.sceneType === 'birthday') return occurrence.daysUntil === 0 ? '今天值得被好好记住。' : `还有 ${occurrence.daysUntil} 天，准备一份心意。`
  if (event.sceneType === 'relationship' || event.sceneType === 'wedding') return `第 ${occurrence.elapsedDays} 天，是时间留下的温柔记号。`
  if (event.sceneType === 'habit') return `每一天都算数，今天是第 ${occurrence.elapsedDays} 天。`
  if (event.sceneType === 'deadline') return occurrence.daysUntil > 0 ? `还有 ${occurrence.daysUntil} 天，把节奏稳住。` : '今天就是目标日。'
  return occurrence.label
}

export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dateFromString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((toUtcDay(start) - toUtcDay(end)) / 86400000) * -1
}

function nextOccurrenceDate(event: AnniversaryEvent, today: Date): Date {
  if (event.repeatType !== 'yearly') return dateFromString(event.eventDate)
  if (event.calendarType === 'lunar' && event.lunarMonth && event.lunarDay) {
    const year = today.getFullYear()
    const candidates = [year - 1, year, year + 1, year + 2]
      .map((lunarYear) => lunarToSolar(lunarYear, event.lunarMonth!, event.lunarDay!, event.isLunarLeapMonth))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())
    return candidates.find((date) => daysBetween(today, date) >= 0) ?? candidates[candidates.length - 1] ?? dateFromString(event.eventDate)
  }
  const thisYear = today.getFullYear()
  let candidate = occurrenceInYear(event, thisYear)
  if (daysBetween(today, candidate) < 0) {
    candidate = occurrenceInYear(event, thisYear + 1)
  }
  return candidate
}

function occurrenceInYear(event: AnniversaryEvent, year: number): Date {
  if (event.calendarType === 'lunar' && event.lunarMonth && event.lunarDay) {
    const lunarDate = lunarToSolar(year, event.lunarMonth, event.lunarDay, event.isLunarLeapMonth)
    if (lunarDate) return lunarDate
  }
  const base = dateFromString(event.eventDate)
  const month = base.getMonth()
  const day = base.getDate()
  if (month === 1 && day === 29 && !isLeapYear(year)) {
    return new Date(year, 1, 28)
  }
  return new Date(year, month, day)
}

function occurrenceDetail(event: AnniversaryEvent, daysUntil: number, elapsedDays: number, years: number): string {
  if (event.countMode === 'countup') {
    if (event.repeatType === 'yearly' && years > 0) return `下一个周年：第 ${years} 年`
    return `从 ${event.eventDate.replace(/-/g, '.')} 开始`
  }
  if (daysUntil === 0) return '今天就是这个日子'
  if (daysUntil > 0) return `${daysUntil} 天后到来`
  return `已过去 ${Math.abs(daysUntil)} 天`
}

function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) return '今天'
  if (daysUntil > 0) return `还有 ${daysUntil} 天`
  return `已过 ${Math.abs(daysUntil)} 天`
}

function milestoneDaysForScene(sceneType: AnniversarySceneType): number[] {
  if (sceneType === 'baby') return [30, 100, 365, 730, 1000]
  if (sceneType === 'habit') return [7, 21, 30, 66, 100, 365, 520, 1000]
  if (sceneType === 'relationship' || sceneType === 'wedding') return [100, 365, 520, 999, 1000, 1314, 2000, 3000, 5000]
  return [100, 365, 520, 999, 1000, 1314, 2000, 3000]
}

function defaultTitleForScene(sceneType: AnniversarySceneType): string {
  if (sceneType === 'birthday') return '生日'
  if (sceneType === 'relationship') return '我们认识的日子'
  if (sceneType === 'wedding') return '结婚纪念日'
  if (sceneType === 'travel') return '下一次旅行'
  if (sceneType === 'deadline') return '重要截止日'
  if (sceneType === 'baby') return '宝宝成长'
  if (sceneType === 'habit') return '坚持一件事'
  return '重要的日子'
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toUtcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}
