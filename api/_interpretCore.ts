import { FinishReason, GoogleGenAI, Type, type Schema } from '@google/genai'

export interface InterpretedEvent {
  title: string
  category: string
  startDate: string // ISODate "YYYY-MM-DD"
  endDate: string // ISODate "YYYY-MM-DD"
  time: string | null // ISOTime "HH:mm", null이면 시간 미지정(종일 일정 등)
  durationMin: number | null
  place: { name: string; address: string | null } | null // 확실히 알거나(등록된 별명) 그럴듯하게 추측한 장소. 주소는 모를 수 있음
  placeAliasCandidate: string | null // place가 사용자의 개인적인 장소 별명일 수 있다고 판단되면, 텍스트에 쓰인 원문 그대로. 확실한 일반 장소명이면 null
  remindMin: number | null
  bufferMin: number | null
  confidence: 'high' | 'medium' | 'low'
  ambiguousFields: string[] // 모델이 추측/불확실하게 채운 필드명
}

export interface KnownPlaceAlias {
  alias: string // "종숲"
  name: string // "서울숲클라이밍 종로점"
  address: string | null
  category: string | null // "클라이밍". 등록되어 있으면 이 별명이 나올 때 AI가 자동으로 이 카테고리를 쓴다
}

export class InterpretRefusedError extends Error {}

// Gemini 자체 Schema 포맷(OpenAPI 서브셋) 사용. responseJsonSchema(표준 JSON Schema)는
// 이 SDK/모델 조합에서 404를 유발해서, 정식 지원 필드인 responseSchema로 전환.
const EVENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    category: { type: Type.STRING },
    startDate: { type: Type.STRING, format: 'date' },
    endDate: { type: Type.STRING, format: 'date' },
    time: { type: Type.STRING, nullable: true },
    durationMin: { type: Type.INTEGER, nullable: true },
    place: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        name: { type: Type.STRING },
        address: { type: Type.STRING, nullable: true },
      },
      required: ['name', 'address'],
    },
    placeAliasCandidate: { type: Type.STRING, nullable: true },
    remindMin: { type: Type.INTEGER, nullable: true },
    bufferMin: { type: Type.INTEGER, nullable: true },
    confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
    ambiguousFields: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'title',
    'category',
    'startDate',
    'endDate',
    'time',
    'durationMin',
    'place',
    'placeAliasCandidate',
    'remindMin',
    'bufferMin',
    'confidence',
    'ambiguousFields',
  ],
}

