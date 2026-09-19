import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ApiError } from '@google/genai'
import { InterpretRefusedError } from './_interpretCore'
import { interpretBulkImage, interpretBulkTable, type BulkDraftEvent } from './_bulkInterpretCore'
import { resolveGeminiKey } from './_geminiKey'
import { checkGeminiRateLimit, RateLimitedError } from './_rateLimiter'

interface BulkRequestBody {
  kind: 'table' | 'image'
  content?: string // kind: 'table'일 때 CSV 텍스트
  imageBase64?: string // kind: 'image'일 때
  mimeType?: string // kind: 'image'일 때
  now?: string
  myName?: string // 여러 사람이 섞인 표/사진에서 본인 일정만 골라내기 위한 힌트
}

interface BulkResponseBody {
  events: BulkDraftEvent[]
}

interface ErrorBody {
  error: string
  detail?: string // 디버깅용 원본 에러 메시지 일부 (해커톤 개발 단계라 임시로 노출)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' } satisfies ErrorBody)
    return
  }

  let apiKey: string, bucket: string
  try {
    ;({ apiKey, bucket } = resolveGeminiKey('GEMINI_API_KEY_BULK'))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message } satisfies ErrorBody)
    return
  }

  const body = req.body as Partial<BulkRequestBody> | undefined
  const nowIso = body?.now ?? new Date().toISOString()

  try {
    await checkGeminiRateLimit(bucket)
    let events: BulkDraftEvent[]

    if (body?.kind === 'table') {
      const content = body.content?.trim()
      if (!content) {
        res.status(400).json({ error: 'content 필드가 필요합니다.' } satisfies ErrorBody)
        return
      }
      if (content.length > 20000) {
        res.status(400).json({ error: '표 데이터가 너무 큽니다 (최대 20000자).' } satisfies ErrorBody)
        return
      }
      events = await interpretBulkTable(content, nowIso, apiKey, body.myName)
    } else if (body?.kind === 'image') {
      if (!body.imageBase64 || !body.mimeType) {
        res.status(400).json({ error: 'imageBase64/mimeType 필드가 필요합니다.' } satisfies ErrorBody)
        return
      }
      events = await interpretBulkImage(body.imageBase64, body.mimeType, nowIso, apiKey, body.myName)
    } else {
      res.status(400).json({ error: 'kind는 table 또는 image여야 합니다.' } satisfies ErrorBody)
      return
    }

    res.status(200).json({ events } satisfies BulkResponseBody)
  } catch (err) {
    if (err instanceof RateLimitedError) {
      res.status(429).json({ error: err.message } satisfies ErrorBody)
      return
    }
    if (err instanceof InterpretRefusedError) {
      res.status(422).json({ error: err.message } satisfies ErrorBody)
      return
    }
    console.error('[interpret-bulk] 오류:', err)
    if (err instanceof ApiError && err.status === 503) {
      res.status(503).json({ error: 'AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.' } satisfies ErrorBody)
      return
    }
    if (err instanceof ApiError && err.status === 429) {
      res
        .status(429)
        .json({ error: 'AI 요청 한도에 걸렸어요. 잠시 후 다시 시도해주세요.', detail: err.message.slice(0, 300) } satisfies ErrorBody)
      return
    }
    const detail = err instanceof Error ? err.message.slice(0, 300) : undefined
    res.status(502).json({ error: 'AI 해석 중 오류가 발생했습니다.', detail } satisfies ErrorBody)
  }
}
