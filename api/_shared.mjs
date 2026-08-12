const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const allowedEmails = new Set((process.env.ALLOWED_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
const registrationMode = process.env.REGISTRATION_MODE === 'public' ? 'public' : 'private';

export function sendJson(res, status, value) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(value);
}

export async function readBody(req) {
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function authenticate(req) {
  const authorization = req.headers.authorization || '';
  if (!supabaseUrl || !supabasePublishableKey || !authorization.startsWith('Bearer ')) return { status: 401 };
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabasePublishableKey },
  });
  if (!response.ok) return { status: 401 };
  const user = await response.json();
  if (registrationMode !== 'public' && !allowedEmails.has(String(user.email || '').toLowerCase())) return { status: 403, user };
  return { status: 200, user };
}

export async function requireUser(req, res) {
  const result = await authenticate(req);
  if (result.status === 401) sendJson(res, 401, { error: 'Authentication required.' });
  if (result.status === 403) sendJson(res, 403, { error: 'This email is not on the private access list.' });
  return result.status === 200 ? result.user : null;
}

export async function trackUsage(req, user, feature, model) {
  if (!supabaseUrl || !supabasePublishableKey || !user?.id) return;
  await fetch(`${supabaseUrl}/rest/v1/usage_events`, {
    method: 'POST',
    headers: { Authorization: req.headers.authorization, apikey: supabasePublishableKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: user.id, feature, model }),
  }).catch(() => {});
}

export async function enforceDailyLimit(req, res, user, feature, limit) {
  if (!supabaseUrl || !supabasePublishableKey || !user?.id) return true;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const query = new URLSearchParams({ user_id: `eq.${user.id}`, feature: `eq.${feature}`, created_at: `gte.${start.toISOString()}`, select: 'id' });
  const response = await fetch(`${supabaseUrl}/rest/v1/usage_events?${query}`, { headers: { Authorization: req.headers.authorization, apikey: supabasePublishableKey } });
  if (!response.ok) return true;
  const events = await response.json();
  if (events.length < limit) return true;
  sendJson(res, 429, { error: `Daily ${feature.replaceAll('_', ' ')} limit reached. Try again tomorrow.` });
  return false;
}

export function publicConfig() {
  return { supabaseUrl, supabasePublishableKey, registrationMode };
}

export function coachInstructions(req) {
  const mode = decodeURIComponent(req.headers['x-practice-mode'] || 'Meeting');
  const level = req.headers['x-difficulty'] || '2';
  const scenario = decodeURIComponent(req.headers['x-scenario'] || '');
  const targets = decodeURIComponent(req.headers['x-playbook'] || '');
  const modeGuidance = mode === 'Presentation'
    ? 'Let the learner deliver an uninterrupted presentation for up to five minutes. Listen first; only afterwards ask realistic stakeholder questions.'
    : mode === 'Small Talk'
      ? 'Keep it warm and reciprocal. React naturally, share small details, and avoid turning the exchange into an interview.'
      : 'Keep turns short and let the learner speak most.';
  return `You are role-playing a realistic Australian workplace participant for spoken English practice. Mode: ${mode}. Difficulty: Level ${level}. Scenario: ${scenario}. Speak in natural professional Australian English without stereotypical slang or an exaggerated accent. Stay in character and do not teach or correct during role-play. ${modeGuidance} Use realistic ambiguity, disagreement, interruptions, or questions appropriate to the mode and difficulty. If this is Playbook Review, create situations that invite these patterns without naming them: ${targets || 'none supplied'}. Start naturally and maintain the scenario until the user ends it.`;
}

export function analysisPrompt(payload) {
  const learnerTurns = payload.session.transcript.filter(turn => turn.speaker === 'learner');
  const learnerText = learnerTurns.map(turn => turn.text).join(' ');
  const words = learnerText.trim() ? learnerText.trim().split(/\s+/).length : 0;
  const fillerMatches = learnerText.match(/\b(um+|uh+|erm+|ah+|you know|sort of|kind of|basically|actually)\b/gi) || [];
  const evidence = { sessionDurationSeconds: payload.session.durationSeconds, learnerTurnCount: learnerTurns.length, learnerWordCount: words, fillersDetected: fillerMatches, turnCompletionTimes: learnerTurns.map(turn => turn.at) };
  const modeCriteria = payload.session.mode === 'Small Talk'
    ? 'Assess warmth, reciprocity, natural reactions, appropriate detail, and whether the learner avoided interview-style questioning. Do not apply formal stakeholder-language standards.'
    : payload.session.mode === 'Presentation'
      ? 'Assess structure, signposting, audience clarity, confident handling of stakeholder questions, and whether the learner sustained a coherent 1–5 minute contribution.'
      : 'Assess clarity, confidence, diplomacy, concision, and appropriate workplace stakeholder language.';
  return `Analyse this Australian workplace English voice-practice transcript. Return strict JSON with keys: sessionSummary string; whatISaid string[] of important verbatim learner excerpts; corrections string[] meaningful only; naturalVersions string[]; upgradedResponses array of {myVersion,upgradedVersion,whyBetter}; deliveryFeedback {available:boolean,feedback:string,reason:string}; keepThese array max 5 of {expression,pattern,category,context,example,whyUseful}; tryAgain string|null; recurringWeaknesses string[]; tomorrowFocus string[].

Mode-specific criteria: ${modeCriteria}

For deliveryFeedback, use the supplied spoken-delivery evidence and transcript to comment specifically on filler words, hesitation patterns, response length, concision, and conversational pacing when supported. Set available=true when there is enough such evidence. Explicitly state that phoneme-level pronunciation and sentence-stress assessment are unavailable because raw audio was not retained. Never claim that a word was mispronounced from transcript text alone.

Preserve meaning and personality. Upgrade whole-response structure, clarity, confidence, diplomacy and stakeholder language.

Spoken-delivery evidence: ${JSON.stringify(evidence)}
Session: ${JSON.stringify(payload.session)}
Current playbook: ${JSON.stringify(payload.playbook)}`;
}

export function extractResponseText(output) {
  return output.output_text || output.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
}

export function openAiKey() { return process.env.OPENAI_API_KEY; }
