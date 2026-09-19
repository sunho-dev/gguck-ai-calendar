import type { ImportedEventDraft } from './icsImport'
import { retryOnRateLimit, scheduleGeminiCall } from './geminiThrottle'

const MAX_RETRIES = 2 // Gemini 무료 티어 과부하(503) 대비, utils/interpretEvent.ts와 동일한 정책
const RETRY_DELAY_MS = 1500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface RawBulkEvent {
  title: string
  startDate: string
  time: string | null
  durationMin: number | null
  place: { name: string; address: string | null } | null
}

function toDraft(raw: RawBulkEvent): ImportedEventDraft {
  return {
    title: raw.title,
    startDate: raw.startDate,
    time: raw.time ?? '09:00',
    durationMin: raw.durationMin ?? 60,
    place: raw.place,
  }
}

async function requestBulkInterpret(body: Record<string, unknown>): Promise<ImportedEventDraft[]> {
  const response = await fetch('/api/interpret-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, now: new Date().toISOString() }),
  })

  if (!response.ok) {
    // 413(요청이 너무 큼) 같은 에러는 Vercel 플랫폼이 우리 코드 전에 막아버려서
    // 응답이 JSON이 아니다. response.json()을 그대로 부르면 파싱 에러로
    // 오해하기 쉬운 메시지가 뜨니, 먼저 안전하게 시도해보고 실패하면 상태 코드로 안내한다.
    let message = `요청이 실패했습니다 (HTTP ${response.status})`
    if (response.status === 413) {
      message = '사진/파일 용량이 너무 커요. 더 작은 파일로 다시 시도해주세요.'
    } else {
      try {
        const errorBody = await response.json()
        message = errorBody?.detail ? `${errorBody.error} (${errorBody.detail})` : (errorBody?.error ?? message)
      } catch {
        // 에러 응답이 JSON이 아니면 위의 기본 메시지(상태 코드)를 그대로 쓴다.
      }
    }
    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  const responseBody = await response.json()
  return (responseBody.events as RawBulkEvent[]).map(toDraft)
}

async function withRetry(body: Record<string, unknown>): Promise<ImportedEventDraft[]> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 같은 탭에서 짧은 시간에 여러 번 요청해도 분당 한도(RPM)에 안 걸리도록 간격을 두고 보낸다.
      return await retryOnRateLimit(() => scheduleGeminiCall(() => requestBulkInterpret(body)))
    } catch (err) {
      lastError = err
      const status = (err as Error & { status?: number }).status
      if (status !== 503 || attempt === MAX_RETRIES) {
        throw err
      }
      await sleep(RETRY_DELAY_MS)
    }
  }
  throw lastError
}

export function interpretBulkTable(csvText: string, myName?: string): Promise<ImportedEventDraft[]> {
  return withRetry({ kind: 'table', content: csvText, myName })
}

export function interpretBulkImage(
  imageBase64: string,
  mimeType: string,
  myName?: string
): Promise<ImportedEventDraft[]> {
  return withRetry({ kind: 'image', imageBase64, mimeType, myName })
}
