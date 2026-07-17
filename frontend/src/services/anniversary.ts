import { requestUserApi } from '@/services/toolbox'
import type { AnniversaryDraft, AnniversaryEvent, AnniversaryRepeatType } from '@/types/anniversary'

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
  const response = await requestUserApi<EventResponse>('/api/anniversaries', 'POST', { ...draft })
  return response.event
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
