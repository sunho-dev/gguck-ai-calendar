import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GOOGLE_AUTH_SCOPES, getRedirectUri } from '../_googleAuth';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(500).send('GOOGLE_CLIENT_ID가 설정되지 않았습니다.');
    return;
  }

  let redirectUri: string;
  try {
    redirectUri = getRedirectUri();
  } catch (err) {
    res.status(500).send((err as Error).message);
    return;
  }

  // 로그인 없이 브라우저별로 계정을 구분하기 위해, 클라이언트(utils/anonUserId.ts)가
  // 브라우저마다 발급해 localStorage에 저장해둔 익명 id를 그대로 받아 state에 실어 보낸다.
  // 콜백에서 이 state를 그대로 꺼내 그 브라우저의 계정으로 저장한다. 값이 안 오면(구버전
  // 클라이언트 등) 예전처럼 'local' 하나로 합쳐진다.
  const userId = typeof req.query.userId === 'string' ? req.query.userId : 'local';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_AUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  });

  res.writeHead(302, { Location: `${AUTH_ENDPOINT}?${params.toString()}` });
  res.end();
}
