-- Notes propres à CHAQUE partie (avant, la note était rangée sur la fiche du jeu)
-- + autorisation de MODIFIER une partie (édition) : la policy UPDATE manquait.
-- À lancer une fois dans Supabase (SQL Editor). Sans elle, l'app marche quand même,
-- mais les notes ne sont pas enregistrées et l'édition d'une partie échoue.
alter table public.plays add column if not exists notes text;

drop policy if exists "plays modification" on public.plays;
create policy "plays modification" on public.plays for update using (true) with check (true);
