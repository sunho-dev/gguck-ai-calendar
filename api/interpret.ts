import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ApiError } from '@google/genai'
import { interpretEventText, InterpretRefusedError, type InterpretedEvent, type InterpretedCancellation, type KnownPlaceAlias } from './_interpretCore'
import { resolveGeminiKey } from './_geminiKey'
import { checkGeminiRateLimit, RateLimitedError } from './_rateLimiter'

export type { InterpretedEvent, InterpretedCancellation, KnownPlaceAlias }

interface InterpretRequestBody {
  text: string
  now?: string // ISODateTime, 상대 날짜("내일", "다음주 화요일") 해석 기준 시각
  createdFrom?: 'share' | 'paste' | 'text' | 'voice'
  knownAliases?: KnownPlaceAlias[] // 사용자가 이전에 등록해둔 개인 장소 별명 목록
}

interface InterpretResponseBody {
  intent: 'register' | 'cancel'
  event: InterpretedEvent | null
  cancellation: InterpretedCancellation | null
}

interface InterpretErrorBody {
  error: string
  detail?: string // 디버깅용 원본 에러 메시지 일부 (해커톤 개발 단계라 임시로 노출)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' } satisfies InterpretErrorBody)
    return
  }

  let apiKey: string, bucket: string
  try {
    ;({ apiKey, bucket } = resolveGeminiKey('GEMINI_API_KEY_INTERPRET'))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message } satisfies InterpretErrorBody)
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
    await checkGeminiRateLimit(bucket)
    const command = await interpretEventText(text, nowIso, apiKey, knownAliases)
    res.status(200).json({ intent: command.intent, event: command.event, cancellation: command.cancellation } satisfies InterpretResponseBody)
  } catch (err) {
    if (err instanceof RateLimitedError) {
      res.status(429).json({ error: err.message } satisfies InterpretErrorBody)
      return
    }
    if (err instanceof InterpretRefusedError) {
      res.status(422).json({ error: err.message } satisfies InterpretErrorBody)
      return
    }
    console.error('[api/interpret] Gemini API error:', err)
    if (err instanceof ApiError && err.status === 503) {
      res.status(503).json({ error: 'AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.' } satisfies InterpretErrorBody)
      return
    }
    if (err instanceof ApiError && err.status === 429) {
      res
        .status(429)
        .json({ error: 'AI 요청 한도에 걸렸어요. 잠시 후 다시 시도해주세요.', detail: err.message.slice(0, 300) } satisfies InterpretErrorBody)
      return
    }
    res.status(502).json({ error: 'AI 해석 중 오류가 발생했습니다.' } satisfies InterpretErrorBody)
  }
}
