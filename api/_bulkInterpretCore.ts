import { FinishReason, GoogleGenAI, Type, type Schema } from '@google/genai'
import { InterpretRefusedError, MODEL } from './_interpretCore'

export interface BulkDraftEvent {
  title: string
  startDate: string // ISODate "YYYY-MM-DD"
  endDate: string | null // 여행처럼 여러 날에 걸친 일정의 마지막 날짜. 하루짜리면 null
  time: string | null
  durationMin: number | null
  place: { name: string; address: string | null } | null
}

const BULK_EVENTS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    // myName이 주어졌는데 자료 어디서도 그 사람을 찾지 못했을 때만 false. myName이 없거나
    // 정상적으로 찾았으면 true — 이 필드로 "엉뚱한 사람 일정을 대신 가져오는" 것을 막는다.
    nameFound: { type: Type.BOOLEAN },
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          // format: 'date'를 쓰면 Gemini가 날짜 하나라도 패턴을 못 맞췄을 때
          // ("The string did not match the expected pattern") 응답 전체를 거부한다.
          // 결과가 수십~수백 개일 수 있는 대량 추출에서는 이 위험이 커서 형식 검증은
          // 빼고 받은 뒤 normalizeDate로 관대하게 파싱한다.
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING, nullable: true },
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
        },
        required: ['title', 'startDate', 'endDate', 'time', 'durationMin', 'place'],
      },
    },
  },
  required: ['nameFound', 'events'],
}

function buildSystemPrompt(nowIso: string, hint: 'table' | 'photo', myName?: string): string {
  const lines = [
    '너는 사용자가 올린 자료에서 여러 개의 일정(캘린더 이벤트)을 한 번에 추출하는 도우미다.',
    `현재 시각은 ${nowIso} (한국 시간, KST)이다. 연도가 안 적혀 있으면 현재 시각을 기준으로 가장 가까운 미래로 추정하라.`,
    'startDate는 항상 YYYY-MM-DD 형식이다.',
    '"9/11~9/13 제주도 여행"처럼 여러 날에 걸친 일정이면 endDate에 마지막 날짜(YYYY-MM-DD)를 채워라. 하루짜리 일정이면 endDate는 null로 둔다.',
    '시간이나 소요시간이 명시되지 않은 항목은 억지로 추측해서 채우지 말고 null로 남겨라.',
    '행/항목 하나가 명확히 일정으로 보이지 않으면(예: 합계, 범례, 빈 칸) 결과에서 제외하라.',
  ]

  // 근무표는 엑셀로 내려받아도, 사진으로 찍어도 결국 "사람×날짜" 그리드 모양인 경우가
  // 흔해서 두 힌트 모두 같은 그리드 해석 규칙을 알아야 한다.
  const gridInstructions = [
    '표 맨 위에 "근무월" 같은 형태로 연-월이 적혀있으면 그 연도를 기준으로 삼고, 각 날짜 열 번호(1~31)와 조합해서 startDate를 만들어라.',
    '"/" 기호나 완전히 빈 칸은 보통 휴무(근무 없음)를 뜻하니 일정으로 만들지 마라. 오른쪽 끝의 합계/총근무 횟수 같은 열도 일정이 아니다.',
    '근무 코드(예: D/E/N, 주/야, 오픈/마감)만 적혀 있고 구체적 시간이 없으면, 코드 옆이나 표 범례에 시간 정보가 있는지 먼저 찾아보고, 정말 없으면 흔한 관례(예: D=주간 09:00, E=오후 14:00, N=야간 22:00)를 참고해 채우되 ambiguous하게 채웠다는 점을 title에 코드 원문을 그대로 남겨 알 수 있게 하라(예: title: "야간(N) 근무").',
  ]

  if (hint === 'table') {
    lines.push(
      '입력은 스프레드시트에서 추출한 표 형태 텍스트(CSV)다. 첫 줄은 헤더일 수 있다.',
      '헤더 이름이 정확히 "날짜"/"제목"이 아니어도 의미상 비슷한 열(예: date, 업무, 근무)이면 알맞게 매핑하라.',
      '단, 첫 열이 이름이고 그 다음 열들이 1,2,3...처럼 날짜 번호인 "사람×날짜" 그리드 모양이면(근무표를 그대로 내려받은 경우) 아래 규칙을 따르라.',
      ...gridInstructions
    )
  } else {
    lines.push(
      '입력은 근무표/일정표를 촬영한 사진이다. 표의 행/열 구조를 사진에서 읽어내라.',
      ...gridInstructions,
    )
  }

  if (myName && myName.trim()) {
    lines.push(
      '',
      '--- 여러 사람의 일정이 섞여 있을 때 ---',
      `이 자료에는 여러 사람의 일정/근무가 함께 표시되어 있을 수 있다. 사용자 본인의 이름(또는 표기)은 "${myName.trim()}"이다.`,
      '표에 이름으로 구분된 행/열/구역이 있으면, 반드시 이 이름과 정확히 일치하거나 명백히 동일 인물로 보이는(예: 성을 뺀 표기) 행/열/구역만 찾아 그 부분만 추출하라.',
      `이 이름이 자료 어디에도 전혀 보이지 않으면, 절대로 다른 사람의 일정을 대신 추출하거나 아무 행이나 임의로 고르지 말고 nameFound를 false로, events는 빈 배열([])로 반환하라.`,
      '표 자체에 이름 구분이 전혀 없는 자료(원래 한 사람 것만 있는 표/사진)라면 이 규칙과 무관하니 nameFound를 true로 하고 보이는 일정을 그대로 추출하라.'
    )
  } else {
    lines.push('', 'myName이 주어지지 않았으니 nameFound는 항상 true로 채워라.')
  }

  return lines.join('\n')
}

