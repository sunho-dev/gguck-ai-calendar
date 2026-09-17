import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GOOGLE_AUTH_SCOPES, getRedirectUri } from '../_googleAuth'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    res.status(500).send('GOOGLE_CLIENT_ID가 설정되지 않았습니다.')
    return
  }

  let redirectUri: string
  try {
    redirectUri = getRedirectUri()
  } catch (err) {
    res.status(500).send((err as Error).message)
    return
  }

  // 지금은 익명 단일 사용자(userId: 'local')만 지원한다. 나중에 실제 다중 사용자를 붙이면
  // 여기 state에 실제 사용자 id를 실어 보내고 콜백에서 그대로 꺼내 쓰면 된다.
  const userId = typeof req.query.userId === 'string' ? req.query.userId : 'local'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_AUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  })

  res.writeHead(302, { Location: `${AUTH_ENDPOINT}?${params.toString()}` })
  res.end()
}
