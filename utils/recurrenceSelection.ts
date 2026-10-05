import { addDays, todayKST, stamp, type Recurrence } from './scheduler';
export const repeatLabels = {
  none: '반복 없음',
  daily: '매일',
  weekdays: '평일',
  weekly: '매주',
  monthly: '매월',
};
export type RepeatMode = keyof typeof repeatLabels;
export function recurrenceFor(
  mode: RepeatMode,
  date: string,
  previous?: Recurrence | null,
): Recurrence | null {
  if (mode === 'none') return null;
  const anchor = Number.isFinite(stamp(date, '12:00')) ? date : todayKST();
  const weekday = new Date(anchor + 'T12:00:00+09:00').getUTCDay();
  return {
    frequency: mode,
    days: previous?.days?.length ? previous.days : [weekday],
    monthDay: previous?.monthDay || Number(anchor.slice(-2)),
    until: previous?.until || addDays(anchor, 27),
  };
}
