import type { Event } from '../types/schema'

// 지금은 서버 DB가 없어서 웹의 localStorage에만 저장한다 (새로고침해도 유지되게).
// 네이티브(iOS/Android)는 아직 지원 안 함 — localStorage가 없어서 조용히 스킵된다.
const STORAGE_KEY = 'gguck-events-v1'

export function loadStoredEvents(): Event[] | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveStoredEvents(events: Event[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // 저장 실패(프라이빗 모드 등)해도 앱 동작에는 지장 없게 조용히 무시한다.
  }
}
