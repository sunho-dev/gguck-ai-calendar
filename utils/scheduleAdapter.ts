import type { Event } from '../types/schema';
import {
  categories,
  initialRules,
  restoreRules,
  reminderFor,
  type Category,
  type Rules,
  type Schedule,
} from './scheduler';
import { generateEventId } from './quickEntry';
import { getCategory } from './categoryStore';

export function categoryKey(value: string): Category {
  const custom = getCategory(value);
  if (custom) return custom.baseCategory as Category;
  if (value in categories) return value as Category;
  if (/운동|클라이밍|헬스|산책/.test(value)) return 'exercise';
  if (/업무|회의|미팅|출근/.test(value)) return 'work';
  if (/공부|학습|수업/.test(value)) return 'study';
  if (/병원|건강|진료|치과/.test(value)) return 'health';
  return 'personal';
}
export function toSchedule(e: Event): Schedule {
  // A period event blocks its whole stored range, rather than just its first day.
  const periodDays = Math.max(0, (Date.parse(e.endDate) - Date.parse(e.startDate)) / 86400000);
  return {
    ...e,
    date: e.startDate,
    duration: e.durationMin + periodDays * 1440,
    category: categoryKey(e.category),
    location: e.place?.name,
  };
}
export function toEvent(s: Schedule, rules: Rules): Event {
  const reminder = reminderFor(s, rules);
  return {
    id: generateEventId(),
    userId: 'local',
    title: s.title,
    category: s.category,
    startDate: s.date,
    endDate: s.date,
    time: s.time,
    durationMin: s.duration,
    place: s.location ? { name: s.location, address: null, lat: 0, lng: 0 } : null,
    remindMin: reminder.minutes,
    notificationEnabled: true,
    reminderMessage: reminder.message,
    ruleExceptions: s.ruleExceptions,
    bufferMin: rules.gap,
    createdFrom: 'text',
    sharedWith: [],
    seriesId: s.seriesId,
    recurrence: s.recurrence,
    aliasTerm: s.aliasTerm,
    aliasMeaning: s.aliasMeaning,
  };
}
export function loadRules(): Rules {
  try {
    return restoreRules(JSON.parse(window.localStorage.getItem('gguck:rules') || '{}'));
  } catch {
    return initialRules;
  }
}
export function saveRules(rules: Rules) {
  window.localStorage.setItem('gguck:rules', JSON.stringify(rules));
}
