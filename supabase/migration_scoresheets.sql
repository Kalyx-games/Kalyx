-- ============================================================
--  Kalyx — Fiches de score par jeu (table `scoresheets`)
--
--  À lancer une fois dans Supabase → SQL Editor → New query → coller → Run.
--  Idempotent, sans danger. Chaque jeu peut avoir UNE fiche de score.
--  template (jsonb) = { categories: [{label, hint, ext}], extensions: [noms] }
-- ============================================================

create table if not exists public.scoresheets (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        unique references public.games(id) on delete cascade,
  template   jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.scoresheets enable row level security;
drop policy if exists "scoresheets lecture"     on public.scoresheets;
drop policy if exists "scoresheets insertion"   on public.scoresheets;
drop policy if exists "scoresheets modification" on public.scoresheets;
drop policy if exists "scoresheets suppression" on public.scoresheets;
create policy "scoresheets lecture"     on public.scoresheets for select using (true);
create policy "scoresheets insertion"   on public.scoresheets for insert with check (true);
create policy "scoresheets modification" on public.scoresheets for update using (true) with check (true);
create policy "scoresheets suppression" on public.scoresheets for delete using (true);
grant all on public.scoresheets to anon, authenticated;
