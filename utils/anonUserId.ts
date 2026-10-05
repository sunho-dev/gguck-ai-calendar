const STORAGE_KEY = 'gguck-anon-user-id';

// 로그인 없이도 브라우저마다 서로 다른 구글 연동 상태를 가지려면 각자를 구분할 값이 필요하다.
// 실제 계정 시스템 대신, 브라우저에 한 번 발급한 익명 id를 localStorage에 저장해두고 재사용한다.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAnonUserId(): string {
  if (typeof window === 'undefined') return 'local';
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return 'local';
  }
}
