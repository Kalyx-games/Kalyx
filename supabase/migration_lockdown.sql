-- ============================================================
--  VERROUILLAGE DE LA BASE  (à lancer UNE fois dans Supabase → SQL Editor)
-- ============================================================
--  Objectif : la clé PUBLIQUE de l'appli (dans le navigateur) devient LECTURE SEULE.
--  Plus personne ne peut écrire ou supprimer avec cette clé — même un robot qui la trouve.
--  Les écritures ne passent plus que par le proxy serveur /api/sb, qui utilise la clé
--  SECRÈTE (contourne la RLS) et exige le code d'accès de l'appareil.
--
--  ⚠️ À lancer SEULEMENT une fois que les variables Vercel sont en place
--     (SUPABASE_SECRET_KEY + APP_WRITE_SECRET) et que l'appli écrit bien via le proxy.
--
--  Réversible : relancer supabase/schema.sql rouvre les écritures (revient en arrière).
-- ============================================================

do $$
declare
  t text;
  p record;
  tables text[] := array['games', 'owners', 'tags', 'plays', 'scoresheets', 'backups', 'tierlists'];
begin
  foreach t in array tables loop
    -- ne rien faire si la table n'existe pas (selon l'avancement du projet)
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- 1) supprime TOUTES les policies existantes de la table (dont les écritures ouvertes)
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    -- 2) une seule policy : lecture ouverte (la clé publique peut LIRE)
    execute format('create policy "Lecture seule" on public.%I for select using (true)', t);

    -- 3) droits SQL : lecture seule pour la clé publique (retire écriture/suppression)
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);

    -- 4) RLS bien active (la clé SECRÈTE du proxy la contourne → les écritures via /api/sb marchent)
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
