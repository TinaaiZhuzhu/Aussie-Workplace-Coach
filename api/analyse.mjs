import { analysisPrompt, enforceDailyLimit, extractResponseText, openAiKey, readBody, requireUser, sendJson, trackUsage } from './_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  if (!await enforceDailyLimit(req, res, user, 'session_analysis', 12)) return;
  const key = openAiKey();
  if (!key) return sendJson(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
  const payload = JSON.parse((await readBody(req)).toString());
  await trackUsage(req, user, 'session_analysis', 'gpt-5.6-luna');
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.6-luna', input: analysisPrompt(payload), text: { format: { type: 'json_object' } } }) });
  const output = await response.json();
  if (!response.ok) return sendJson(res, response.status, { error: output.error?.message || 'Analysis failed' });
  return sendJson(res, 200, JSON.parse(extractResponseText(output)));
}
