import type { ISODate } from '../types/schema'

const TIME_ZONE = 'Asia/Seoul'

export function todayISODate(): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// 정오를 기준으로 계산해서 DST 없는 한국 시간대에서도 날짜 경계 문제가 생기지 않게 한다.
export function addDays(date: ISODate, amount: number): ISODate {
  const ms = Date.parse(`${date}T12:00:00+09:00`) + amount * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

export function formatWeekday(date: ISODate): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: TIME_ZONE, weekday: 'short' }).format(
    new Date(`${date}T12:00:00+09:00`)
  )
}

export function formatMonthLabel(date: ISODate): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00+09:00`))
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(-2))
}
