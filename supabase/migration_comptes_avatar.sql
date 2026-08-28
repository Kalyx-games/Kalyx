-- Palier 2 du chantier « comptes » : l'avatar d'un compte.
--
-- Une seule colonne, en texte, sur la table `owners` (les comptes) :
--   NULL / ''      → les initiales sur la couleur du compte (le comportement actuel)
--   'emoji:🐙'      → l'emoji choisi, sur la couleur du compte
--   'jeu:<uuid>'   → la jaquette d'un jeu de la collection
--
-- Aucune donnée existante n'est touchée : sans valeur, un compte garde exactement
-- l'apparence qu'il a aujourd'hui.
--
-- ⚠️ Tant que cette migration n'est pas lancée, l'app fonctionne normalement :
-- `addOwner`/`updateOwner` retirent la colonne et réessaient (cf. src/lib/owners.js).

alter table public.owners add column if not exists avatar text;
