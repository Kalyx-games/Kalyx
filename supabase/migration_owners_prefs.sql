-- Les PRÉFÉRENCES D'AFFICHAGE d'un compte, en un seul sac.
--
-- ⚠️ Une colonne jsonb et non un booléen par réglage : c'est le motif déjà employé pour
-- `scoresheets.template`. Les prochains réglages de compte n'auront pas besoin d'une nouvelle
-- migration, et une clé absente vaut toujours « le comportement d'avant ».
--
-- Clé actuelle :
--   { "grilleNoms": false }   → masque le nom des jeux en vue grille (défaut : il s'affiche)
--
-- ⚠️ Tant que cette migration n'est pas lancée, l'app fonctionne normalement : le réglage
-- n'est simplement PAS proposé (cf. `prefsDispo` dans App.jsx), et updateOwner retire la
-- colonne et réessaie (cf. OPTIONAL_COLS dans src/lib/owners.js).
--
-- À lancer une fois dans Supabase → SQL Editor → New query → coller → Run. Idempotent.

alter table public.owners add column if not exists prefs jsonb;
