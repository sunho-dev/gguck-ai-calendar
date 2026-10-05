import { addDays, addMinutesToTime } from './date';

export interface ImportedEventDraft {
  title: string;
  startDate: string;
  endDate?: string; // 여러 날에 걸친 일정의 마지막 날짜. 없으면 startDate와 같은 하루짜리로 취급
  time: string;
  durationMin: number;
  place: { name: string; address: string | null } | null;
}

// RFC 5545 .ics 파일 하나에 여러 VEVENT가 들어있을 수 있어서 전부 뽑아 배열로 반환한다.
// TZID는 무시하고 값 그대로(한국 시간 기준) 읽되, UTC(Z 접미사)만 KST로 변환한다.
export function parseIcsContent(content: string): ImportedEventDraft[] {
  const unfolded = content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n/);

  const drafts: ImportedEventDraft[] = [];
  let current: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const draft = toDraft(current);
        if (draft) drafts.push(draft);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).split(';')[0];
    const value = line.slice(idx + 1);
    current[key] = value;
  }

  return drafts;
}

function toDraft(fields: Record<string, string>): ImportedEventDraft | null {
  const summary = fields.SUMMARY;
  const dtstart = fields.DTSTART;
  if (!summary || !dtstart) return null;

  const start = parseDtValue(dtstart);
  if (!start) return null;

  let durationMin = 60;
  let endDate = start.date;
  const dtend = fields.DTEND;
  if (dtend) {
    const end = parseDtValue(dtend);
    if (end) {
      if (start.allDay && end.allDay) {
        // 종일 일정의 DTEND는 배타적(다음날 자정)이라, 실제 마지막 날짜는 하루 앞이다.
        // (여러 날짜에 걸친 여행 등 종일 일정만 여기서 다룬다. 시간 있는 일정은
        // 기존처럼 durationMin으로만 길이를 나타내고 endDate는 시작일과 같게 둔다.)
        endDate = end.date === start.date ? start.date : addDays(end.date, -1);
      } else if (!start.allDay && !end.allDay) {
        const diff = diffMinutes(start.date, start.time, end.date, end.time);
        if (diff > 0) durationMin = diff;
      }
    }
  }

  const location = fields.LOCATION;

  return {
    title: unescapeIcsText(summary),
    startDate: start.date,
    endDate,
    time: start.time,
    durationMin,
    place: location ? { name: unescapeIcsText(location), address: null } : null,
  };
}

function parseDtValue(raw: string): { date: string; time: string; allDay: boolean } | null {
  const isUtc = raw.endsWith('Z');
  const digits = raw.replace('Z', '');

  const withTime = digits.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (withTime) {
    const [, y, mo, da, h, mi] = withTime;
    const date = `${y}-${mo}-${da}`;
    const time = `${h}:${mi}`;
    const resolved = isUtc ? addMinutesToTime(date, time, 9 * 60) : { date, time };
    return { ...resolved, allDay: false };
  }

  // 종일 일정(날짜만 있음): 오전 9시로 기본값을 둔다.
  const dateOnly = digits.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, da] = dateOnly;
    return { date: `${y}-${mo}-${da}`, time: '09:00', allDay: true };
  }

  return null;
}

function diffMinutes(date1: string, time1: string, date2: string, time2: string): number {
  const start = Date.parse(`${date1}T${time1}:00+09:00`);
  const end = Date.parse(`${date2}T${time2}:00+09:00`);
  return Math.round((end - start) / 60000);
}

function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