function buildSystemPrompt(nowIso: string, knownAliases: KnownPlaceAlias[]): string {
  const lines = [
    '너는 사용자가 붙여넣거나 공유한 텍스트(카카오톡 대화, 공지, 초대장 등)에서 일정 정보를 추출하는 도우미다.',
    `현재 시각은 ${nowIso} (한국 시간, KST)이다. "내일", "다음주 화요일", "이번 주말" 같은 상대적 날짜 표현은 이 시각을 기준으로 계산하라.`,
    'startDate/endDate는 항상 YYYY-MM-DD 형식이다. 기간이 없는 단일 일정이면 startDate와 endDate를 동일하게 채워라.',
    '텍스트에 명시되지 않은 값(시간, 소요 시간 등)은 추측하지 말고 null로 남겨라. 다만 title과 category는 항상 채워야 하며, 정보가 부족하면 텍스트 내용을 바탕으로 합리적으로 요약하라.',
    'category는 "회의", "약속", "여행", "병원", "기타" 등 텍스트 성격에 맞는 짧은 한국어 단어로 분류하라.',
    '모델이 추측했거나 확신이 낮은 필드가 있으면 ambiguousFields 배열에 해당 필드명을 넣고, confidence를 낮춰라.',
    '',
    '--- 장소(place) 처리 규칙: 반드시 지킬 것 ---',
    '텍스트를 볼 때, 날짜/시간 표현도 아니고 "가자/ㄱ/보자/콜" 같은 행동 유도 표현도 아닌 명사(특히 2~4글자 정도의 짧은 단어)가 있으면, 그건 장소일 가능성이 매우 높다. 조사("~에서", "~에")가 안 붙어있어도, 심지어 처음 보는 낯선 단어라도 절대 무시하지 말고 place 후보로 취급하라. 장소로 보이는 단어를 그냥 버리고(null로 남기고) 넘어가는 것이 가장 흔한 실수이니 특히 주의하라.',
  ]

  if (knownAliases.length > 0) {
    lines.push('1) 아래는 이 사용자가 이전에 등록해둔 개인 장소 별명 목록이다. 텍스트에 이 별명이 그대로(정확히 일치) 나오면, place를 해당 장소 정보로 채워라. 이 별명에 카테고리가 등록되어 있으면 event의 category도 반드시 그 카테고리 값으로 채워라(네가 따로 추측한 다른 카테고리로 바꾸지 말 것). 이 경우 place도 category도 confidence를 낮추지 말고 ambiguousFields에도 넣지 마라. placeAliasCandidate는 null로 둔다.')
    lines.push(
      knownAliases
        .map((a) => `  - "${a.alias}" = ${a.name}${a.address ? ` (${a.address})` : ''}${a.category ? `, 카테고리: ${a.category}` : ''}`)
        .join('\n'),
    )
    lines.push(
      '2) 텍스트의 장소 표현이 별명 목록에 정확히는 없지만, 목록에 있는 별명들과 비슷한 작명 패턴(예: 지역 앞글자 + 공통 단어 조합)으로 만들어진 것처럼 보이면, 그 패턴을 참고해 어떤 장소일지 조심스럽게 추측하여 place를 채워라. 패턴이 유사한 기존 별명에 카테고리가 있으면 category도 그 값으로 채워라. 이 경우 반드시 ambiguousFields에 "place"와 "category"를 넣고 confidence를 낮추며, placeAliasCandidate에는 텍스트에 쓰인 원문 그대로(예: "잠숲")를 넣어라 — 사용자에게 맞는지 확인받기 위함이다.',
    )
    lines.push(
      '3) 별명 목록과 무관하고 패턴 추측도 불가능하면 아래 3번 규칙을 따르라.',
    )
  } else {
    lines.push('1), 2) 이 사용자는 아직 등록된 장소 별명이 없다. 아래 3번 규칙을 따르라.')
  }

  lines.push(
    '3) place.name에는 텍스트에 쓰인 장소로 보이는 표현을 원문 그대로 넣고, address는 모르면 null로 남겨라(지어내지 마라). 이 표현이 흔한 일반 지명/상호(예: "강남역 스타벅스")면 placeAliasCandidate는 null로 둔다. 반면 사전에 없을 법한 짧은 단어·줄임말이면(예: "종숲", "잠숲") placeAliasCandidate에 그 원문을 넣고 ambiguousFields에 "place"를 추가하라 — 이런 경우 place도 null로 두지 말고 원문 그대로 채워야 한다.',
    '오직 텍스트 전체를 다 읽어봐도 장소로 볼 만한 단어가 정말 하나도 없을 때만 place와 placeAliasCandidate를 둘 다 null로 둔다.',
    '',
    '--- 예시 ---',
    '입력: "내일 5시 종숲 ㄱ" (별명 목록이 비어있는 경우)',
    '올바른 출력의 place, placeAliasCandidate 부분: place: {"name": "종숲", "address": null}, placeAliasCandidate: "종숲", ambiguousFields에 "place" 포함',
    '(틀린 예 1: place와 placeAliasCandidate를 둘 다 null로 남기는 것 — "종숲"은 시간 표현도 행동 유도 표현도 아니므로 반드시 장소 후보로 잡아야 한다)',
    '(틀린 예 2: place.name에 "홍대", "강남" 등 텍스트에 없는 다른 지명을 채우는 것 — 절대 금지. place.name은 반드시 텍스트에 실제로 적힌 글자 그대로여야 하며, 네가 아는 유명한 지명으로 바꿔치기하면 안 된다)',
    '',
    '--- 절대 규칙 ---',
    'place.name은 항상 텍스트 원문에 실제로 등장하는 단어/구절 그대로여야 한다. 텍스트에 없는 지명이나 상호를 너의 일반 지식으로 지어내서 채우는 것은 명백한 오류다. 어떤 장소인지 모르겠으면 텍스트에 적힌 표현을 그대로 쓰고 ambiguousFields로 표시할 뿐, 절대 다른 실제 지명으로 대체하지 마라.',
  )

  return lines.join('\n')
}

// gemini-2.5-flash는 신규 사용자에게 더 이상 제공되지 않음(404).
// gemini-3.6-flash는 추출 품질이 불안정, gemini-3.8-flash는 무료 티어 수요 폭주로 503.
// 중간 안정 버전인 gemini-3.5-flash로 시도.
const MODEL = 'gemini-3.5-flash'

export async function interpretEventText(
  text: string,
  nowIso: string,
  apiKey: string,
  knownAliases: KnownPlaceAlias[] = [],
): Promise<InterpretedEvent> {
  const client = new GoogleGenAI({ apiKey })

  const response = await client.models.generateContent({
    model: MODEL,
    contents: text,
    config: {
      systemInstruction: buildSystemPrompt(nowIso, knownAliases),
      responseMimeType: 'application/json',
      responseSchema: EVENT_SCHEMA,
    },
  })

  const blockReason = response.promptFeedback?.blockReason
  if (blockReason && blockReason !== 'BLOCKED_REASON_UNSPECIFIED') {
    throw new InterpretRefusedError('이 텍스트에서는 일정 정보를 추출할 수 없습니다.')
  }

  const finishReason = response.candidates?.[0]?.finishReason
  if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.RECITATION) {
    throw new InterpretRefusedError('이 텍스트에서는 일정 정보를 추출할 수 없습니다.')
  }

  const responseText = response.text
  if (!responseText) {
    throw new Error('AI 응답에서 결과를 찾을 수 없습니다.')
  }

  return JSON.parse(responseText) as InterpretedEvent
}
