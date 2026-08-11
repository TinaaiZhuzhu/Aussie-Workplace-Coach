import { extractResponseText, openAiKey, readBody, requireUser, sendJson, trackUsage } from './_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const key = openAiKey();
  if (!key) return sendJson(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
  const { input, channel = 'Spoken meeting' } = JSON.parse((await readBody(req)).toString());
  if (!input?.trim()) return sendJson(res, 400, { error: 'Please enter what you want to say.' });
  await trackUsage(req, user, 'say_better', 'gpt-5.6-luna');
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.6-luna', input: `Rewrite this for natural professional Australian workplace English in the ${channel} channel: ${input}. Preserve the person's intent and personality. Be concise, practical and free of stereotypical slang. Return strict JSON with keys bestDefault, softer, moreDirect, spokenExample, and whyItWorks. Each wording option should be one or two sentences.`, text: { format: { type: 'json_object' } } }) });
  const output = await response.json();
  if (!response.ok) return sendJson(res, response.status, { error: output.error?.message || 'Rewrite failed' });
  return sendJson(res, 200, JSON.parse(extractResponseText(output)));
}

