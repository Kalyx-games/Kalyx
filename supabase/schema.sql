-- ============================================================
--  Kalyx — SCHÉMA COMPLET de la base (un seul fichier)
--
--  Ce fichier décrit la base telle qu'elle est AUJOURD'HUI : les 3 tables
--  (games + owners + tags), leurs colonnes, la sécurité et les droits d'accès.
--  Il remplace toutes les anciennes petites migrations.
--
--  ⚠️ Tu n'as RIEN à lancer : ta base est déjà à jour. Ce fichier sert de
--     RÉFÉRENCE (et à tout recréer d'un coup si un jour tu repars de zéro).
--     Il est « idempotent » : sans danger à relancer, il ne casse rien et
--     n'efface aucune donnée.
--
--  Pour l'utiliser (repartir de zéro) : Supabase → SQL Editor → New query →
--  coller tout ce fichier → Run.
-- ============================================================


-- ============================================================
--  1) Table des JEUX
-- ============================================================
create table if not exists public.games (
  id           uuid        primary key default gen_random_uuid(), -- identifiant unique auto
  bgg_id       integer,                                           -- id BoardGameGeek (peut être vide)
  name         text        not null,                              -- nom du jeu
  players      text,                                              -- nb de joueurs groupé, ex. "3-5, 7-8"
  players_min  integer,                                           -- min (dérivé, gardé pour compat/tri)
  players_max  integer,                                           -- max (dérivé)
  players_best text,                                              -- nb idéal, texte "2" / "2-4" / "2, 4"
  duration_min integer,                                           -- durée mini (min = max dans l'app)
  duration_max integer,                                           -- durée maxi (= la valeur affichée)
  complexity   numeric,                                           -- complexité 1 à 5 (peut être vide)
  price        numeric,                                           -- prix (surtout wishlist)
  image_url    text,                                              -- adresse de l'image (les cartes la réduisent via l'optimiseur Vercel)
  owner        text        not null default '',                   -- propriétaires, CSV ex. "Alex, Bob"
  tags         text,                                              -- tags, CSV ex. "Coop, À vendre"
  extensions   text,                                              -- extensions (nom + joueurs, géré par l'app)
  status       text        not null default 'collection'          -- 'collection' ou 'wishlist'
                 check (status in ('collection', 'wishlist')),
  created_at   timestamptz not null default now()                 -- date d'ajout auto
);

-- Filet de sécurité si la table existait déjà sans ces colonnes (ajoutées au fil du temps).
alter table public.games add column if not exists players      text;
alter table public.games add column if not exists players_best text;
alter table public.games add column if not exists price        numeric;
alter table public.games add column if not exists tags         text;
alter table public.games add column if not exists extensions   text;
-- NB : une colonne thumb_url a existé un temps (miniatures BGG) puis a été abandonnée
-- au profit de l'optimiseur d'images Vercel. Si elle existe encore en base, elle est
-- simplement ignorée (inutile de la supprimer).

-- Accès ouvert : ce projet n'a pas de comptes/login. On active la sécurité (RLS)
-- puis on ouvre volontairement la lecture ET l'écriture à tout le monde.
alter table public.games enable row level security;
drop policy if exists "Lecture ouverte"      on public.games;
drop policy if exists "Insertion ouverte"    on public.games;
drop policy if exists "Modification ouverte" on public.games;
drop policy if exists "Suppression ouverte"  on public.games;
create policy "Lecture ouverte"      on public.games for select using (true);
create policy "Insertion ouverte"    on public.games for insert with check (true);
create policy "Modification ouverte" on public.games for update using (true) with check (true);
create policy "Suppression ouverte"  on public.games for delete using (true);
grant all on public.games to anon, authenticated;


-- ============================================================
--  2) Table des PROPRIÉTAIRES (bulle : nom réel + 2 initiales + couleur)
-- ============================================================
create table if not exists public.owners (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,   -- nom réel (ex. "Mathieu")
  initials   text,                          -- 2 lettres affichées dans la bulle
  color      text,                          -- couleur de la bulle
  created_at timestamptz not null default now()
);
alter table public.owners add column if not exists initials text;
alter table public.owners add column if not exists color    text;

