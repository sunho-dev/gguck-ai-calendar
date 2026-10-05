import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderPlan } from '../utils/reminderPlan';
import { toEvent } from '../utils/scheduleAdapter';
import { initialRules, parseRule } from '../utils/scheduler';
import { validateJobs, validateSubscription } from '../server/pushValidation';
const now = Date.parse('2026-09-17T17:00:00+09:00');
const event = toEvent(
  { title: '운동', date: '2026-09-17', time: '18:00', duration: 60, category: 'exercise' },
  { ...initialRules, items: [parseRule('운동 30분 전 알림 준비물: 운동복')] },
);
test('예약은 KST 시작 30분 전과 준비물 사용', () => {
  const [j] = buildReminderPlan([event], now);
  assert.equal(j.at, now + 30 * 60000);
  assert.equal(j.body, '운동복');
});
test('취소하면 발송 예약에서 제외', () =>
  assert.deepEqual(buildReminderPlan([{ ...event, cancelledAt: 'yes' }], now), []));
test('시간 변경은 예약 ID와 시간을 변경', () =>
  assert.notEqual(
    buildReminderPlan([event], now)[0].id,
    buildReminderPlan([{ ...event, time: '19:00' }], now)[0].id,
  ));
test('지난 일정은 알림 생성 안함', () =>
  assert.deepEqual(buildReminderPlan([event], now + 2 * 3600000), []));
test('발송 지연 중인 미래 일정 예약은 유지', () =>
  assert.equal(buildReminderPlan([event], now + 40 * 60000).length, 1));
test('서버 중복 예약 ID 거절', () => {
  const jobs = buildReminderPlan([event], now);
  assert.throws(() => validateJobs([...jobs, ...jobs], now));
});
test('서버 알림 제한 초과 거절', () => assert.throws(() => validateJobs(Array(501).fill({}), now)));
test('서버 알림 제목 크기 검증', () =>
  assert.throws(() =>
    validateJobs([{ ...buildReminderPlan([event], now)[0], title: 'a'.repeat(201) }], now),
  ));
test('푸시 서버로 내부 네트워크 지정 불가', () =>
  assert.throws(() => validateSubscription({ endpoint: 'http://127.0.0.1', keys: {} })));
test('푸시 서버 유사 도메인 지정 불가', () =>
  assert.throws(() =>
    validateSubscription({ endpoint: 'https://fcm.googleapis.com.attacker.invalid', keys: {} }),
  ));
test('실제 푸시 도메인과 키 형식 허용', () =>
  assert.ok(
    validateSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
    }),
  ));
