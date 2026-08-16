-- Kalyx — ajoute la colonne du sondage BGG « nombre de joueurs » (idéal / recommandé /
-- déconseillé + nombre de votes) à la table games.
--
-- À lancer UNE fois dans Supabase → SQL Editor. Sans risque : "if not exists" ne touche
-- à rien si la colonne existe déjà, et n'efface aucune donnée.
--
-- Format stocké (jsonb) : { "total": 123, "rows": [ { "n": "2", "best": 40, "rec": 12, "notRec": 3 }, ... ] }

alter table public.games add column if not exists bgg_poll jsonb;
