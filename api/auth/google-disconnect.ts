import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteGoogleAccount, getGoogleAccount, revokeGoogleToken } from '../_googleAuth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : 'local';

  const account = await getGoogleAccount(userId);
  if (account) {
    await revokeGoogleToken(account.refreshToken);
    await deleteGoogleAccount(userId);
  }

  res.status(200).json({ disconnected: true });
}