async function callGemini(
  contents: string | { text?: string; inlineData?: { mimeType: string; data: string } }[],
  nowIso: string,
  hint: 'table' | 'photo',
  apiKey: string,
  myName?: string
): Promise<BulkDraftEvent[]> {
  const client = new GoogleGenAI({ apiKey })

  const response = await client.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: buildSystemPrompt(nowIso, hint, myName),
      responseMimeType: 'application/json',
      responseSchema: BULK_EVENTS_SCHEMA,
      // 근무자·날짜가 많은 표(예: 30명 x 31일)는 결과 배열이 커질 수 있어
      // 기본값으로는 중간에 잘려서 JSON 파싱이 실패할 위험이 있다.
      maxOutputTokens: 8192,
    },
  })

  const blockReason = response.promptFeedback?.blockReason
  if (blockReason && blockReason !== 'BLOCKED_REASON_UNSPECIFIED') {
    throw new InterpretRefusedError('이 자료에서는 일정 정보를 추출할 수 없습니다.')
  }

  const finishReason = response.candidates?.[0]?.finishReason
  if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.RECITATION) {
    throw new InterpretRefusedError('이 자료에서는 일정 정보를 추출할 수 없습니다.')
  }

  const responseText = response.text
  if (!responseText) {
    throw new Error('AI 응답에서 결과를 찾을 수 없습니다.')
  }

  const parsed = JSON.parse(responseText) as { nameFound: boolean; events: BulkDraftEvent[] }

  if (myName && myName.trim() && parsed.nameFound === false) {
    throw new InterpretRefusedError('이름을 정확히 입력해 주세요.')
  }

  // format 검증을 스키마에서 뺀 대신, 여기서 관대하게 정리한다. 날짜를 못 알아보는
  // 항목은 통째로 실패시키지 않고 그 항목만 걸러낸다.
  return parsed.events
    .map((event) => {
      const startDate = normalizeDate(event.startDate)
      const normalizedEnd = event.endDate ? normalizeDate(event.endDate) : null
      // 끝나는 날짜가 시작일보다 앞이면(모델이 잘못 채운 경우) 하루짜리로 취급한다.
      const endDate = normalizedEnd && startDate && normalizedEnd >= startDate ? normalizedEnd : startDate
      return { ...event, startDate, endDate }
    })
    .filter((event): event is BulkDraftEvent => event.startDate !== null)
}

// "2026-10-1", "2026/10/01", "2026.10.1" 같은 변형도 YYYY-MM-DD로 정리한다.
function normalizeDate(raw: string): string | null {
  const match = raw?.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export async function interpretBulkTable(
  csvText: string,
  nowIso: string,
  apiKey: string,
  myName?: string
): Promise<BulkDraftEvent[]> {
  return callGemini(csvText, nowIso, 'table', apiKey, myName)
}

// Gemini가 정식으로 지원하는 이미지 형식만 통과시킨다. 브라우저/OS에 따라
// "image/jpg"(비표준) 같은 값이 넘어오거나 아예 빈 문자열일 수 있어서 방어적으로 정리한다.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])

function normalizeImageMimeType(mimeType: string): string {
  const normalized = mimeType?.toLowerCase().trim()
  if (normalized === 'image/jpg') return 'image/jpeg'
  if (normalized && SUPPORTED_IMAGE_MIME_TYPES.has(normalized)) return normalized
  return 'image/jpeg'
}

export async function interpretBulkImage(
  imageBase64: string,
  mimeType: string,
  nowIso: string,
  apiKey: string,
  myName?: string
): Promise<BulkDraftEvent[]> {
  return callGemini(
    [
      { text: '이 사진에서 일정을 모두 추출해줘.' },
      { inlineData: { mimeType: normalizeImageMimeType(mimeType), data: imageBase64 } },
    ],
    nowIso,
    'photo',
    apiKey,
    myName
  )
}
