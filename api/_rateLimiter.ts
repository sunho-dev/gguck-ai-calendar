import { redis } from './_redis';

export class RateLimitedError extends Error {}

// 실제 분당 한도(RPM)는 Google AI Studio 대시보드(aistudio.google.com/rate-limit)에서
// 프로젝트/모델별로 확인해야 정확하다. 여기 기본값은 안전 마진을 크게 둔 보수적인
// 추정치라, 실제 한도를 확인한 뒤 환경변수로 얼마든지 올려도 된다.
const DEFAULT_LIMIT_PER_MINUTE = 8;

// 서버리스 함수는 인스턴스가 여러 개 동시에 뜰 수 있어서 메모리 변수로는 전체 요청 수를
// 셀 수 없다. Redis의 INCR는 여러 인스턴스에서 동시에 불러도 원자적으로 더해지므로,
// "이 1분 동안 이 기능이 몇 번 불렸는지"를 정확히 셀 수 있다. 창이 바뀌면(다음 분)
// 키 이름 자체가 달라지므로 자연스럽게 리셋되고, TTL을 걸어서 안 쓰는 키는 자동 정리한다.
export async function checkGeminiRateLimit(bucket: string): Promise<void> {
  const envKey = `GEMINI_RPM_LIMIT_${bucket.toUpperCase()}`;
  const limit = Number(process.env[envKey]) || DEFAULT_LIMIT_PER_MINUTE;

  const windowKey = `gemini-rpm:${bucket}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, 70);
  }
  if (count > limit) {
    throw new RateLimitedError(
      '지금 요청이 몰려서 잠시 처리할 수 없어요. 1분 후 다시 시도해주세요.',
    );
  }
}
