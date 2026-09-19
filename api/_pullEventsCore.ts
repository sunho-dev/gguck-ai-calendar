import { ensureFreshAccessToken, saveGoogleAccount, type StoredGoogleAccount } from './_googleAuth'
import { addDays } from '../utils/date'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// 구글 캘린더 이벤트 하나를 우리 Event 형태에 맞게 옮긴 초안. 로컬 전용 필드(카테고리,
// 알림 등)는 여기서 채우지 않고, 이미 있는 로컬 이벤트와 합칠 때(merge) 결정한다.
export interface PulledEventDraft {
  googleEventId: string
  cancelled: boolean
  title: string
  startDate: string
  endDate: string
  time: string
  durationMin: number
  place: { name: string; address: string | null } | null
}

export interface GoogleEventItem {
  id: string
  status?: string
  summary?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

interface GoogleEventsListResponse {
  items: GoogleEventItem[]
  nextPageToken?: string
  nextSyncToken?: string
}

export class SyncTokenExpiredError extends Error {}

function toDatePart(value: string): string {
  return value.slice(0, 10)
}

function toTimePart(dateTime: string): string {
  const match = dateTime.match(/T(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : '09:00'
}

function diffMinutes(startIso: string, endIso: string): number {
  const diff = (Date.parse(endIso) - Date.parse(startIso)) / 60000
  if (!Number.isFinite(diff)) return 60
  return Math.max(15, Math.round(diff))
}

export function toDraft(item: GoogleEventItem): PulledEventDraft | null {
  if (item.status === 'cancelled') {
    return { googleEventId: item.id, cancelled: true, title: '', startDate: '', endDate: '', time: '', durationMin: 0, place: null }
  }

  const startDateTime = item.start?.dateTime
  const endDateTime = item.end?.dateTime
  const startDateOnly = item.start?.date
  const endDateOnly = item.end?.date

  if (startDateTime && endDateTime) {
    const startDate = toDatePart(startDateTime)
    let endDate = toDatePart(endDateTime)
    // 시간이 지정된 일정이 여러 날에 걸칠 수 있다(예: 24일 09:00 ~ 26일 18:00 여행).
    // 종료 시각이 자정 정각이면 그 날은 실제로 포함되지 않으니 하루 앞당긴다.
    if (endDate > startDate && toTimePart(endDateTime) === '00:00') endDate = addDays(endDate, -1)
    if (endDate < startDate) endDate = startDate
    return {
      googleEventId: item.id,
      cancelled: false,
      title: item.summary?.trim() || '(제목 없음)',
      startDate,
      endDate,
      time: toTimePart(startDateTime),
      durationMin: diffMinutes(startDateTime, endDateTime),
      place: item.location ? { name: item.location, address: null } : null,
    }
  }

  if (startDateOnly && endDateOnly) {
    // 종일 일정: 구글의 end.date는 배타적(다음날 자정)이라 하루 앞당겨야 실제 마지막 날짜가 된다.
    return {
      googleEventId: item.id,
      cancelled: false,
      title: item.summary?.trim() || '(제목 없음)',
      startDate: startDateOnly,
      endDate: addDays(endDateOnly, -1),
      time: '09:00',
      durationMin: 60,
      place: item.location ? { name: item.location, address: null } : null,
    }
  }

  return null
}

async function listPage(
  accessToken: string,
  calendarId: string,
  params: URLSearchParams
): Promise<GoogleEventsListResponse> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 410) {
    throw new SyncTokenExpiredError('syncToken이 만료되었습니다. 전체 재동기화가 필요합니다.')
  }
  if (!res.ok) {
    throw new Error(`구글 캘린더 조회 실패: ${await res.text()}`)
  }
  return (await res.json()) as GoogleEventsListResponse
}

// 처음 동기화하는 계정 기준: 너무 오래된/먼 미래 일정까지 다 가져오면 무한 반복 일정 등에서
// 결과가 지나치게 커질 수 있어, 최근 7일 ~ 앞으로 180일로 창을 제한한다. syncToken이 생긴
// 뒤로는 이 창과 무관하게 변경분만 증분으로 받는다.
function initialWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now()
  return {
    timeMin: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// forceFull: 이미 syncToken이 있어도 무시하고 전체를 다시 받는다. 증분 동기화는 "바뀐"
// 일정만 보내주기 때문에, 예전에 잘못 저장된 일정(예: 기간이 하루로 잘린 것)은 구글 쪽이
// 바뀌지 않는 한 영영 다시 오지 않아서 고칠 방법이 없다.
export async function pullGoogleCalendarEvents(
  account: StoredGoogleAccount,
  options: { forceFull?: boolean } = {}
): Promise<{ events: PulledEventDraft[]; resyncedFromScratch: boolean }> {
  const accessToken = await ensureFreshAccessToken(account)
  const calendarId = account.connectedCalendarId

  const fetchAll = async (syncToken?: string): Promise<{ items: GoogleEventItem[]; nextSyncToken: string | undefined }> => {
    const items: GoogleEventItem[] = []
    let pageToken: string | undefined
    let nextSyncToken: string | undefined

    do {
      const params = new URLSearchParams({ maxResults: '250' })
      if (pageToken) params.set('pageToken', pageToken)
      if (syncToken) {
        params.set('syncToken', syncToken)
      } else {
        const { timeMin, timeMax } = initialWindow()
        params.set('singleEvents', 'true')
        params.set('timeMin', timeMin)
        params.set('timeMax', timeMax)
      }

      const page = await listPage(accessToken, calendarId, params)
      items.push(...page.items)
      pageToken = page.nextPageToken
      if (page.nextSyncToken) nextSyncToken = page.nextSyncToken
    } while (pageToken)

    return { items, nextSyncToken }
  }

  let resyncedFromScratch = false
  let result
  try {
    result = await fetchAll(options.forceFull ? undefined : account.pullSyncToken)
  } catch (err) {
    if (!(err instanceof SyncTokenExpiredError)) throw err
    resyncedFromScratch = true
    result = await fetchAll(undefined)
  }

  await saveGoogleAccount({
    ...account,
    accessToken,
    pullSyncToken: result.nextSyncToken ?? account.pullSyncToken,
    lastSyncedAt: new Date().toISOString(),
  })

  const events = result.items.map(toDraft).filter((e): e is PulledEventDraft => e !== null)
  return { events, resyncedFromScratch }
}
