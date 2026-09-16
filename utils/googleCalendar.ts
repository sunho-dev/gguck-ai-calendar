import type { Event } from '../types/schema'
import { addMinutesToTime } from './date'

// OAuth 연동 없이 구글 캘린더의 "일정 추가" 화면을 미리 채운 링크로 여는 방식.
// 구글 계정을 연동하지 않은 사용자를 위한 기본 경로다 (연동 시 자동 동기화는 utils/googleSync.ts).
export function buildGoogleCalendarUrl(event: Event): string {
  const start = toGoogleDateTime(event.startDate, event.time)
  const { date: endDate, time: endTime } = addMinutesToTime(event.endDate, event.time, event.durationMin)
  const end = toGoogleDateTime(endDate, endTime)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    ctz: 'Asia/Seoul',
  })

  if (event.place) {
    params.set('location', `${event.place.name} ${event.place.address}`.trim())
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function toGoogleDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
}
