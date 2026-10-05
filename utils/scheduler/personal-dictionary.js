import { todayKST, addDays, categories } from './engine.js';
import { parseSchedule, weekday } from './recurrence.js';
import { commonMeaning, explicitActivity } from './common-language.js';
export function normalizeChat(text, now = new Date()) {
  const base = todayKST(now),
    monday = addDays(base, -((weekday(base) + 6) % 7));
  return text
    .replace(/(이번|다음|다다음)\s*주\s*([월화수목금토일])요일/g, (_, week, day) =>
      addDays(monday, { 이번: 0, 다음: 7, 다다음: 14 }[week] + '월화수목금토일'.indexOf(day)),
    )
    .replace(/(?:\s|^)(?:ㄱㄱ?|고고|가자)[!.~?]*\s*$/, '')
    .trim();
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (term) =>
  new RegExp('(^|\\s)' + escape(term) + '(?=$|\\s|에서|으로|에(?:\\s|$)|로(?:\\s|$))', 'i');
export function validateAlias(value) {
  const term = value.term?.trim(),
    meaning = value.meaning?.trim(),
    location = value.location?.trim() || '';
  if (!term || term.length > 30 || /\n/.test(term)) throw Error('줄임말은 1~30자로 입력해 주세요.');
  if (!meaning || meaning.length > 80) throw Error('뜻 또는 전체 이름을 1~80자로 입력해 주세요.');
  if (location.length > 150) throw Error('장소 설명은 150자 이내로 입력해 주세요.');
  if (!Object.hasOwn(categories, value.category))
    throw Error('이 표현에 사용할 카테고리를 선택해 주세요.');
  return { term, meaning, location, category: value.category };
}
export function upsertAlias(entries, value) {
  const alias = validateAlias(value);
  return [...entries.filter((e) => e.term.toLowerCase() !== alias.term.toLowerCase()), alias];
}
export function applyAlias(event, value) {
  const a = validateAlias(value),
    explicit = explicitActivity(event.title.replace(matcher(a.term), ' '));
  let title = event.title.replace(matcher(a.term), (_, prefix) => prefix + a.meaning);
  const category = explicit || a.category;
  if (title === a.meaning) title += ' ' + (category === 'personal' ? '방문' : categories[category]);
  return {
    ...event,
    title,
    category,
    location: a.location || a.meaning,
    aliasTerm: a.term,
    aliasMeaning: a.meaning,
    interpretationSource: 'personal_dictionary',
  };
}
export function interpretChat(text, entries = [], now = new Date()) {
  const normalized = normalizeChat(text, now),
    event = parseSchedule(normalized, now);
  const matches = entries
    .filter((e) => matcher(e.term).test(event.title))
    .sort((a, b) => b.term.length - a.term.length);
  if (matches.length) {
    const chosen = matches[0];
    if (
      matches
        .slice(1)
        .some((a) => matcher(a.term).test(event.title.replace(matcher(chosen.term), ' ')))
    )
      throw Error('여러 개인 사전 표현이 있어요. 한 장소씩 나누어 입력해 주세요.');
    return { event: applyAlias(event, chosen), matched: chosen, unknown: null };
  }
  if (commonMeaning(event.title).location) return { event, matched: null, unknown: null };
  const title = event.title.trim(),
    known =
      /^(운동|헬스|러닝|수영|요가|클라이밍|산책|진료|진찰|건강검진|검진|예방접종|치료|회의|업무|미팅|출근|근무|공부|독서|학습|수업|약속|식사|점심|저녁)$/;
  const at = title.match(/^(.+?)(?:에서|으로)\s/);
  const candidate = (at ? at[1] : title).trim();
  const chatCue = /(?:ㄱㄱ?|고고|가자)[!.~?]*\s*$/.test(text);
  const unknown =
    !known.test(candidate) && candidate.length <= 30 && (at || !candidate.includes(' ') || chatCue)
      ? candidate
      : null;
  return { event, matched: null, unknown };
}
