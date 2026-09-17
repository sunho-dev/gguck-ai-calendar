// 여러 사람이 같이 나오는 근무표/엑셀에서 "내 근무만" 골라내려면 AI에게 이름을 알려줘야 한다.
// 매번 물어보지 않도록 웹 localStorage에 저장해두고 재사용한다.
const STORAGE_KEY = 'gguck-my-name-v1'

export function loadMyName(): string {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return ''
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveMyName(name: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // 저장 실패해도 앱 동작에는 지장 없게 조용히 무시한다.
  }
}
