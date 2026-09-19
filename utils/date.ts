import type { ISODate, ISOTime } from '../types/schema'

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

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`
}

export function addMonths(date: ISODate, amount: number): ISODate {
  const [year, month, day] = date.split('-').map(Number)
  const total = year * 12 + (month - 1) + amount
  const newYear = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  const lastDay = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate()
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

// 0=일요일 ... 6=토요일, 한국 시간 기준
function weekdayIndex(date: ISODate): number {
  return new Date(`${date}T12:00:00+09:00`).getUTCDay()
}

// 해당 월이 포함된 6주(42칸)짜리 달력 그리드를 반환한다. 앞뒤 달의 날짜도 채워서 넣는다.
export function buildMonthGrid(monthDate: ISODate): ISODate[] {
  const first = startOfMonth(monthDate)
  const gridStart = addDays(first, -weekdayIndex(first))
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

// 자정을 넘기는 소요 시간이면 날짜도 넘어간 만큼 같이 밀어준다.
// 클라이언트(구글 캘린더 링크)와 서버(api/calendar/sync-event) 양쪽에서 같이 쓴다.
export function addMinutesToTime(date: ISODate, time: ISOTime, minutes: number): { date: ISODate; time: ISOTime } {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const dayOffset = Math.floor(total / 1440)
  const wrapped = ((total % 1440) + 1440) % 1440
  const newTime = `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
  return { date: dayOffset ? addDays(date, dayOffset) : date, time: newTime }
}
