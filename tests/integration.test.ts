import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlacePolicy } from '../utils/placePolicy';
import { toEvent, toSchedule, categoryKey } from '../utils/scheduleAdapter';
import { initialRules, check, stamp } from '../utils/scheduler';
import type { InterpretedEvent } from '../api/_interpretCore';
const sample: InterpretedEvent = {
  title: '일정',
  category: '기타',
  startDate: '2026-10-01',
  endDate: '2026-10-01',
  time: '10:00',
  durationMin: 60,
  place: { name: '병원', address: '만들어낸 주소' },
  placeAliasCandidate: '병원',
  remindMin: null,
  bufferMin: null,
  confidence: 'low',
  ambiguousFields: ['place', 'time', 'category'],
};
test('AI의 일반 장소 오질문과 만들어낸 주소 보정, 시간 모호성 유지', () => {
  const r = applyPlacePolicy('내일 8시 병원', sample, []);
  assert.equal(r.placeAliasCandidate, null);
  assert.equal(r.place?.address, null);
  assert.equal(r.category, '건강');
  assert.deepEqual(r.ambiguousFields, ['time']);
});
test('기억한 장소보다 명시적 공부 우선', () => {
  const r = applyPlacePolicy('내일 종숲에서 공부', sample, [
    { alias: '종숲', name: '사용자 장소', address: null, category: '클라이밍' },
  ]);
  assert.equal(r.category, '공부');
  assert.equal(r.place?.name, '사용자 장소');
});
test('새 별칭을 비슷한 이름이라는 이유로 확정하지 않음', () => {
  const e = { ...sample, place: { name: '구로숲', address: null }, placeAliasCandidate: '구로숲' };
  assert.equal(
    applyPlacePolicy('내일 구로숲', e, [
      { alias: '종숲', name: '사용자 장소', address: null, category: '클라이밍' },
    ]).placeAliasCandidate,
    '구로숲',
  );
});
test('Event 변환에서 반복 및 별칭과 알림 보존', () => {
  const s = {
    title: '운동',
    date: '2026-10-01',
    time: '20:00',
    duration: 60,
    category: 'exercise' as const,
    seriesId: 's',
    aliasTerm: '종숲',
    location: '장소',
  };
  const e = toEvent(s, initialRules);
  assert.equal(e.remindMin, 30);
  assert.equal(e.seriesId, 's');
  assert.equal(toSchedule(e).aliasTerm, '종숲');
  assert.equal(categoryKey('병원'), 'health');
});
test('기존 기간 일정도 충돌 검사에서 전체 기간 보호', () => {
  const e = toEvent(
    { title: '여행', date: '2026-10-01', time: '10:00', duration: 60, category: 'personal' },
    initialRules,
  );
  e.endDate = '2026-10-03';
  const r = check(
    { title: '회의', date: '2026-10-02', time: '12:00', duration: 60, category: 'work' },
    [toSchedule(e)],
    initialRules,
    stamp('2026-09-01', '00:00'),
  );
  assert.equal(r.ok, false);
});
