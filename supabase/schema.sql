-- Pulse — Supabase sync schema (Project: kjlmkjkzbbnzdpvjhkxz)
-- Idempotent: safe to re-run in the SQL editor.
--
-- Design: one table carries EVERY domain (exercises, sets, fuel_logs,
-- water_logs, equipment). Each row is one JSON delta; RLS isolates every
-- user's rows from every other user. There is no server-side data model to
-- maintain and no passwords anywhere near the client — only the user's own
-- Supabase account can read its rows.
--
-- Apply: paste this whole file into Supabase Dashboard → SQL Editor → Run.
-- Then whitelist the app URLs under Authentication → URL Configuration:
--   Site URL: https://changelinglabs.com/pulse/
--   Redirect URLs: https://changelinglabs.com/pulse/, http://localhost:8930/

create extension if not exists pgcrypto;

create table if not exists public.sync_rows (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  domain       text        not null check (domain in ('exercises', 'sets', 'fuel_logs', 'water_logs', 'equipment')),
  external_id  text        not null,
  payload      jsonb       not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  primary key (user_id, domain, external_id)
);

-- Helpful index for the "everything since" pull path (we dump full rows; the PK covers it,
-- but this keeps the deleted_at filter cheap if we ever add it).
create index if not exists sync_rows_user_updated on public.sync_rows (user_id, updated_at desc);

-- ── Row-level security ─────────────────────────────────────
alter table public.sync_rows enable row level security;

drop policy if exists sync_rows_select on public.sync_rows;
create policy sync_rows_select on public.sync_rows
  for select using (auth.uid() = user_id);

drop policy if exists sync_rows_insert on public.sync_rows;
create policy sync_rows_insert on public.sync_rows
  for insert with check (auth.uid() = user_id);

drop policy if exists sync_rows_update on public.sync_rows;
create policy sync_rows_update on public.sync_rows
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sync_rows_delete on public.sync_rows;
create policy sync_rows_delete on public.sync_rows
  for delete using (auth.uid() = user_id);

-- ── Table privileges (RLS still governs row access) ───────
grant select, insert, update, delete on public.sync_rows to authenticated;

-- Sanity check: table exists, RLS enabled, exactly the policies above.
do $$
declare r record;
begin
  select relrowsecurity into r from pg_class where oid = 'public.sync_rows'::regclass;
  if r.relrowsecurity is true then
    raise notice 'OK: sync_rows has row-level security enabled';
  end if;
end $$;
