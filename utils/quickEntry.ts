// "15시 회의", "오후 3시 30분 약속" 같은 짧은 문장에서 시간과 제목만 뽑아낸다.
// 날짜는 이미 캘린더에서 선택된 날짜를 쓰므로 여기서는 다루지 않는다.
const TIME_PATTERN = /(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/;

export function parseQuickEntry(text: string): { time: string; title: string } | null {
  const match = text.match(TIME_PATTERN);
  if (!match) return null;

  const [full, ampm, hourStr, minuteStr] = match;
  let hour = Number(hourStr);
  const minute = minuteStr ? Number(minuteStr) : 0;
  if (hour > 23 || minute > 59) return null;

  if (ampm === '오후' && hour < 12) hour += 12;
  if (ampm === '오전' && hour === 12) hour = 0;

  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const title = text.replace(full, '').trim() || '제목 없음';
  return { time, title };
}

export function generateEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
