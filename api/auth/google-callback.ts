import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  GOOGLE_CALENDAR_SCOPE,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  saveGoogleAccount,
  type StoredGoogleAccount,
} from '../_googleAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const userId = typeof req.query.state === 'string' ? req.query.state : 'local'
  const appBaseUrl = process.env.APP_BASE_URL ?? '/'

  const redirectHome = (status: '1' | '0', reason?: string) => {
    const url = new URL(appBaseUrl)
    url.searchParams.set('googleConnected', status)
    if (reason) url.searchParams.set('googleConnectError', reason)
    res.writeHead(302, { Location: url.toString() })
    res.end()
  }

  if (!code) {
    redirectHome('0', 'no_code')
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // prompt=consent를 항상 붙이므로 보통은 오지만, 앱 연결을 이미 해제하지 않은 채
      // 재동의한 경우 등 드물게 안 올 수 있다. 이럴 땐 사용자가 구글 계정 설정에서
      // "gguck" 연결을 끊고 다시 시도해야 한다.
      redirectHome('0', 'no_refresh_token')
      return
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token)

    const account: StoredGoogleAccount = {
      userId,
      googleUserId: userInfo.id,
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: GOOGLE_CALENDAR_SCOPE,
      connectedCalendarId: 'primary',
      syncEnabled: true,
      connectedAt: new Date().toISOString(),
      lastSyncedAt: null,
    }
    await saveGoogleAccount(account)

    redirectHome('1')
  } catch (err) {
    console.error('[google-callback] 연동 실패:', err)
    redirectHome('0', 'exchange_failed')
  }
}
