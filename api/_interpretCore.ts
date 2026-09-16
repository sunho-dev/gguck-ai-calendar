import Anthropic from '@anthropic-ai/sdk'

export interface InterpretedEvent {
  title: string
  category: string
  startDate: string // ISODate "YYYY-MM-DD"
  endDate: string // ISODate "YYYY-MM-DD"
  time: string | null // ISOTime "HH:mm", null이면 시간 미지정(종일 일정 등)
  durationMin: number | null
  place: { name: string; address: string } | null // 좌표는 클라이언트에서 지오코딩
  remindMin: number | null
  bufferMin: number | null
  confidence: 'high' | 'medium' | 'low'
  ambiguousFields: string[] // 모델이 추측/불확실하게 채운 필드명
}

export class InterpretRefusedError extends Error {}

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    category: { type: 'string' },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    time: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    durationMin: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    place: {
      anyOf: [
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
          },
          required: ['name', 'address'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    remindMin: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    bufferMin: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    ambiguousFields: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'category',
    'startDate',
    'endDate',
    'time',
    'durationMin',
    'place',
    'remindMin',
    'bufferMin',
    'confidence',
    'ambiguousFields',
  ],
  additionalProperties: false,
} as const

function buildSystemPrompt(nowIso: string): string {
  return [
    '너는 사용자가 붙여넣거나 공유한 텍스트(카카오톡 대화, 공지, 초대장 등)에서 일정 정보를 추출하는 도우미다.',
    `현재 시각은 ${nowIso} (한국 시간, KST)이다. "내일", "다음주 화요일", "이번 주말" 같은 상대적 날짜 표현은 이 시각을 기준으로 계산하라.`,
    'startDate/endDate는 항상 YYYY-MM-DD 형식이다. 기간이 없는 단일 일정이면 startDate와 endDate를 동일하게 채워라.',
    '텍스트에 명시되지 않은 값(시간, 장소, 소요 시간 등)은 추측하지 말고 null로 남겨라. 다만 title과 category는 항상 채워야 하며, 정보가 부족하면 텍스트 내용을 바탕으로 합리적으로 요약하라.',
    'category는 "회의", "약속", "여행", "병원", "기타" 등 텍스트 성격에 맞는 짧은 한국어 단어로 분류하라.',
    '모델이 추측했거나 확신이 낮은 필드가 있으면 ambiguousFields 배열에 해당 필드명을 넣고, confidence를 낮춰라.',
  ].join('\n')
}

export async function interpretEventText(text: string, nowIso: string, apiKey: string): Promise<InterpretedEvent> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 1024,
    system: buildSystemPrompt(nowIso),
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: EVENT_SCHEMA },
    },
    messages: [{ role: 'user', content: text }],
  })

  if (response.stop_reason === 'refusal') {
    throw new InterpretRefusedError('이 텍스트에서는 일정 정보를 추출할 수 없습니다.')
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI 응답에서 결과를 찾을 수 없습니다.')
  }

  return JSON.parse(textBlock.text) as InterpretedEvent
}
