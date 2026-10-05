import test from 'node:test';
import assert from 'node:assert/strict';
import { toDraft } from '../api/_pullEventsCore';

const base = { id: 'g1', summary: '제주 여행' };

test('시간이 지정된 여러 날 일정은 실제 종료일까지 endDate가 잡힌다', () => {
  const d = toDraft({
    ...base,
    start: { dateTime: '2026-09-24T09:00:00+09:00' },
    end: { dateTime: '2026-09-26T18:00:00+09:00' },
  })!;
  assert.equal(d.startDate, '2026-09-24');
  assert.equal(d.endDate, '2026-09-26');
  assert.equal(d.time, '09:00');
});

test('종료 시각이 자정 정각이면 그 날은 제외한다', () => {
  const d = toDraft({
    ...base,
    start: { dateTime: '2026-09-24T09:00:00+09:00' },
    end: { dateTime: '2026-09-27T00:00:00+09:00' },
  })!;
  assert.equal(d.endDate, '2026-09-26');
});

test('하루짜리 시간 일정은 endDate가 startDate와 같다', () => {
  const d = toDraft({
    ...base,
    start: { dateTime: '2026-09-24T09:00:00+09:00' },
    end: { dateTime: '2026-09-24T10:00:00+09:00' },
  })!;
  assert.equal(d.endDate, '2026-09-24');
});

test('종일 일정은 구글의 배타적 종료일에서 하루를 뺀다', () => {
  const d = toDraft({ ...base, start: { date: '2026-09-24' }, end: { date: '2026-09-27' } })!;
  assert.equal(d.endDate, '2026-09-26');
});
