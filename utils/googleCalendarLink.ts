import type { Event, ISODate, ISOTime } from '../types/schema'
import { addMinutesToTime } from './date'

// 로그인/OAuth 승인 없이 "구글 캘린더에 추가" 화면을 바로 열어주는 표준 링크 방식.
// (기획서 12번: "링크 방식이 기본" — 심사위원은 팀 계정 전용 OAuth를 못 쓰므로 이게 사실상 유일한 경로)
function toGoogleUtcStamp(date: ISODate, time: ISOTime): string {
  const utcMs = Date.parse(`${date}T${time}:00+09:00`)
  return new Date(utcMs).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildGoogleCalendarLink(event: Event): string {
  const { date: endDate, time: endTime } = addMinutesToTime(event.endDate, event.time, event.durationMin)
  const start = toGoogleUtcStamp(event.startDate, event.time)
  const end = toGoogleUtcStamp(endDate, endTime)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
  })
  if (event.place) {
    params.set('location', [event.place.name, event.place.address].filter(Boolean).join(' '))
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
