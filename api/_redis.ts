import { Redis } from '@upstash/redis';

// Vercel KV는 2024년 12월에 단종되고 Marketplace의 Upstash Redis로 대체됐다.
// 환경변수 이름(KV_REST_API_URL/TOKEN)은 그대로 유지되지만, @vercel/kv 패키지는
// 더 이상 업데이트되지 않아 @upstash/redis를 직접 쓴다. 구글 계정 저장소와
// Gemini 요청 조율(속도 제한)이 이 하나의 클라이언트를 공유한다.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
