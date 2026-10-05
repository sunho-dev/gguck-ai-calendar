import type { Event } from '../types/schema';
import { generateEventId } from './quickEntry';
import { getAnonUserId } from './anonUserId';

export interface PulledEventDraft {
  googleEventId: string;
  cancelled: boolean;
  title: string;
  startDate: string;
  endDate: string;
  time: string;
  durationMin: number;
  place: { name: string; address: string | null } | null;
}

export async function pullGoogleEvents(forceFull = false): Promise<PulledEventDraft[]> {
  try {
    const res = await fetch(
      `/api/calendar/pull-events?userId=${getAnonUserId()}${forceFull ? '&full=1' : ''}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { connected: boolean; events: PulledEventDraft[] };
    return body.connected ? body.events : [];
  } catch (err) {
    console.warn('[google-pull] 실패:', err);
    return [];
  }
}

// 구글에서 받아온 초안을 기존 로컬 일정과 합친다. googleEventId로 이미 있는 일정을 찾아서:
// - 취소된 것이면 로컬 쪽도 취소 처리
// - 있으면 구글 쪽 내용(제목/시간/장소)으로 갱신하되, 로컬에서만 관리하는 값(카테고리/알림/버퍼)은 보존
// - 없으면 새 로컬 이벤트로 추가 (카테고리는 기본값)
// 두 곳에서 같은 일정을 동시에 고친 경우엔 방금 받아온 구글 쪽 내용을 그대로 우선한다 —
// 폴링이라 항상 최신을 보장할 수 없어서, 일단은 "마지막으로 확인한 구글 상태"를 기준으로 삼는다.
export function mergeGoogleEvents(local: Event[], pulled: PulledEventDraft[]): Event[] {
  if (pulled.length === 0) return local;

  const result = [...local];
  for (const draft of pulled) {
    const idx = result.findIndex((e) => e.googleEventId === draft.googleEventId);

    if (draft.cancelled) {
      if (idx !== -1 && !result[idx].cancelledAt) {
        result[idx] = { ...result[idx], cancelledAt: new Date().toISOString() };
      }
      continue;
    }

    if (idx !== -1) {
      result[idx] = {
        ...result[idx],
        title: draft.title,
        startDate: draft.startDate,
        endDate: draft.endDate,
        time: draft.time,
        durationMin: draft.durationMin,
        place: draft.place ? { ...draft.place, lat: 0, lng: 0 } : result[idx].place,
      };
    } else {
      const newEvent: Event = {
        id: generateEventId(),
        userId: 'local',
        title: draft.title,
        category: 'personal',
        startDate: draft.startDate,
        endDate: draft.endDate,
        time: draft.time,
        durationMin: draft.durationMin,
        place: draft.place ? { ...draft.place, lat: 0, lng: 0 } : null,
        remindMin: 0,
        bufferMin: 0,
        createdFrom: 'text',
        sharedWith: [],
        googleEventId: draft.googleEventId,
      };
      result.push(newEvent);
    }
  }
  return result;
}
