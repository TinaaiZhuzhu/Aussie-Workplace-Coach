# Public email/password authentication setup

The app uses Supabase email/password authentication and PostgreSQL Row Level Security. Resend delivers account verification and password-recovery emails. Normal sign-in does not send an email. The browser receives only the Supabase project URL and publishable key. `OPENAI_API_KEY` remains on the server.

## First-time setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the complete contents of `supabase/schema.sql`, and run it once.
3. In **Authentication → Providers → Email**, enable Email, enable new-user sign-ups, and keep email confirmation enabled.
4. In **Authentication → URL Configuration**, add `http://localhost:3000` and the eventual HTTPS production URL as allowed redirect URLs.
5. Connect Resend under **Authentication → Email → SMTP Settings** after verifying a sending domain in Resend.
6. Start the app and provide the OpenAI key, Supabase project URL, Supabase publishable key, and your allowed email.

The first successful sign-in securely migrates existing device-local learning data into your user-owned database rows. Future loads use Supabase as the authoritative store.

## Public registration

Set `REGISTRATION_MODE=public` in Vercel. Anyone can create an account, verify their email once, and then sign in with their password on any device. No database migration or allowlist update is needed. Every table already uses `user_id`, and Row Level Security restricts each person to their own rows.

The server enforces initial daily limits per user: 8 voice sessions, 12 coaching analyses, and 30 quick rewrites. Emails listed in the server-only `UNLIMITED_EMAILS` variable bypass these limits. Usage events are still recorded for monitoring.

## Production environment variables

- `OPENAI_API_KEY` — server secret
- `SUPABASE_URL` — safe to expose through `/api/config`
- `SUPABASE_PUBLISHABLE_KEY` — intended for browser use; access is constrained by Auth and RLS
- `REGISTRATION_MODE` — set to `public` for self-service registration; otherwise the server uses `ALLOWED_EMAILS`
- `ALLOWED_EMAILS` — optional private-mode comma-separated allowlist
- `UNLIMITED_EMAILS` — optional server-only comma-separated emails that bypass daily AI limits
- `PORT` — optional; defaults to `3000`

Never configure a Supabase service-role key in this application or expose one to the browser.
