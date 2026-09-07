import { requestUserApi } from '@/services/toolbox'
import type {
  AnniversaryDraft,
  AnniversaryEvent,
  AnniversaryInvitePreview,
  AnniversaryMembersResponse,
  AnniversaryMyPrefs,
  AnniversaryRepeatType,
} from '@/types/anniversary'

interface EventsResponse {
  events: AnniversaryEvent[]
}

interface EventResponse {
  event: AnniversaryEvent
}

export async function fetchAnniversaries(): Promise<AnniversaryEvent[]> {
  const response = await requestUserApi<EventsResponse>('/api/anniversaries', 'GET')
  return response.events
}

export async function saveAnniversary(draft: AnniversaryDraft): Promise<AnniversaryEvent> {
  const response = await requestUserApi<EventResponse>('/api/anniversaries', 'POST', {
    ...draft,
    myPrefs: myPrefsFromDraft(draft),
  })
  return response.event
}

/** 仅保存个人偏好（提醒/模板/风格/封面）：任意角色可改自己那份，不带 title 走偏好分支。 */
export async function saveAnniversaryMyPrefs(id: number, prefs: Partial<AnniversaryMyPrefs>): Promise<AnniversaryEvent> {
  const response = await requestUserApi<EventResponse>('/api/anniversaries', 'POST', { id, myPrefs: prefs })
  return response.event
}

function myPrefsFromDraft(draft: AnniversaryDraft): AnniversaryMyPrefs {
  return {
    remindDaysBefore: draft.remindDaysBefore,
    remindTime: draft.remindTime,
    cardTemplate: draft.cardTemplate,
    cardTone: draft.cardTone,
    coverImage: draft.coverImage,
  }
}

export async function deleteAnniversary(id: number): Promise<void> {
  await requestUserApi<{ deleted: boolean }>(`/api/anniversaries/${id}/delete`, 'POST')
}

export async function markAnniversaryCalendarAdded(id: number, repeatType: AnniversaryRepeatType): Promise<AnniversaryEvent> {
  const response = await requestUserApi<EventResponse>(`/api/anniversaries/${id}/calendar-added`, 'POST', { repeatType })
  return response.event
}

export async function subscribeAnniversaryReminder(id: number, templateId: string, nextOccurrenceDate: string): Promise<void> {
  await requestUserApi<{ subscribed: boolean }>(`/api/anniversaries/${id}/subscribe`, 'POST', { templateId, nextOccurrenceDate })
}

// ---------------- 共享协作 ----------------

export interface AnniversaryInvite {
  code: string
  role: 'editor' | 'viewer'
  expiresAt: string
  sharePath: string
}

export async function createAnniversaryInvite(id: number, role: 'editor' | 'viewer'): Promise<AnniversaryInvite> {
  const response = await requestUserApi<{ invite: AnniversaryInvite }>(`/api/anniversaries/${id}/invite`, 'POST', { role })
  return response.invite
}

export async function previewAnniversaryInvite(code: string): Promise<AnniversaryInvitePreview> {
  return requestUserApi<AnniversaryInvitePreview>(`/api/anniversaries/invite/${code}`, 'GET')
}

export async function acceptAnniversaryInvite(code: string): Promise<{ event: AnniversaryEvent; alreadyMember: boolean }> {
  return requestUserApi<{ event: AnniversaryEvent; alreadyMember: boolean }>(`/api/anniversaries/invite/${code}/accept`, 'POST')
}

export async function fetchAnniversaryMembers(id: number): Promise<AnniversaryMembersResponse> {
  return requestUserApi<AnniversaryMembersResponse>(`/api/anniversaries/${id}/members`, 'GET')
}

export async function updateAnniversaryMemberRole(id: number, userId: number, role: 'editor' | 'viewer'): Promise<AnniversaryMembersResponse> {
  return requestUserApi<AnniversaryMembersResponse>(`/api/anniversaries/${id}/member-role`, 'POST', { userId, role })
}

export async function removeAnniversaryMember(id: number, userId: number): Promise<AnniversaryMembersResponse> {
  return requestUserApi<AnniversaryMembersResponse>(`/api/anniversaries/${id}/member-remove`, 'POST', { userId })
}

export async function leaveAnniversaryEvent(id: number): Promise<void> {
  await requestUserApi<{ left: boolean }>(`/api/anniversaries/${id}/leave`, 'POST')
}
