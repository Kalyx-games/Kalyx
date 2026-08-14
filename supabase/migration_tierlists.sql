-- Tierlists : un classement des jeux par joueur (S/A/B/C/D/F + « pas d'avis »).
-- Le classement stocke des IDENTIFIANTS de jeux (pas des URLs d'image) → si on change
-- l'image d'un jeu, elle suit automatiquement dans les tierlists.
-- À lancer une seule fois dans Supabase (SQL Editor). RLS ouverte (app sans comptes).

create table if not exists public.tierlists (
  id uuid primary key default gen_random_uuid(),
  player text not null unique,
  ranking jsonb not null default '{}'::jsonb, -- { "S": [game_id...], "A": [...], ..., "?": [...] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tierlists enable row level security;

drop policy if exists "tierlists lecture" on public.tierlists;
drop policy if exists "tierlists insertion" on public.tierlists;
drop policy if exists "tierlists modification" on public.tierlists;
drop policy if exists "tierlists suppression" on public.tierlists;

create policy "tierlists lecture" on public.tierlists for select using (true);
create policy "tierlists insertion" on public.tierlists for insert with check (true);
create policy "tierlists modification" on public.tierlists for update using (true) with check (true);
create policy "tierlists suppression" on public.tierlists for delete using (true);

grant all on public.tierlists to anon, authenticated;
