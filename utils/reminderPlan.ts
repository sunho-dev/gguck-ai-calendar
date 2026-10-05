import type { Event } from '../types/schema';
import { categoryNotificationsEnabled, getCategory } from './categoryStore';
export interface PushJob {
  id: string;
  at: number;
  expires: number;
  title: string;
  body: string;
}
export const reminderMessages: Record<string, string> = {
  exercise: '운동복과 물을 챙겨 주세요.',
  work: '필요한 자료를 확인해 주세요.',
  study: '오늘 공부할 내용을 준비해 주세요.',
  health: '방문 시간과 준비할 내용을 확인해 주세요.',
  personal: '약속 시간이에요. 여유 있게 준비해 주세요.',
};
export function buildReminderPlan(events: Event[], now = Date.now()): PushJob[] {
  return events
    .filter(
      (e) =>
        !e.cancelledAt &&
        e.notificationEnabled !== false &&
        categoryNotificationsEnabled(e.category),
    )
    .flatMap((e) => {
      const start = Date.parse(`${e.startDate}T${e.time}:00+09:00`),
        at = start - e.remindMin * 60000;
      // Keep a short grace period so sync at event start cannot erase an unsent
      // zero-minute reminder before the server scheduler has had time to run.
      const expires = start + Math.min(15, Math.max(1, e.durationMin)) * 60000;
      if (
        !Number.isFinite(at) ||
        !Number.isFinite(expires) ||
        !Number.isFinite(e.remindMin) ||
        e.remindMin < 0 ||
        expires <= now
      )
        return [];
      const base = getCategory(e.category)?.baseCategory || e.category;
      return [
        {
          id: `${e.id}:${at}`,
          at,
          expires,
          title: e.title,
          body: e.reminderMessage || reminderMessages[base] || reminderMessages.personal,
        },
      ];
    })
    .sort((a, b) => a.at - b.at);
}
