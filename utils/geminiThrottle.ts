// 일정 해석(단일/대량 가져오기)이 전부 같은 Gemini 프로젝트의 분당 요청 한도(RPM)를
// 공유한다. 사용자가 짧은 시간에 여러 번 몰아서 시도하면(가져오기 재시도, 연속 등록 등)
// 하루 한도(RPD)는 넉넉해도 RPM에 걸려 429가 뜰 수 있다. 이 모듈은 브라우저 탭 하나
// 안에서 모든 Gemini 호출을 하나의 대기열로 묶어 최소 간격을 두고 순서대로 내보낸다.
const MIN_INTERVAL_MS = 3000

let lastCallAt = 0
let queue: Promise<void> = Promise.resolve()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function scheduleGeminiCall<T>(fn: () => Promise<T>): Promise<T> {
  const turn = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastCallAt = Date.now()
  })
  // 이번 호출이 실패해도 대기열 자체는 끊기지 않게 에러를 여기서 삼킨다.
  queue = turn.catch(() => {})
  return turn.then(fn)
}

// 429(분당 한도 초과)는 보통 다음 1분 창이 열리면 풀리므로, 503(서버 과부하)보다
// 훨씬 길게 기다렸다가 재시도한다.
export async function retryOnRateLimit<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const status = (err as Error & { status?: number }).status
      if (status !== 429 || attempt === maxRetries) throw err
      await sleep(8000 * (attempt + 1))
    }
  }
  throw lastError
}
