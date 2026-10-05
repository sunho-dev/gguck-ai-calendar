import test from 'node:test';
import assert from 'node:assert/strict';
import { assessImport, approveImport } from '../utils/importRules';
import { parseIcsContent } from '../utils/icsImport';
import { mergeGoogleEvents } from '../utils/googlePull';
import { initialRules, parseRule } from '../utils/scheduler';
import { buildReminderPlan } from '../utils/reminderPlan';
const now = Date.parse('2026-09-17T09:00:00+09:00');
const draft = {
  title: '운동',
  startDate: '2026-09-18',
  time: '18:00',
  durationMin: 60,
  place: null,
};
test('최신01 ICS 가져오기 이후 카테고리 규칙 검사', () => {
  const drafts = parseIcsContent(
    'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:운동\nDTSTART:20260918T180000\nDTEND:20260918T190000\nEND:VEVENT\nEND:VCALENDAR',
  );
  assert.equal(drafts.length, 1);
  const result = assessImport(
    drafts,
    [],
    { ...initialRules, items: [parseRule('운동 30분 전 알림 준비물: 물')] },
    now,
  );
  assert.equal(result[0].event.category, 'exercise');
  assert.equal(result[0].event.reminderMessage, '물');
  assert.equal(result[0].event.remindMin, 30);
});
test('최신02 12시간 야간근무 가져오기 유지', () => {
  const [item] = assessImport(
    [{ ...draft, title: '야간 근무', durationMin: 720, time: '20:00' }],
    [],
    initialRules,
    now,
  );
  assert.equal(
    item.reasons.some((r) => r.type === 'invalid'),
    false,
  );
  assert.equal(item.event.durationMin, 720);
});
test('최신03 과거 ICS 기록 가져오기 허용', () => {
  const [item] = assessImport([{ ...draft, startDate: '2020-01-01' }], [], initialRules, now);
  assert.equal(
    item.reasons.some((r) => r.type === 'past'),
    false,
  );
  assert.equal(buildReminderPlan([item.event], now).length, 0);
});
test('최신04 일괄 가져오기 내부 횟수 제한', () => {
  const items = assessImport(
    [draft, { ...draft, startDate: '2026-09-19' }],
    [],
    { ...initialRules, items: [parseRule('운동 주 1회 이하')] },
    now,
  );
  assert.equal(items[0].blocked, false);
  assert.equal(items[1].blocked, true);
  assert.equal(approveImport(items, 'safe').length, 1);
});
test('최신05 일괄 예외는 각 일정에만 기록', () => {
  const rules = { ...initialRules, items: [parseRule('운동 주 1회 이하')] };
  const items = assessImport([draft, { ...draft, startDate: '2026-09-19' }], [], rules, now);
  assert.equal(approveImport(items, 'all')[1].ruleExceptions?.[0], rules.items[0].id);
  assert.equal(rules.items[0].enabled, true);
});
test('최신06 잘못된 날짜는 일괄 예외로도 등록 불가', () => {
  const items = assessImport([{ ...draft, startDate: '2026-02-30' }], [], initialRules, now);
  assert.throws(() => approveImport(items, 'all'));
});
test('최신07 비어 있는 제목은 가져오기 거절', () => {
  assert.throws(() =>
    approveImport(assessImport([{ ...draft, title: '' }], [], initialRules, now), 'all'),
  );
});
test('최신08 알림만 규칙은 일괄 등록 차단하지 않음', () => {
  const [item] = assessImport(
    [{ ...draft, time: '21:00' }],
    [],
    { ...initialRules, items: [parseRule('운동 오후 8시 이후는 알려줘')] },
    now,
  );
  assert.equal(item.blocked, false);
  assert.equal(item.reasons[0].action, 'warn');
});
test('최신09 Google 갱신은 준비물 알림을 보존하고 시각 변경 반영', () => {
  const e = {
    ...assessImport([draft], [], initialRules, now)[0].event,
    googleEventId: 'google-1',
    reminderMessage: '운동복',
  };
  const result = mergeGoogleEvents(
    [e],
    [
      {
        googleEventId: 'google-1',
        cancelled: false,
        ...draft,
        endDate: draft.startDate,
        time: '19:00',
      },
    ],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].reminderMessage, '운동복');
  assert.equal(result[0].time, '19:00');
  assert.notEqual(buildReminderPlan([e], now)[0].id, buildReminderPlan(result, now)[0].id);
});
test('최신10 Google 취소가 들어오면 꾹 알림도 제거', () => {
  const e = { ...assessImport([draft], [], initialRules, now)[0].event, googleEventId: 'google-1' };
  const result = mergeGoogleEvents(
    [e],
    [{ googleEventId: 'google-1', cancelled: true, ...draft, endDate: draft.startDate }],
  );
  assert.equal(buildReminderPlan(result, now).length, 0);
});
