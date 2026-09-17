import type { Event } from '../types/schema'
import { getAnonUserId } from './anonUserId'

export interface GoogleSyncStatus {
  connected: boolean
  email: string | null
}

export async function getGoogleSyncStatus(): Promise<GoogleSyncStatus> {
  try {
    const res = await fetch(`/api/auth/google-status?userId=${getAnonUserId()}`)
    if (!res.ok) return { connected: false, email: null }
    return (await res.json()) as GoogleSyncStatus
  } catch {
    return { connected: false, email: null }
  }
}

export function startGoogleConnect(): void {
  if (typeof window !== 'undefined') {
    window.location.href = `/api/auth/google-start?userId=${getAnonUserId()}`
  }
}

export async function syncEventCreate(event: Event): Promise<string | null> {
  return postSync({ action: 'create', event: toPayload(event) })
}

export async function syncEventUpdate(event: Event): Promise<string | null> {
  if (!event.googleEventId) return syncEventCreate(event)
  return postSync({ action: 'update', googleEventId: event.googleEventId, event: toPayload(event) })
}

export async function syncEventDelete(event: Event): Promise<void> {
  if (!event.googleEventId) return
  const response=await fetch('/api/calendar/sync-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:getAnonUserId(),action:'delete',googleEventId:event.googleEventId})});
  if(!response.ok)throw new Error('Google 일정 삭제에 실패했어요. 로컬 일정은 유지됩니다.');
  const result=await response.json();if(!result.connected)throw new Error('Google 연결 후 다시 취소해 주세요.');
}

function toPayload(event: Event) {
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    time: event.time,
    durationMin: event.durationMin,
    remindMin: event.remindMin,
    place: event.place ? { name: event.place.name, address: event.place.address } : null,
  }
}

interface SyncPayload {
  action: 'create' | 'update' | 'delete'
  googleEventId?: string
  event?: ReturnType<typeof toPayload>
}

async function postSync(payload: SyncPayload): Promise<string | null> {
  try {
    const res = await fetch('/api/calendar/sync-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: getAnonUserId(), ...payload }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { connected: boolean; googleEventId?: string | null }
    return body.googleEventId ?? null
  } catch (err) {
    console.warn('[google-sync] 실패:', err)
    return null
  }
}
