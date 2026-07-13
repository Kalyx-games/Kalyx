-- ============================================================
--  Kalyx — Parties jouées (table `plays`) : historique des scores
--
--  À lancer une fois dans Supabase → SQL Editor → New query → coller → Run.
--  Idempotent, sans danger.
--  players jsonb = [{ name, total, scores: { catégorie: valeur } }]
-- ============================================================

create table if not exists public.plays (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        references public.games(id) on delete cascade,
  played_at  timestamptz not null default now(),
  players    jsonb       not null,          -- [{ name, total, scores }]
  winner     text,                          -- nom du gagnant (vide si égalité)
  extensions jsonb,                         -- [noms] extensions utilisées
  created_at timestamptz not null default now()
);
create index if not exists plays_game_id_idx on public.plays (game_id);

alter table public.plays enable row level security;
drop policy if exists "plays lecture"     on public.plays;
drop policy if exists "plays insertion"   on public.plays;
drop policy if exists "plays suppression" on public.plays;
create policy "plays lecture"     on public.plays for select using (true);
create policy "plays insertion"   on public.plays for insert with check (true);
create policy "plays suppression" on public.plays for delete using (true);
grant all on public.plays to anon, authenticated;
