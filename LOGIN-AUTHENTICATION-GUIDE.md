# Login authentication configuration guide

This guide explains how the Aussie Workplace English Coach uses Vercel, Supabase, and Brevo to provide public email-and-password accounts.

## 1. Architecture

| Platform | Responsibility |
| --- | --- |
| Vercel | Hosts the website and serverless API, connects the custom domain, and stores server environment variables. |
| Supabase Auth | Creates users, verifies email addresses, validates passwords, maintains sessions, and issues access tokens. |
| Supabase PostgreSQL and RLS | Store learning data and restrict every row to its owner. |
| Brevo | Delivers transactional authentication emails through SMTP. It does not store passwords or decide whether login succeeds. |
| OpenAI | Provides voice and coaching through server-side requests. Its API key is never sent to the browser. |

```text
Browser -> Supabase Auth -> Brevo SMTP -> verification email
Browser -> Supabase Auth -> access token -> protected database rows
Browser -> Vercel API -> OpenAI
```

After initial email verification, normal sign-in uses the email address and password without sending another email. The same credentials work on another device.

## 2. Prerequisites

- A deployed Vercel project.
- A Supabase project with `supabase/schema.sql` applied.
- A custom domain connected to Vercel.
- A Brevo account with transactional email enabled.
- Permission to manage the domain's DNS records.

## 3. Connect the domain to Vercel

1. Open **Vercel project -> Settings -> Domains**.
2. Add the root domain, for example `example.com`.
3. Optionally add `www.example.com` and redirect it to the primary domain.
4. Wait until Vercel reports a valid configuration and HTTPS is active.

If the domain was purchased through Vercel, website DNS is normally configured automatically. Brevo's email DNS records are added separately in Vercel's domain DNS settings.

## 4. Configure Vercel environment variables

Open **Vercel project -> Settings -> Environment Variables**:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI authorization. |
| `SUPABASE_URL` | Identifies the Supabase project. |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe key constrained by Auth and RLS. |
| `REGISTRATION_MODE` | Set to `public` for self-service account creation. |
| `ALLOWED_EMAILS` | Optional server-only allowlist used in private mode. |
| `UNLIMITED_EMAILS` | Optional server-only list of emails that bypass per-user daily AI limits. |

Apply variables to Production and, when needed, Preview and Development. Redeploy after changing them.

Never place `OPENAI_API_KEY`, a Supabase service-role key, or a Brevo SMTP key in frontend code.

## 5. Configure Supabase Auth

Open **Supabase -> Authentication -> Providers -> Email**:

- Enable the Email provider.
- Enable new-user signups.
- Keep email confirmation enabled.

Email confirmation prevents usable accounts from being created with email addresses the registrant does not own.

### URL configuration

Open **Authentication -> URL Configuration**. Set **Site URL** to the canonical production origin:

```text
https://example.com
```

Add every legitimate application origin under Redirect URLs:

```text
https://example.com/**
https://www.example.com/**
https://your-project.vercel.app/**
http://localhost:3000/**
```

Do not add unrelated domains or unnecessarily broad wildcards.

## 6. Authenticate the sending domain in Brevo

1. Open **Brevo -> Settings -> Senders, Domains & Dedicated IPs -> Domains**.
2. Add the application's domain.
3. Choose a branded subdomain such as `auth` if Brevo requests one.
4. Copy every DNS record supplied by Brevo into **Vercel -> Domains -> domain -> DNS Records**.
5. Preserve each type, name, value, TTL, and priority exactly.
6. Wait for Brevo to show **Authenticated** and, where configured, **Branded**.

If Brevo already associates `auth` with the authenticated root domain, do not add `auth.example.com` as a second domain. That duplicate may remain unauthenticated.

Create a sender belonging to the authenticated domain, for example:

```text
Aussie English Coach <login@example.com>
```

## 7. Create Brevo SMTP credentials

Open **Brevo -> SMTP & API -> SMTP** and generate an SMTP key. Brevo provides:

```text
SMTP server: smtp-relay.brevo.com
Port: 587
Login: the exact SMTP login displayed by Brevo
Password: the complete SMTP key value
```

The SMTP login may differ from the normal Brevo username. The password is the generated SMTP key value—not the Brevo password, API v3 key, or SMTP key name.

