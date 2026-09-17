import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureFreshAccessToken, getGoogleAccount, saveGoogleAccount } from '../_googleAuth'
import { addMinutesToTime } from '../../utils/date'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

interface SyncEventPayload {
  title: string
  startDate: string
  endDate: string
  time: string
  durationMin: number
  place: { name: string; address: string | null } | null
  remindMin?: number
}

interface SyncRequestBody {
  userId?: string
  action: 'create' | 'update' | 'delete'
  googleEventId?: string | null
  event?: SyncEventPayload
}

interface SyncResponseBody {
  connected: boolean
  googleEventId?: string | null
}

function toRfc3339(date: string, time: string): string {
  return `${date}T${time}:00+09:00`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = req.body as Partial<SyncRequestBody> | undefined
  const userId = body?.userId ?? 'local'

  const account = await getGoogleAccount(userId)
  if (!account || !account.syncEnabled) {
    res.status(200).json({ connected: false } satisfies SyncResponseBody)
    return
  }

  try {
    const accessToken = await ensureFreshAccessToken(account)
    const calendarId = encodeURIComponent(account.connectedCalendarId)
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }

    if (body?.action === 'delete') {
      if (body.googleEventId) {
        const delRes = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events/${body.googleEventId}`, {
          method: 'DELETE',
          headers,
        })
        // 이미 지워졌거나 없는 이벤트면 404/410이 정상이므로 에러로 취급하지 않는다.
        if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
          throw new Error(`삭제 실패: ${await delRes.text()}`)
        }
      }
      await saveGoogleAccount({ ...account, lastSyncedAt: new Date().toISOString() })
      res.status(200).json({ connected: true, googleEventId: null } satisfies SyncResponseBody)
      return
    }

    if (!body?.event) {
      res.status(400).json({ error: 'event 필드가 필요합니다.' })
      return
    }

    const { date: endDate, time: endTime } = addMinutesToTime(
      body.event.startDate,
      body.event.time,
      body.event.durationMin
    )

    const payload = {
      summary: body.event.title,
      start: { dateTime: toRfc3339(body.event.startDate, body.event.time), timeZone: 'Asia/Seoul' },
      end: { dateTime: toRfc3339(endDate, endTime), timeZone: 'Asia/Seoul' },
      location: body.event.place
        ? [body.event.place.name, body.event.place.address].filter(Boolean).join(' ')
        : undefined,
      reminders:
        body.event.remindMin && body.event.remindMin > 0
          ? { useDefault: false, overrides: [{ method: 'popup', minutes: body.event.remindMin }] }
          : { useDefault: false, overrides: [] },
    }

    const isUpdate = body.action === 'update' && Boolean(body.googleEventId)
    const url = isUpdate
      ? `${CALENDAR_API}/calendars/${calendarId}/events/${body.googleEventId}`
      : `${CALENDAR_API}/calendars/${calendarId}/events`

    const apiRes = await fetch(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!apiRes.ok) {
      throw new Error(`동기화 실패: ${await apiRes.text()}`)
    }
    const created = (await apiRes.json()) as { id: string }

    await saveGoogleAccount({ ...account, lastSyncedAt: new Date().toISOString() })
    res.status(200).json({ connected: true, googleEventId: created.id } satisfies SyncResponseBody)
  } catch (err) {
    console.error('[sync-event] 오류:', err)
    res.status(502).json({ error: '구글 캘린더 동기화 중 오류가 발생했습니다.' })
  }
}
