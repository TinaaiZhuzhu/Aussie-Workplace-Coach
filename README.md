# Aussie Workplace English Coach — voice-first MVP

## Run securely

Requires Node.js 20+ and an OpenAI API project key. Configure `OPENAI_API_KEY` only in the server environment—never in HTML, JavaScript, browser storage, or the PWA. Then run `npm start` and open `http://localhost:3000` on the same computer.

For iPhone use, deploy the app behind HTTPS and configure the same server-side secret in the hosting platform. A local file or insecure LAN URL cannot reliably request iPhone microphone permission.

## Architecture

The browser creates a WebRTC peer connection and sends its SDP offer to `/api/realtime/session`. The Node backend combines the SDP with the coaching session configuration and authenticates to OpenAI's unified `/v1/realtime/calls` endpoint. The API key never reaches the browser. `gpt-realtime-2.1` handles low-latency speech-to-speech interaction; semantic VAD provides natural turn detection and WebRTC handles barge-in/truncation. `gpt-4o-mini-transcribe` supplies learner transcripts. After End Session, `gpt-5.6-luna` analyses the transcript into structured coaching feedback.

The app stores sessions, transcripts, feedback, expressions, learning metadata, notes and daily progress in Supabase. Every row is scoped by `user_id` and protected by Row Level Security. Browser storage is only a local cache and migration source. Raw audio is not retained.

## Vercel deployment

The `api/` directory contains Vercel Functions for authentication checks, OpenAI Realtime session creation, coaching analysis and quick rewrites. Configure these Vercel environment variables for Production and Preview:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_EMAILS`
- `UNLIMITED_EMAILS` (server-only comma-separated emails that bypass daily AI limits)
- `REGISTRATION_MODE` (`public` enables self-service email/password registration)

Never commit `.aussie-config.json`, `.openai-key.secure`, `.env`, or a Supabase secret/service-role key. After deployment, add the exact HTTPS production origin to Supabase Authentication URL Configuration as the Site URL and an allowed Redirect URL.

For a learning-oriented explanation of the complete login setup, see `LOGIN-AUTHENTICATION-GUIDE.md`.

## iPhone / installed PWA limitations

- Microphone access requires HTTPS, explicit permission and a user gesture.
- Keep the app foregrounded and the screen awake. iOS may suspend WebRTC when the screen locks, Safari is backgrounded, or an interruption such as a phone call occurs.
- Route changes, Bluetooth devices and low-power mode can interrupt audio. The app preserves transcript already received and shows connection errors.
- Audio playback begins from the Start button gesture, but iOS device policies can still require volume/unmute changes.
- PWA installation improves launch behaviour but does not remove iOS background/WebRTC restrictions.

## Cost and accounts

Realtime conversation uses `gpt-realtime-2.1`; current list pricing is token-based: audio input $32 and audio output $64 per 1M audio tokens, plus text/context tokens ($4 input, $24 output per 1M). Actual cost per 10–20 minute session varies with speaking balance, response length, transcript context and caching, so measure usage in the OpenAI dashboard instead of relying on a fixed per-minute estimate. Post-session analysis uses `gpt-5.6-luna` and is usually much smaller than the audio cost.

These calls require a separately billed OpenAI API account/project and API key. ChatGPT Plus or Pro does not automatically cover API usage. Store the key as the hosting platform's server-side secret named `OPENAI_API_KEY`.

## Test checklist

1. Check `/api/health` reports `configured: true`.
2. On iPhone Safari over HTTPS, grant microphone permission and start each practice type.
3. Confirm both voices are audible, listening/thinking/speaking states change, and speaking over the AI interrupts it.
4. Test mute/unmute, denied permission, offline/network loss, Bluetooth route change and a phone interruption.
5. End the session and verify transcript excerpts, corrections, whole-response upgrades and up to five saved expressions.
6. Confirm the session appears in History and expressions appear in Playbook; confirm no audio blob or API key exists in browser storage.
