import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const key = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const allowedEmails = new Set((process.env.ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function authenticate(req) {
  const authorization = req.headers.authorization || '';
  if (!supabaseUrl || !supabasePublishableKey || !authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabasePublishableKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return allowedEmails.has(String(user.email || '').toLowerCase()) ? user : { ...user, denied: true };
}

async function trackUsage(req, user, feature, model) {
  if (!supabaseUrl || !supabasePublishableKey || !user?.id) return;
  await fetch(`${supabaseUrl}/rest/v1/usage_events`, {
    method: 'POST',
    headers: { Authorization: req.headers.authorization, apikey: supabasePublishableKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: user.id, feature, model }),
  }).catch(() => {});
}

function coachInstructions(req) {
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

function analysisPrompt(payload) {
  const learnerTurns = payload.session.transcript.filter((turn) => turn.speaker === 'learner');
  const learnerText = learnerTurns.map((turn) => turn.text).join(' ');
  const words = learnerText.trim() ? learnerText.trim().split(/\s+/).length : 0;
  const fillerMatches = learnerText.match(/\b(um+|uh+|erm+|ah+|you know|sort of|kind of|basically|actually)\b/gi) || [];
  const evidence = {
    sessionDurationSeconds: payload.session.durationSeconds,
    learnerTurnCount: learnerTurns.length,
    learnerWordCount: words,
    fillersDetected: fillerMatches,
    turnCompletionTimes: learnerTurns.map((turn) => turn.at),
  };

  const modeCriteria = payload.session.mode === 'Small Talk'
    ? 'Assess warmth, reciprocity, natural reactions, appropriate detail, and whether the learner avoided interview-style questioning. Do not apply formal stakeholder-language standards.'
    : payload.session.mode === 'Presentation'
      ? 'Assess structure, signposting, audience clarity, confident handling of stakeholder questions, and whether the learner sustained a coherent 1–5 minute contribution.'
      : 'Assess clarity, confidence, diplomacy, concision, and appropriate workplace stakeholder language.';

  return `Analyse this Australian workplace English voice-practice transcript. Return strict JSON with keys: sessionSummary string; whatISaid string[] of important verbatim learner excerpts; corrections string[] meaningful only; naturalVersions string[]; upgradedResponses array of {myVersion,upgradedVersion,whyBetter}; deliveryFeedback {available:boolean,feedback:string,reason:string}; keepThese array max 5 of {expression,pattern,category,context,example,whyUseful}; tryAgain string|null; recurringWeaknesses string[]; tomorrowFocus string[].

Mode-specific criteria: ${modeCriteria}

For deliveryFeedback, use the supplied spoken-delivery evidence and transcript to comment specifically on filler words, hesitation patterns, response length, concision, and conversational pacing when supported. Set available=true when there is enough such evidence. Explicitly state that phoneme-level pronunciation and sentence-stress assessment are unavailable because raw audio was not retained. Do not turn that limitation into an empty section: provide all reliable spoken-delivery observations first. Never claim that a word was mispronounced from transcript text alone.

Preserve meaning and personality. Upgrade whole-response structure, clarity, confidence, diplomacy and stakeholder language.

Spoken-delivery evidence: ${JSON.stringify(evidence)}
Session: ${JSON.stringify(payload.session)}
Current playbook: ${JSON.stringify(payload.playbook)}`;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { ok: true, configured: Boolean(key), model: 'gpt-realtime-2.1' });
    }

    if (req.method === 'GET' && req.url === '/api/config') {
      if (!supabaseUrl || !supabasePublishableKey) return json(res, 503, { error: 'Authentication is not configured.' });
      return json(res, 200, { supabaseUrl, supabasePublishableKey });
    }

    let authenticatedUser = null;
    if (req.url?.startsWith('/api/')) {
      authenticatedUser = await authenticate(req);
      if (!authenticatedUser) return json(res, 401, { error: 'Authentication required.' });
      if (authenticatedUser.denied) return json(res, 403, { error: 'This email is not on the private access list.' });
    }

    if (req.method === 'GET' && req.url === '/api/auth/check') {
      return json(res, 200, { id: authenticatedUser.id, email: authenticatedUser.email });
    }

    if (req.method === 'POST' && req.url === '/api/realtime/session') {
      if (!key) return json(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
      const sdp = (await body(req)).toString();
      const form = new FormData();
      form.set('sdp', sdp);
      form.set('session', JSON.stringify({
        type: 'realtime',
        model: 'gpt-realtime-2.1',
        instructions: coachInstructions(req),
        output_modalities: ['audio'],
        audio: {
          input: {
            transcription: { model: 'gpt-4o-transcribe', language: 'en' },
            turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true },
          },
          output: { voice: 'marin' },
        },
      }));
      await trackUsage(req, authenticatedUser, 'voice_session_started', 'gpt-realtime-2.1');
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/sdp',
        'Cache-Control': 'no-store',
      });
      return res.end(await response.text());
    }

    if (req.method === 'POST' && req.url === '/api/analyse') {
      if (!key) return json(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
      const payload = JSON.parse((await body(req)).toString());
      await trackUsage(req, authenticatedUser, 'session_analysis', 'gpt-5.6-luna');
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
          input: analysisPrompt(payload),
          text: { format: { type: 'json_object' } },
        }),
      });
      const output = await response.json();
      if (!response.ok) return json(res, response.status, { error: output.error?.message || 'Analysis failed' });
      const text = output.output_text || output.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
      return json(res, 200, JSON.parse(text));
    }

    if (req.method === 'POST' && req.url === '/api/say-better') {
      if (!key) return json(res, 503, { error: 'OPENAI_API_KEY is not configured on the server.' });
      const { input, channel = 'Spoken meeting' } = JSON.parse((await body(req)).toString());
      if (!input?.trim()) return json(res, 400, { error: 'Please enter what you want to say.' });
      await trackUsage(req, authenticatedUser, 'say_better', 'gpt-5.6-luna');
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
          input: `Rewrite this for natural professional Australian workplace English in the ${channel} channel: ${input}. Preserve the person's intent and personality. Be concise, practical and free of stereotypical slang. Return strict JSON with keys bestDefault, softer, moreDirect, spokenExample, and whyItWorks. Each wording option should be one or two sentences.`,
          text: { format: { type: 'json_object' } },
        }),
      });
      const output = await response.json();
      if (!response.ok) return json(res, response.status, { error: output.error?.message || 'Rewrite failed' });
      const text = output.output_text || output.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
      return json(res, 200, JSON.parse(text));
    }

    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const raw = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const path = normalize(join(root, raw));
    if (!path.startsWith(root)) return json(res, 403, { error: 'Forbidden' });
    const file = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': raw === '/sw.js' ? 'no-cache' : 'public, max-age=60',
    });
    res.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
    console.error(error);
    json(res, 500, { error: 'Server error' });
  }
});

server.listen(port, () => console.log(`Aussie English Coach: http://localhost:${port}`));
