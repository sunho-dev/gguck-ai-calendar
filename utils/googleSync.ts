import type { Event } from '../types/schema'

// 지금은 익명 단일 사용자만 지원한다 (다른 곳에서도 userId: 'local'을 그대로 쓰는 것과 동일).
const USER_ID = 'local'

export interface GoogleSyncStatus {
  connected: boolean
  email: string | null
}

export async function getGoogleSyncStatus(): Promise<GoogleSyncStatus> {
  try {
    const res = await fetch(`/api/auth/google-status?userId=${USER_ID}`)
    if (!res.ok) return { connected: false, email: null }
    return (await res.json()) as GoogleSyncStatus
  } catch {
    return { connected: false, email: null }
  }
}

export function startGoogleConnect(): void {
  if (typeof window !== 'undefined') {
    window.location.href = `/api/auth/google-start?userId=${USER_ID}`
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
  await postSync({ action: 'delete', googleEventId: event.googleEventId })
}

function toPayload(event: Event) {
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    time: event.time,
    durationMin: event.durationMin,
    place: event.place ? { name: event.place.name, address: event.place.address } : null,
    remindMin: event.remindMin,
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
      body: JSON.stringify({ userId: USER_ID, ...payload }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { connected: boolean; googleEventId?: string | null }
    return body.googleEventId ?? null
  } catch (err) {
    console.warn('[google-sync] 실패:', err)
    return null
  }
}
