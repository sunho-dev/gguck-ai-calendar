// 근무 유형은 사용자마다 다르게 부를 수 있어서(주간/데이/오전 등) 고정된 목록이 아니라,
// 실제로 가져온 일정 제목에서 뽑아낸 라벨을 그대로 키로 써서 색을 저장한다.
export type ShiftColorMap = Record<string, string>;

const STORAGE_KEY = 'gguck-shift-colors-v2';

export function loadShiftColors(): ShiftColorMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ShiftColorMap;
  } catch {
    return {};
  }
}

export function saveShiftColors(colors: ShiftColorMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // 저장 실패해도 이번 세션 내 사용에는 지장 없어서 조용히 무시한다.
  }
}
