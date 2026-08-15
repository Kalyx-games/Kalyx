-- ============================================================
--  CONFIG INTERNE — permet de CHANGER le code d'accès depuis l'appli
--  (à lancer une fois dans Supabase → SQL Editor)
-- ============================================================
--  Petite table clé/valeur. On y stocke le HASH (SHA-256) du code d'accès sous la clé
--  'write_code_hash'. Le proxy /api/sb le lit (avec la clé secrète) pour valider le code ;
--  s'il n'y a rien, il se rabat sur la variable Vercel APP_WRITE_SECRET.
--
--  Sécurité : AUCUN accès pour la clé publique (anon) — ni lecture ni écriture. Seul le
--  proxy, avec la clé SECRÈTE (qui contourne la RLS), peut y toucher.
-- ============================================================

create table if not exists public.app_config (
  key   text primary key,
  value text
);

alter table public.app_config enable row level security;
-- Aucune policy pour anon/authenticated → la clé publique ne peut rien y faire.
revoke all on public.app_config from anon, authenticated;
