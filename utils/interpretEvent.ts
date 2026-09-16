import type { InterpretedEvent, KnownPlaceAlias } from '../api/interpret'
import { getPlaceAliases } from './placeAliasStore'

export type { InterpretedEvent, KnownPlaceAlias }

interface InterpretEventParams {
  text: string
  createdFrom?: 'share' | 'paste' | 'text' | 'voice'
}

export async function interpretEvent({ text, createdFrom }: InterpretEventParams): Promise<InterpretedEvent> {
  const storedAliases = await getPlaceAliases()
  const knownAliases: KnownPlaceAlias[] = storedAliases.map((a) => ({
    alias: a.alias,
    name: a.name,
    address: a.address,
  }))

  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      createdFrom,
      now: new Date().toISOString(),
      knownAliases,
    }),
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(body?.error ?? 'AI 해석 요청이 실패했습니다.')
  }

  return (body as { event: InterpretedEvent }).event
}
