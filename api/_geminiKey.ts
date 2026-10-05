// 기능별로 별도 Gemini API 키(=별도 Google Cloud 프로젝트)를 등록해두면 그 기능은
// 독립된 할당량 풀을 갖게 된다. 아직 안 만들었으면 공용 GEMINI_API_KEY로 자동 폴백한다.
// bucket은 _rateLimiter.ts에서 분당 요청 수를 세는 단위이기도 해서, 같은 키를 쓰는
// 기능들은 실제로 같은 할당량을 나눠 쓰는 게 맞으므로 같은 bucket('shared')으로 묶인다.
export function resolveGeminiKey(dedicatedEnvVar: string): { apiKey: string; bucket: string } {
  const dedicated = process.env[dedicatedEnvVar];
  if (dedicated) return { apiKey: dedicated, bucket: dedicatedEnvVar };

  const shared = process.env.GEMINI_API_KEY;
  if (!shared) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  return { apiKey: shared, bucket: 'shared' };
}
