import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGoogleAccount } from '../_googleAuth';
import { pullGoogleCalendarEvents, type PulledEventDraft } from '../_pullEventsCore';

interface PullResponseBody {
  connected: boolean;
  events: PulledEventDraft[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : 'local';

  const account = await getGoogleAccount(userId);
  if (!account || !account.syncEnabled) {
    res.status(200).json({ connected: false, events: [] } satisfies PullResponseBody);
    return;
  }

  try {
    const { events } = await pullGoogleCalendarEvents(account, {
      forceFull: req.query.full === '1',
    });
    res.status(200).json({ connected: true, events } satisfies PullResponseBody);
  } catch (err) {
    console.error('[pull-events] 오류:', err);
    res.status(502).json({ error: '구글 캘린더에서 일정을 가져오는 중 오류가 발생했습니다.' });
  }
}
