import type { Event } from '../types/schema'
import { addMinutesToTime } from './date'

// RFC 5545 iCalendar 형식으로 단일 일정을 내보낸다. 구글 계정 연동 없이도
// 애플캘린더/아웃룩/삼성캘린더 등 .ics를 지원하는 어떤 앱에도 추가할 수 있다.
export function buildIcsContent(event: Event): string {
  const start = toIcsDateTime(event.startDate, event.time)
  const { date: endDate, time: endTime } = addMinutesToTime(event.endDate, event.time, event.durationMin)
  const end = toIcsDateTime(endDate, endTime)
  const stamp = toIcsUtcStamp(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gguck//KO',
    'BEGIN:VEVENT',
    `UID:${event.id}@gguck.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Seoul:${start}`,
    `DTEND;TZID=Asia/Seoul:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ]

  if (event.place) {
    const location = [event.place.name, event.place.address].filter(Boolean).join(' ')
    lines.push(`LOCATION:${escapeIcsText(location)}`)
  }

  if (event.remindMin > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(event.title)}`,
      `TRIGGER:-PT${event.remindMin}M`,
      'END:VALARM',
    )
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n')
}

function toIcsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
}

function toIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

// 웹 전용: 브라우저에 .ics 파일 다운로드를 바로 띄운다. 네이티브는 파일 공유 시트가
// 따로 필요해서(expo-sharing 등) 아직 지원 안 한다.
export function downloadIcsForEvent(event: Event): void {
  if (typeof document === 'undefined') return

  const content = buildIcsContent(event)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title || 'event'}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
