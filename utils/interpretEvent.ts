import type { InterpretedEvent, KnownPlaceAlias } from '../api/interpret'
import { getPlaceAliases } from './placeAliasStore'
import { getCategories } from './categoryStore'

export type { InterpretedEvent, KnownPlaceAlias }

interface InterpretEventParams {
  text: string
  createdFrom?: 'share' | 'paste' | 'text' | 'voice'
}

const MAX_RETRIES = 2 // Gemini 무료 티어 과부하(503) 대비 재시도 횟수
const RETRY_DELAY_MS = 1500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestInterpret(
  text: string,
  createdFrom: InterpretEventParams['createdFrom'],
  knownAliases: KnownPlaceAlias[],
  knownCategories: string[],
) {
  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      createdFrom,
      now: new Date().toISOString(),
      knownAliases,
      knownCategories,
    }),
  })

  const body = await response.json()

  if (!response.ok) {
    const error = new Error(body?.error ?? 'AI 해석 요청이 실패했습니다.')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return (body as { event: InterpretedEvent }).event
}

export async function interpretEvent({ text, createdFrom }: InterpretEventParams): Promise<InterpretedEvent> {
  const [storedAliases, storedCategories] = await Promise.all([getPlaceAliases(), getCategories()])
  const knownAliases: KnownPlaceAlias[] = storedAliases.map((a) => ({
    alias: a.alias,
    name: a.name,
    address: a.address,
    category: a.category,
  }))
  const knownCategories = storedCategories.map((c) => c.name)

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestInterpret(text, createdFrom, knownAliases, knownCategories)
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
