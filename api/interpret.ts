import type { VercelRequest, VercelResponse } from '@vercel/node'
import { interpretEventText, InterpretRefusedError, type InterpretedEvent, type KnownPlaceAlias } from './_interpretCore'

export type { InterpretedEvent, KnownPlaceAlias }

interface InterpretRequestBody {
  text: string
  now?: string // ISODateTime, 상대 날짜("내일", "다음주 화요일") 해석 기준 시각
  createdFrom?: 'share' | 'paste' | 'text' | 'voice'
  knownAliases?: KnownPlaceAlias[] // 사용자가 이전에 등록해둔 개인 장소 별명 목록
}

interface InterpretResponseBody {
  event: InterpretedEvent
}

interface InterpretErrorBody {
  error: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' } satisfies InterpretErrorBody)
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' } satisfies InterpretErrorBody)
    return
  }

  const body = req.body as Partial<InterpretRequestBody> | undefined
  const text = body?.text?.trim()
  if (!text) {
    res.status(400).json({ error: 'text 필드가 필요합니다.' } satisfies InterpretErrorBody)
    return
  }
  if (text.length > 8000) {
    res.status(400).json({ error: 'text가 너무 깁니다 (최대 8000자).' } satisfies InterpretErrorBody)
    return
  }

  const nowIso = body?.now ?? new Date().toISOString()
  const knownAliases = Array.isArray(body?.knownAliases) ? body.knownAliases : []

  try {
    const event = await interpretEventText(text, nowIso, apiKey, knownAliases)
    res.status(200).json({ event } satisfies InterpretResponseBody)
  } catch (err) {
    if (err instanceof InterpretRefusedError) {
      res.status(422).json({ error: err.message } satisfies InterpretErrorBody)
      return
    }
    console.error('[api/interpret] Gemini API error:', err)
    res.status(502).json({ error: 'AI 해석 중 오류가 발생했습니다.' } satisfies InterpretErrorBody)
  }
}
