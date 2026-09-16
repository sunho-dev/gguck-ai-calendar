import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGoogleAccount } from '../_googleAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : 'local'

  try {
    const account = await getGoogleAccount(userId)
    res.status(200).json({
      connected: Boolean(account?.syncEnabled),
      email: account?.email ?? null,
    })
  } catch (err) {
    console.error('[google-status] 조회 실패:', err)
    res.status(200).json({ connected: false, email: null })
  }
}
