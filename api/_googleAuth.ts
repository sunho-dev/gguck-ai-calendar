import { redis } from './_redis';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// types/schema.ts GoogleAccount 주석에서 이미 정한 scope. 이벤트 단위로 좁혀서
// 구글의 "민감 범위" 심사(캘린더 전체 접근보다 완화된 경로)를 피한다.
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// userinfo API를 부르려면 calendar.events만으론 부족해서 email/profile을 더한다.
// 이 두 스코프는 민감/제한 스코프가 아니라 테스트 사용자 제한과 무관하다.
export const GOOGLE_AUTH_SCOPES = [
  GOOGLE_CALENDAR_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export interface StoredGoogleAccount {
  userId: string;
  googleUserId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISODateTime
  scope: string;
  connectedCalendarId: string;
  syncEnabled: boolean;
  connectedAt: string;
  lastSyncedAt: string | null;
  pullSyncToken?: string; // 구글 캘린더 events.list의 증분 동기화 토큰 (폴링용, 없으면 처음부터 전체 조회)
}

function kvKey(userId: string): string {
  return `google-account:${userId}`;
}

export async function getGoogleAccount(userId: string): Promise<StoredGoogleAccount | null> {
  return (await redis.get<StoredGoogleAccount>(kvKey(userId))) ?? null;
}

export async function saveGoogleAccount(account: StoredGoogleAccount): Promise<void> {
  await redis.set(kvKey(account.userId), account);
}

export async function deleteGoogleAccount(userId: string): Promise<void> {
  await redis.del(kvKey(userId));
}

// 구글 쪽에도 "gguck" 앱 접근 권한을 취소해서, 우리 저장소를 지우는 것에 그치지 않고
// 실제로 연결이 끊어지게 한다. 이미 취소됐거나 만료된 토큰이면 구글이 400을 줄 수 있는데,
// 어차피 우리 목적(연결 해제)은 달성된 상태이므로 에러로 취급하지 않는다.
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}

export function getRedirectUri(): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (!configured) {
    throw new Error('GOOGLE_REDIRECT_URI가 설정되지 않았습니다.');
  }
  return configured;
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET이 설정되지 않았습니다.');
  }
  return { clientId, clientSecret };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`토큰 교환 실패: ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<{ id: string; email: string }> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`사용자 정보 조회 실패: ${await res.text()}`);
  }
  return (await res.json()) as { id: string; email: string };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = getClientCredentials();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`토큰 갱신 실패: ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

// 만료 1분 전부터는 미리 갱신하고, 갱신된 토큰을 KV에도 반영한다.
export async function ensureFreshAccessToken(account: StoredGoogleAccount): Promise<string> {
  const expiresAt = new Date(account.expiresAt).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return account.accessToken;
  }
  const refreshed = await refreshAccessToken(account.refreshToken);
  await saveGoogleAccount({
    ...account,
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}
