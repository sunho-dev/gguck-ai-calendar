import { assertPermanentRule, parseRule, validateRule, type PersonalRule } from './scheduler';
export const RULE_HELP =
  '지원하는 규칙을 한 가지씩 입력해 주세요. 예: 클라이밍 주 3회 이하, 운동 다음 날은 쉬기';
export function ruleErrorMessage(value: unknown, fallback = RULE_HELP) {
  return typeof value === 'string' && value.trim() && !/한국어\s*(확인\s*질문|해석)/.test(value)
    ? value
    : fallback;
}
export async function interpretRuleInput(
  text: string,
  request: typeof fetch = fetch,
): Promise<PersonalRule> {
  assertPermanentRule(text);
  try {
    return parseRule(text);
  } catch {}
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await request('/api/rules/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const fallback =
        response.status === 429
          ? '요청이 많아요. 잠시 후 다시 시도해 주세요.'
          : response.status >= 500
            ? '규칙 해석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
            : RULE_HELP;
      throw Error(ruleErrorMessage(body?.error, fallback));
    }
    if (!body?.rule) throw Error('규칙 해석 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    // The user's original condition must survive AI conversion and validation.
    return validateRule({ ...body.rule, text });
  } catch (e) {
    if (controller.signal.aborted) throw Error('규칙 해석 시간이 초과됐어요. 다시 시도해 주세요.');
    if (e instanceof TypeError) throw Error('인터넷 연결을 확인하고 다시 시도해 주세요.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
