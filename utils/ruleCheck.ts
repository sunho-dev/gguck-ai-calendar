import type { Event, Rule } from '../types/schema';

export interface CheckResult {
  result: 'pass' | 'warn' | 'block';
  reason?: string;
  alternatives?: { date: string; time: string }[];
}

/**
 * TODO(김창민): 실제 규칙 검사 로직으로 교체.
 * 팀 보드 합의 시그니처: check(새 일정, 기존 일정들, 규칙들) → { 결과: 통과|경고|차단, 이유, 대안 날짜 }
 * 지금은 창민의 규칙 엔진이 없는 동안 항상 "통과"를 돌려주는 가짜(스텁)이다.
 * 완성되면 이 함수 본문만 실제 구현으로 바꾸면 되고, 호출부(AssistantScreen 등)는 손댈 필요 없음.
 */
export function check(_newEvent: Event, _existingEvents: Event[], _rules: Rule[]): CheckResult {
  return { result: 'pass' };
}
