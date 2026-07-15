-- Victoire directe : mémorise par quel « déclencheur » une partie s'est terminée
-- (ex. « 10 cartes objectif », « pile de la réserve épuisée »…).
-- À lancer une fois dans Supabase (SQL Editor). Sans elle, l'app fonctionne quand
-- même (le déclencheur n'est simplement pas enregistré — dégradation propre).
alter table public.plays add column if not exists trigger text;
