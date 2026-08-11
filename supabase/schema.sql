create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  mode text not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  scenario text not null default '',
  duration_seconds integer not null default 0,
  feedback jsonb,
  recurring_weaknesses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transcript_turns (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  speaker text not null check (speaker in ('learner','coach')),
  content text not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.playbook_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expression text not null,
  pattern text,
  category text,
  context text,
  example text,
  why_useful text,
  date_learned date,
  source_session_id text,
  status text not null default 'NEW',
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(user_id, expression)
);

create table if not exists public.playbook_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  expression_id text not null references public.playbook_entries(id) on delete cascade,
  practice_count integer not null default 0,
  successful_uses integer not null default 0,
  contexts_used jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  last_practised_at timestamptz,
  needs_practice boolean not null default true,
  primary key(user_id, expression_id)
);

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id text,
  category text not null,
  original_version text not null default '',
  upgraded_version text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_key text not null,
  summary text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'stable',
  updated_at timestamptz not null default now(),
  unique(user_id, pattern_key)
);

create table if not exists public.daily_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_date date not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(user_id, practice_date)
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  model text,
  input_units integer,
  output_units integer,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_date on public.sessions(user_id, occurred_at desc);
create index if not exists idx_transcript_user_session on public.transcript_turns(user_id, session_id, occurred_at);
create index if not exists idx_playbook_user_status on public.playbook_entries(user_id, status) where archived = false;
create index if not exists idx_notes_user_date on public.notes(user_id, created_at desc);
create index if not exists idx_patterns_user_status on public.user_patterns(user_id, status);
create index if not exists idx_usage_user_date on public.usage_events(user_id, created_at desc);

alter table public.sessions enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.playbook_entries enable row level security;
alter table public.playbook_progress enable row level security;
alter table public.notes enable row level security;
alter table public.user_patterns enable row level security;
alter table public.daily_progress enable row level security;
alter table public.usage_events enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['sessions','transcript_turns','playbook_entries','playbook_progress','notes','user_patterns','daily_progress','usage_events']
  loop
    execute format('drop policy if exists "owners_select" on public.%I', table_name);
    execute format('drop policy if exists "owners_insert" on public.%I', table_name);
    execute format('drop policy if exists "owners_update" on public.%I', table_name);
    execute format('drop policy if exists "owners_delete" on public.%I', table_name);
    execute format('create policy "owners_select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "owners_insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "owners_update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "owners_delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.sessions, public.transcript_turns, public.playbook_entries, public.playbook_progress, public.notes, public.user_patterns, public.daily_progress, public.usage_events to authenticated;
grant usage, select on sequence public.usage_events_id_seq to authenticated;

-- Usage is append-only for clients, preserving a trustworthy basis for future limits.
drop policy if exists "owners_update" on public.usage_events;
drop policy if exists "owners_delete" on public.usage_events;
revoke update, delete on public.usage_events from authenticated;
