import type { InterpretedEvent } from '../api/interpret'

export type { InterpretedEvent }

interface InterpretEventParams {
  text: string
  createdFrom?: 'share' | 'paste' | 'text' | 'voice'
}

export async function interpretEvent({ text, createdFrom }: InterpretEventParams): Promise<InterpretedEvent> {
  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      createdFrom,
      now: new Date().toISOString(),
    }),
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error(body?.error ?? 'AI 해석 요청이 실패했습니다.')
  }

  return (body as { event: InterpretedEvent }).event
}
