import { coachInstructions, openAiKey, readBody, requireUser, sendJson, trackUsage } from '../_shared.mjs';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const key = openAiKey();
  if (!key) return sendJson(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
  const sdp = (await readBody(req)).toString();
  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify({ type: 'realtime', model: 'gpt-realtime-2.1', instructions: coachInstructions(req), output_modalities: ['audio'], audio: { input: { transcription: { model: 'gpt-4o-transcribe', language: 'en' }, turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true } }, output: { voice: 'marin' } } }));
  await trackUsage(req, user, 'voice_session_started', 'gpt-realtime-2.1');
  const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  res.status(response.status).setHeader('Content-Type', response.headers.get('content-type') || 'application/sdp').setHeader('Cache-Control', 'no-store').send(await response.text());
}

