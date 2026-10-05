import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPermanentRule,
  parseRule,
  validateRule,
  PERIOD_RULE_MESSAGE,
} from '../utils/scheduler';
import { interpretRuleInput } from '../utils/ruleInput';
import handler from '../api/rules/interpret';
import { buildReminderPlan } from '../utils/reminderPlan';
import { toEvent } from '../utils/scheduleAdapter';
import { initialRules } from '../utils/scheduler';
const periods = [
  '일주일간 클라이밍 금지',
  '일주일 동안 클라이밍 금지',
  '1주일간 운동 금지',
  '2주 동안 운동 금지',
  '이번 주만 운동 금지',
  '다음 달 업무 금지',
  '9월 30일까지 운동 금지',
  '2026-09-30까지 운동 금지',
  '당분간 클라이밍 금지',
  '오늘부터 운동 금지',
  '한 달 동안 운동 금지',
  '하루만 운동 금지',
];
for (const text of periods)
  test('기간제 차단: ' + text, () =>
    assert.throws(() => parseRule(text), { message: PERIOD_RULE_MESSAGE }),
  );
for (const text of [
  '운동 주 3회 이하',
  '클라이밍 일주일 3회 이하',
  '운동 다음 날은 쉬기',
  '운동 2일 쉬기',
  '주말 업무는 확인해줘',
  '운동 30분 전 알림',
  '스터디 바로 등록',
])
  test('상시 규칙 유지: ' + text, () => assert.ok(parseRule(text)));
test('기간제 조건을 AI가 영구 규칙으로 바꿔도 저장 검증에서 거절', () =>
  assert.throws(() => validateRule({ ...parseRule('운동 주 3회 이하'), text: periods[0] }), {
    message: PERIOD_RULE_MESSAGE,
  }));
test('알림 메시지 속 내일은 적용 기간으로 오인하지 않음', () =>
  assert.doesNotThrow(() => assertPermanentRule('운동 30분 전 알림 메시지: 내일 병원 준비물')));
test('기간제는 브라우저에서 API 호출 없이 차단', async () => {
  let calls = 0;
  await assert.rejects(
    interpretRuleInput(periods[0], (async () => {
      calls++;
      throw Error('must not call');
    }) as typeof fetch),
    { message: PERIOD_RULE_MESSAGE },
  );
  assert.equal(calls, 0);
});
test('직접 API 요청도 기간제 거절 (AI 키 불필요)', async () => {
  let status = 200;
  let body: any;
  const res = {
    setHeader() {},
    status(n: number) {
      status = n;
      return this;
    },
    json(v: unknown) {
      body = v;
      return this;
    },
  };
  await handler({ method: 'POST', body: { text: periods[0] } } as any, res as any);
  assert.equal(status, 422);
  assert.equal(body.code, 'PERIOD_RULE_UNSUPPORTED');
  assert.equal(body.error, PERIOD_RULE_MESSAGE);
});
test('일반 예시는 API에 의존하지 않음', async () =>
  assert.equal(
    (
      await interpretRuleInput('운동 주 3회 이하', (() => {
        throw Error('network');
      }) as typeof fetch)
    ).type,
    'weeklyLimit',
  ));
test('AI 지시문 문구 대신 사용 가능한 안내 표시', async () => {
  await assert.rejects(
    interpretRuleInput(
      '클라이밍을 적당히 제한해줘',
      (async () =>
        new Response(JSON.stringify({ error: '한국어 확인 질문' }), {
          status: 422,
        })) as typeof fetch,
    ),
    /지원하는 규칙/,
  );
});
test('서버 장애를 사용자 문장 오류로 표시하지 않음', async () => {
  await assert.rejects(
    interpretRuleInput(
      '클라이밍을 적당히 제한해줘',
      (async () => new Response('bad gateway', { status: 502 })) as typeof fetch,
    ),
    /서버에 연결하지 못/,
  );
});
test('성공 상태라도 규칙 데이터 누락이면 저장 불가', async () => {
  await assert.rejects(
    interpretRuleInput(
      '클라이밍을 적당히 제한해줘',
      (async () => new Response('{}', { status: 200 })) as typeof fetch,
    ),
    /해석 결과를 받지 못/,
  );
});
const start = Date.parse('2026-09-20T18:00:00+09:00');
const event = toEvent(
  { title: '클라이밍', date: '2026-09-20', time: '18:00', duration: 60, category: 'exercise' },
  { ...initialRules, reminders: { ...initialRules.reminders, exercise: 0 } },
);
test('시작 시각 알림은 정각 동기화에서도 남음', () =>
  assert.equal(buildReminderPlan([event], start).length, 1));
test('예약 실행 지연 1분에도 시작 알림 유지', () =>
  assert.equal(buildReminderPlan([event], start + 60000).length, 1));
test('15분 지난 알림은 발송 대기에서 제거', () =>
  assert.equal(buildReminderPlan([event], start + 15 * 60000).length, 0));
test('짧은 일정은 종료 이후 지연 알림 없음', () =>
  assert.equal(buildReminderPlan([{ ...event, durationMin: 5 }], start + 5 * 60000).length, 0));
test('정각에도 취소 일정은 예약 제거', () =>
  assert.equal(buildReminderPlan([{ ...event, cancelledAt: 'cancelled' }], start).length, 0));
