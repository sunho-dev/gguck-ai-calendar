import type { InterpretedCancellation, InterpretedEvent, KnownPlaceAlias } from '../api/interpret';
import { getPlaceAliases } from './placeAliasStore';
import { retryOnRateLimit, scheduleGeminiCall } from './geminiThrottle';

export type { InterpretedEvent, InterpretedCancellation, KnownPlaceAlias };

export interface InterpretedCommand {
  intent: 'register' | 'cancel';
  event: InterpretedEvent | null;
  cancellation: InterpretedCancellation | null;
}

interface InterpretEventParams {
  text: string;
  createdFrom?: 'share' | 'paste' | 'text' | 'voice';
}

const MAX_RETRIES = 2; // Gemini 무료 티어 과부하(503) 대비 재시도 횟수
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestInterpret(
  text: string,
  createdFrom: InterpretEventParams['createdFrom'],
  knownAliases: KnownPlaceAlias[],
) {
  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      createdFrom,
      now: new Date().toISOString(),
      knownAliases,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    // detail(디버깅용 원본 에러)은 화면 문구에 안 섞고 콘솔에서만 보이게 별도로 둔다.
    const error = new Error(body?.error ?? 'AI 해석 요청이 실패했습니다.') as Error & {
      status?: number;
      detail?: string;
    };
    error.status = response.status;
    error.detail = body?.detail;
    throw error;
  }

  return body as InterpretedCommand;
}

// AI가 문장을 먼저 등록/취소 의도로 분류한 뒤, 그에 맞는 필드를 채워서 돌려준다.
// 등록이면 event, 취소면 cancellation만 채워지고 나머지는 null이다.
export async function interpretCommand({
  text,
  createdFrom,
}: InterpretEventParams): Promise<InterpretedCommand> {
  const storedAliases = await getPlaceAliases();
  const knownAliases: KnownPlaceAlias[] = storedAliases.map((a) => ({
    alias: a.alias,
    name: a.name,
    address: a.address,
    category: a.category,
  }));

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await retryOnRateLimit(() =>
        scheduleGeminiCall(() => requestInterpret(text, createdFrom, knownAliases)),
      );
    } catch (err) {
      lastError = err;
      const status = (err as Error & { status?: number }).status;
      if (status !== 503 || attempt === MAX_RETRIES) {
        throw err;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

// 등록 전용 호출부(퀵 입력 등)를 위한 하위 호환 래퍼. 취소 의도로 분류되면
// 등록 흐름에서는 처리할 수 없으므로 에러로 던져 로컬 파서 폴백을 타게 한다.
export async function interpretEvent(params: InterpretEventParams): Promise<InterpretedEvent> {
  const command = await interpretCommand(params);
  if (command.intent !== 'register' || !command.event)
    throw new Error('일정 등록 문장으로 해석하지 못했어요.');
  return command.event;
}