Store this key only in Supabase's protected SMTP configuration. Never put it in GitHub, frontend JavaScript, screenshots, or public Vercel variables.

## 8. Connect Brevo to Supabase

Open **Supabase -> Project Settings -> Authentication -> SMTP Settings** and enable custom SMTP:

```text
Sender name: Aussie English Coach
Sender email: login@example.com
Host: smtp-relay.brevo.com
Port: 587
Username: exact Brevo SMTP login
Password: complete Brevo SMTP key value
```

Supabase now creates and verifies accounts, while Brevo transports confirmation and recovery messages.

## 9. Signup and login lifecycle

### New account

1. The visitor selects **Create account**.
2. The browser sends the email and password directly to Supabase Auth over HTTPS.
3. Supabase securely hashes the password; the app never stores the raw password.
4. Supabase asks Brevo SMTP to deliver a confirmation email.
5. The visitor opens the link and Supabase confirms the address.
6. The visitor signs in with the email and password.

### Returning user or another device

1. The user enters the same email and password.
2. Supabase validates them and issues a session token.
3. The app uses the token for database and API requests.
4. RLS evaluates `auth.uid()` and returns only that user's rows.

No new email is required for an ordinary login on another device.

### Password recovery

Supabase creates a time-limited recovery link, Brevo delivers it, and the user opens it to choose a new password.

## 10. Data isolation

Every user-owned table includes `user_id`. RLS policies compare it with the signed-in identity:

```sql
auth.uid() = user_id
```

This protects sessions, transcript turns, Playbook entries and progress, notes, patterns, daily progress, and usage events.

The browser cache is also keyed by Supabase user ID. Starter Playbook IDs are user-specific. This prevents people sharing a device from sharing cached data or colliding with another user's rows.

Never solve an RLS error by disabling RLS or exposing a service-role key. An RLS rejection usually reveals an ownership defect that should be fixed in the application or schema.

## 11. End-to-end test

1. Open production in a private/incognito window.
2. Create an account using a new email and a password of at least eight characters.
3. Confirm that Brevo records the transactional email.
4. Open the newest confirmation message.
5. Confirm that its link returns to production.
6. Sign in with the same credentials.
7. Create a practice session or note and sign out.
8. Sign in from a second browser or device and verify the data appears.
9. Create a second test account and confirm it cannot see the first account's data.
10. Test password recovery.

## 12. Troubleshooting

### `Error sending confirmation email`

Supabase accepted the signup request but SMTP delivery failed. Check:

- **Supabase -> Logs -> Auth Logs** for the expanded SMTP error.
- Brevo transactional email is active.
- The domain is authenticated and the sender matches it.
- Host is `smtp-relay.brevo.com` and port is `587`.
- Username is Brevo's exact SMTP login.
- Password is the SMTP key value.

A failed attempt may leave an unconfirmed user under **Authentication -> Users**. Delete that test user before repeating the same signup, or use another test address.

### Link returns to sign-in

Check Supabase Site URL and Redirect URLs. Use the newest message because old links may expire or be superseded.

### `Email not confirmed`

Open the newest confirmation message or resend it after respecting rate limits.

### RLS violation after login

Authentication succeeded, but an attempted row does not belong to the authenticated user. Inspect its `user_id` and reused record IDs. Do not disable RLS.

### Email arrives in spam

Confirm DKIM, SPF, and DMARC; keep authentication emails concise; avoid marketing content; and use a consistent sender.

## 13. Production safety

- Keep email confirmation enabled.
- Add CAPTCHA before heavily promoting public signup.
- Monitor Supabase Auth logs and Brevo delivery, bounce, and complaint reports.
- Rotate any exposed SMTP or API key immediately and remove the old credential.
- Keep authentication email separate from newsletters and marketing.
- Review provider quotas before a launch campaign.
- Monitor per-user OpenAI usage and costs.

The app currently enforces daily per-user limits of eight voice sessions, twelve coaching analyses, and thirty quick rewrites.

## 14. What changes where

```text
Local code -> Git commit -> GitHub main -> automatic Vercel deployment
```

- Code changes: local repository and GitHub.
- Runtime environment variables: Vercel, followed by redeployment.
- Auth providers, URLs, SMTP, templates, and users: Supabase.
- Sender identity, SMTP credentials, and delivery reports: Brevo.
- DNS records: Vercel, because it manages the domain.
