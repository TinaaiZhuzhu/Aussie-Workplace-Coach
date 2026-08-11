import { requireUser, sendJson } from '../_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  return sendJson(res, 200, { id: user.id, email: user.email });
}

