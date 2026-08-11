import { publicConfig, sendJson } from './_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const config = publicConfig();
  if (!config.supabaseUrl || !config.supabasePublishableKey) return sendJson(res, 503, { error: 'Authentication is not configured.' });
  return sendJson(res, 200, config);
}