alter table public.owners enable row level security;
drop policy if exists "Lecture ouverte owners"      on public.owners;
drop policy if exists "Insertion ouverte owners"    on public.owners;
drop policy if exists "Modification ouverte owners" on public.owners;
drop policy if exists "Suppression ouverte owners"  on public.owners;
create policy "Lecture ouverte owners"      on public.owners for select using (true);
create policy "Insertion ouverte owners"    on public.owners for insert with check (true);
create policy "Modification ouverte owners" on public.owners for update using (true) with check (true);
create policy "Suppression ouverte owners"  on public.owners for delete using (true);
grant all on public.owners to anon, authenticated;


-- ============================================================
--  3) Table des TAGS (même format que les propriétaires)
-- ============================================================
create table if not exists public.tags (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  initials   text,
  color      text,
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;
drop policy if exists "Lecture ouverte tags"      on public.tags;
drop policy if exists "Insertion ouverte tags"    on public.tags;
drop policy if exists "Modification ouverte tags" on public.tags;
drop policy if exists "Suppression ouverte tags"  on public.tags;
create policy "Lecture ouverte tags"      on public.tags for select using (true);
create policy "Insertion ouverte tags"    on public.tags for insert with check (true);
create policy "Modification ouverte tags" on public.tags for update using (true) with check (true);
create policy "Suppression ouverte tags"  on public.tags for delete using (true);
grant all on public.tags to anon, authenticated;


-- ============================================================
--  4) Table des SAUVEGARDES automatiques (rotation des N plus récentes)
-- ============================================================
create table if not exists public.backups (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  data         jsonb       not null,                 -- snapshot complet { games, owners, tags }
  games_count  integer,
  owners_count integer,
  tags_count   integer,
  kind         text        default 'auto'            -- 'auto' ou 'manual'
);

alter table public.backups enable row level security;
drop policy if exists "backups lecture"     on public.backups;
drop policy if exists "backups insertion"   on public.backups;
drop policy if exists "backups suppression" on public.backups;
create policy "backups lecture"     on public.backups for select using (true);
create policy "backups insertion"   on public.backups for insert with check (true);
create policy "backups suppression" on public.backups for delete using (true);
grant all on public.backups to anon, authenticated;


-- ============================================================
--  5) Fiches de score par jeu (une fiche par jeu)
--     template jsonb = { categories: [{label, hint, ext}], extensions: [noms] }
-- ============================================================
create table if not exists public.scoresheets (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        unique references public.games(id) on delete cascade,
  template   jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.scoresheets enable row level security;
drop policy if exists "scoresheets lecture"      on public.scoresheets;
drop policy if exists "scoresheets insertion"    on public.scoresheets;
drop policy if exists "scoresheets modification" on public.scoresheets;
drop policy if exists "scoresheets suppression"  on public.scoresheets;
create policy "scoresheets lecture"      on public.scoresheets for select using (true);
create policy "scoresheets insertion"    on public.scoresheets for insert with check (true);
create policy "scoresheets modification" on public.scoresheets for update using (true) with check (true);
create policy "scoresheets suppression"  on public.scoresheets for delete using (true);
grant all on public.scoresheets to anon, authenticated;


-- ============================================================
--  6) Parties jouées (historique des scores)
--     players jsonb = [{ name, total, scores: { catégorie: valeur } }]
-- ============================================================
create table if not exists public.plays (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        references public.games(id) on delete cascade,
  played_at  timestamptz not null default now(),
  players    jsonb       not null,
  winner     text,
  extensions jsonb,
  outcome    text,        -- coopératif : 'win' | 'loss' (null en compétitif)
  scenario   text,        -- coopératif : scénario / niveau (facultatif)
  score      numeric,     -- coopératif : score du groupe (facultatif)
  notes      text,        -- notes propres à la partie (facultatif)
  created_at timestamptz not null default now()
);
-- Colonnes ajoutées après coup (au cas où la table existe déjà sans elles).
alter table public.plays add column if not exists outcome  text;
alter table public.plays add column if not exists scenario text;
alter table public.plays add column if not exists score    numeric;
alter table public.plays add column if not exists notes    text;
create index if not exists plays_game_id_idx on public.plays (game_id);

alter table public.plays enable row level security;
drop policy if exists "plays lecture"      on public.plays;
drop policy if exists "plays insertion"    on public.plays;
drop policy if exists "plays modification" on public.plays;
drop policy if exists "plays suppression"  on public.plays;
create policy "plays lecture"      on public.plays for select using (true);
create policy "plays insertion"    on public.plays for insert with check (true);
create policy "plays modification" on public.plays for update using (true) with check (true);
create policy "plays suppression"  on public.plays for delete using (true);
grant all on public.plays to anon, authenticated;
