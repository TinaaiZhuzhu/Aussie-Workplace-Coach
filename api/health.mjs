import { openAiKey, sendJson } from './_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  return sendJson(res, 200, { ok: true, configured: Boolean(openAiKey()), model: 'gpt-realtime-2.1' });
}

