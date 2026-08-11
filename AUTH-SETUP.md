# Private authentication setup

The app uses Supabase passwordless email authentication. The browser receives only the Supabase project URL and publishable key. `OPENAI_API_KEY` remains on the Node server and is never returned to the browser.

## First-time setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the complete contents of `supabase/schema.sql`, and run it once.
3. In **Authentication → Providers → Email**, enable Email and disable public user sign-ups.
4. In **Authentication → URL Configuration**, add `http://localhost:3000` and the eventual HTTPS production URL as allowed redirect URLs.
5. In **Authentication → Users**, invite your own email address.
6. Start the app and provide the OpenAI key, Supabase project URL, Supabase publishable key, and your allowed email.

The first successful sign-in securely migrates existing device-local learning data into your user-owned database rows. Future loads use Supabase as the authoritative store.

## Add another allowed user later

1. Invite the new email under **Supabase → Authentication → Users**.
2. Add the lower-case email to the server-only `ALLOWED_EMAILS` environment variable, separated by a comma:

   `ALLOWED_EMAILS=first@example.com,second@example.com`

3. Restart or redeploy the server.

No database migration is needed. Every table already uses `user_id`, and Row Level Security restricts each signed-in person to their own rows.

## Production environment variables

- `OPENAI_API_KEY` — server secret
- `SUPABASE_URL` — safe to expose through `/api/config`
- `SUPABASE_PUBLISHABLE_KEY` — intended for browser use; access is constrained by Auth and RLS
- `ALLOWED_EMAILS` — server-only comma-separated allowlist
- `PORT` — optional; defaults to `3000`

Never configure a Supabase service-role key in this application or expose one to the browser.
