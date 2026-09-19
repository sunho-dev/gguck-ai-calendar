import type { ShiftType } from './shiftColorStore'

// 가져온 일정 제목에서 근무 유형을 짐작한다. 사진/엑셀 근무표 인식 프롬프트가 코드가
// 불명확할 때 원문을 title에 그대로 남기도록 되어 있어서(예: "야간(N) 근무"), 흔한
// 표현/약어를 순서대로 검사한다. 휴무 표현이 가장 뚜렷해서 먼저 확인한다.
export function classifyShift(title: string): ShiftType | null {
  if (/휴무|휴일|비번|오프|off/i.test(title)) return '휴일'
  if (/나이트|야간|심야|밤\s*근무|night|\(n\)|\bn\b/i.test(title)) return '나이트'
  if (/이브닝|저녁\s*근무|오후\s*근무|evening|\(e\)|\be\b/i.test(title)) return '이브닝'
  if (/데이|주간|아침\s*근무|오전\s*근무|day|\(d\)|\bd\b/i.test(title)) return '데이'
  return null
}
