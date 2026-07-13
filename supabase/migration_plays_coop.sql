-- Jeux coopératifs : la table `plays` gagne 3 colonnes pour enregistrer
-- le résultat du groupe (gagné/perdu), le scénario/niveau et le score collectif.
-- Sans cette migration, l'app continue de marcher (les parties compétitives
-- s'enregistrent normalement ; seules les infos coop ne sont pas stockées).

alter table public.plays add column if not exists outcome  text;    -- 'win' | 'loss'
alter table public.plays add column if not exists scenario text;    -- scénario / niveau
alter table public.plays add column if not exists score    numeric; -- score du groupe
