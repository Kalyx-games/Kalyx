-- ============================================================
--  Kalyx — Sauvegardes automatiques (table `backups`)
--
--  À lancer une fois dans Supabase → SQL Editor → New query → coller → Run.
--  Sans danger, idempotent. Active la sauvegarde/restauration automatique.
-- ============================================================

create table if not exists public.backups (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  data         jsonb       not null,                 -- snapshot complet { games, owners, tags }
  games_count  integer,
  owners_count integer,
  tags_count   integer,
  kind         text        default 'auto'            -- 'auto' (planifiée) ou 'manual' (bouton)
);

-- Accès ouvert (cohérent avec le reste de l'app sans comptes).
alter table public.backups enable row level security;
drop policy if exists "backups lecture"     on public.backups;
drop policy if exists "backups insertion"   on public.backups;
drop policy if exists "backups suppression" on public.backups;
create policy "backups lecture"     on public.backups for select using (true);
create policy "backups insertion"   on public.backups for insert with check (true);
create policy "backups suppression" on public.backups for delete using (true);
grant all on public.backups to anon, authenticated;
