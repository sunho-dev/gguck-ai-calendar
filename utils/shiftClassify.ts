import { shiftColorPalette } from '../constants/colors'

// 가져온 일정 제목에서 근무 유형 라벨을 뽑아낸다. 사진/엑셀 인식 프롬프트가 코드를
// 괄호로 덧붙이는 패턴("주간(D) 근무", "야간(N) 근무")을 쓰기 때문에, 코드와 "근무"를
// 떼어내면 사용자가 실제로 쓰는 표현("주간", "야간", "휴무")이 그대로 남는다.
export function extractShiftLabel(title: string): string {
  const stripped = title
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*근무\s*$/, '')
    .trim()
  return stripped || title.trim()
}

function suggestedKeywordColor(label: string): string | null {
  if (/휴무|휴일|비번|오프|off/i.test(label)) return shiftColorPalette[3].value
  if (/나이트|야간|심야|밤/i.test(label) || /night/i.test(label)) return shiftColorPalette[2].value
  if (/이브닝|저녁|오후/i.test(label) || /evening/i.test(label)) return shiftColorPalette[1].value
  if (/데이|주간|아침|오전/i.test(label) || /\bday\b/i.test(label)) return shiftColorPalette[0].value
  return null
}

// 새로 등장한 라벨에 배정할 기본 색을 고른다. 흔한 근무 표현이면 그에 맞는 색을,
// 아니면 아직 안 쓰인 팔레트 색을 순서대로, 그마저 다 썼으면 라벨 이름으로 안정적으로
// 하나를 골라(해시) 매번 같은 라벨엔 같은 색이 나오게 한다.
export function suggestColorForLabel(label: string, usedColors: string[]): string {
  const known = suggestedKeywordColor(label)
  if (known) return known

  const unused = shiftColorPalette.map((c) => c.value).filter((v) => !usedColors.includes(v))
  if (unused.length > 0) return unused[0]

  let hash = 0
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) % shiftColorPalette.length
  return shiftColorPalette[hash].value
}
