import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChat,
  interpretChat,
  validateAlias,
  upsertAlias,
  applyAlias,
} from '../../utils/scheduler/personal-dictionary.js';
import { findCancellation } from '../../utils/scheduler/cancel-command.js';
const now = new Date('2026-09-16T10:00:00+09:00');
const alias = {
  term: '종숲',
  meaning: '테스트 숲길',
  location: '테스트 지역 정문',
  category: 'exercise',
};
test('다음주 금요일을 월요일 기준 다음 주로 해석', () =>
  assert.equal(normalizeChat('다음주 금요일 8시 종숲 ㄱ', now), '2026-09-25 8시 종숲'));
test('일요일에도 다음 주 월요일은 다음날', () =>
  assert.equal(
    normalizeChat('다음 주 월요일 8시 운동', new Date('2026-09-20T10:00:00+09:00')),
    '2026-09-21 8시 운동',
  ));
test('연도 경계 날짜', () =>
  assert.equal(
    normalizeChat('다음주 금요일 8시 운동', new Date('2026-12-31T10:00:00+09:00')),
    '2027-01-08 8시 운동',
  ));
test('모르는 종숲은 추측하지 않고 질문', () => {
  const r = interpretChat('다음주 금요일 8시 종숲 ㄱ', [], now);
  assert.equal(r.unknown, '종숲');
  assert.equal(r.event.location, undefined);
  assert.equal(r.event.ambiguous, true);
});
test('사용자 정의 기억 재사용', () => {
  const r = interpretChat('다음주 금요일 8시 종숲 ㄱ', [alias], now);
  assert.equal(r.unknown, null);
  assert.equal(r.event.location, alias.location);
  assert.equal(r.event.category, 'exercise');
  assert.equal(r.event.title, '테스트 숲길 운동');
  assert.equal(r.event.ambiguous, true);
});
test('명시적 활동은 기억한 기본값보다 우선', () => {
  const r = interpretChat('내일 오후 3시 종숲에서 공부', [alias], now);
  assert.equal(r.event.category, 'study');
  assert.equal(r.event.location, alias.location);
});
test('부분 문자열로 잘못 기억 적용 안 함', () =>
  assert.equal(interpretChat('내일 오후 3시 신종숲 ㄱ', [alias], now).matched, null));
test('학습 수정은 동일 키 대체, JSON 복원', () => {
  const saved = upsertAlias([alias], { ...alias, location: '새 장소' });
  assert.equal(saved.length, 1);
  assert.equal(
    interpretChat('내일 오후 3시 종숲 ㄱ', JSON.parse(JSON.stringify(saved)), now).event.location,
    '새 장소',
  );
});
test('삭제 후 다시 묻기', () =>
  assert.equal(
    interpretChat(
      '내일 오후 3시 종숲 ㄱ',
      [alias].filter((x) => x.term !== '종숲'),
      now,
    ).unknown,
    '종숲',
  ));
test('필수 정보 누락 거절', () => {
  assert.throws(() => validateAlias({ ...alias, meaning: '' }));
  assert.throws(() => validateAlias({ ...alias, category: '' }));
  assert.throws(() => validateAlias({ ...alias, term: '' }));
});
test('일반 운동은 장소 질문 안 함', () =>
  assert.equal(interpretChat('내일 오후 3시 운동', [], now).unknown, null));
test('이번만 적용은 사전을 변경하지 않음', () => {
  const entries = [];
  const e = interpretChat('내일 오후 3시 종숲 ㄱ', entries, now).event;
  assert.equal(applyAlias(e, alias).aliasTerm, '종숲');
  assert.equal(entries.length, 0);
});
test('배운 줄임말로 취소 검색 가능', () => {
  const e = { ...interpretChat('다음주 금요일 오후 8시 종숲 ㄱ', [alias], now).event, id: 'a' };
  assert.equal(
    findCancellation(normalizeChat('다음주 금요일 종숲 취소', now), [e], now).matches[0].id,
    'a',
  );
});
test('두 장소 사전 동시 적용은 임의 선택 안 함', () =>
  assert.throws(() =>
    interpretChat('내일 오후 3시 종숲 카숲 ㄱ', [alias, { ...alias, term: '카숲' }], now),
  ));
