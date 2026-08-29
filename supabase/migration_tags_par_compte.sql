-- ═══════════════════════════════════════════════════════════════════════════
--  TAGS PAR COMPTE — chaque compte a sa propre bibliothèque de tags.
--  1) la colonne · 2) l'unicité passe à (name, compte) · 3) une ligne par paire
--  employée · 4) les lignes communes devenues sans emploi · 5) games.tags : plus
--  aucun item commun.
--  Les étapes 3 et 5 sont INDISSOCIABLES : un item commun resté dans games.tags
--  après le split n'aurait plus de ligne chez personne → plus de mode de
--  filtrage → il redevient masquant, et jusqu'à 31 jeux quitteraient la
--  collection sans un mot.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) La colonne. NOT NULL DEFAULT '' et non NULL : sur PostgreSQL deux NULL
--       sont DISTINCTS, un index unique nullable ne contraindrait donc rien.
--       '' garde exactement le sens de l'item sans « :: » : « vaut pour tous ».
alter table public.tags add column if not exists compte text not null default '';

-- ── 2) L'unicité, AVANT toute insertion (sinon le premier doublon est refusé).
--       On CHERCHE la contrainte qui ne porte que `name` — on ne suppose pas son
--       nom, il dépend de l'historique de la base.
do $$
declare c text;
begin
  select con.conname into c
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attname = 'name'
   where con.conrelid = 'public.tags'::regclass
     and con.contype = 'u'
     and con.conkey = array[a.attnum];
  if c is not null then
    execute format('alter table public.tags drop constraint %I', c);
  end if;
end $$;
create unique index if not exists tags_name_compte_key on public.tags (name, compte);

-- ── 3) Une ligne par (tag, compte) réellement employé.
--       Un item COMMUN vaut pour CHAQUE propriétaire du jeu : c'est déjà la règle
--       qu'applique ecritTagsDuCompte (tagsJeux.js:112-115), et c'est le statu quo
--       assumé — la base ne peut pas deviner qui a posé un tag commun, l'attribuer
--       aux deux préserve ce que chacun VOIT aujourd'hui.
--       Un tag JAMAIS employé sur aucun jeu est donné à TOUS les comptes : sinon
--       l'étape 4 le supprimerait en silence.
with items as (
  select coalesce(g.owner,'') as owner_text, btrim(i) as item
    from public.games g,
         lateral unnest(string_to_array(coalesce(g.tags,''), ',')) as i
   where btrim(i) <> ''
), parsed as (
  select owner_text,
         case when position('::' in item) > 0
              then btrim(split_part(item,'::',1)) else item end as tag,
         case when position('::' in item) > 0
              then btrim(substr(item, position('::' in item)+2)) end as compte
    from items
), paires as (
  select distinct tag, compte from parsed where compte is not null and compte <> ''
  union
  select distinct p.tag, btrim(o)
    from parsed p, lateral unnest(string_to_array(p.owner_text, ',')) as o
   where p.compte is null and btrim(o) <> ''
), cible as (
  select t.id as src, t.name, pr.compte
    from public.tags t join paires pr on pr.tag = t.name
   where t.compte = ''
  union
  select t.id, t.name, o.name
    from public.tags t cross join public.owners o
   where t.compte = ''
     and not exists (select 1 from paires pr where pr.tag = t.name)
)
insert into public.tags (name, compte, initials, color, visible_pour)
select c.name, c.compte, t.initials, t.color,
       case when exists (
              select 1 from unnest(string_to_array(coalesce(t.visible_pour,''), ',')) v
               where btrim(v) = c.compte)
            then c.compte end
  from cible c join public.tags t on t.id = c.src
on conflict (name, compte) do nothing;

-- ── 4) La ligne commune n'est supprimée QUE si une ligne par compte du même nom
--       existe désormais. Sans cette condition, un tag qu'aucune paire n'a produit
--       (base owners vide) disparaîtrait.
delete from public.tags a
 where a.compte = ''
   and exists (select 1 from public.tags b where b.name = a.name and b.compte <> '');

-- ── 5) games.tags : chaque item est rattaché à un compte.
--       ⚠️ L'ORDRE des items ne porte AUCUN sens (ownersToText, games.js:232, ne trie
--       même pas). Ce qui compte est l'INVARIANT : items trimés, non vides, sans
--       doublon, joints par « , » — c'est lui qui rend la colonne relisible à l'octet
--       près par un ancien bundle (tagsJeux.js:16-23). Le tri par collation de la base
--       le respecte.
with items as (
  select g.id, coalesce(g.owner,'') as owner_text, btrim(i) as item
    from public.games g,
         lateral unnest(string_to_array(coalesce(g.tags,''), ',')) as i
   where btrim(i) <> ''
), expl as (
  select id, item as final from items where position('::' in item) > 0
  union
  select i.id, i.item || '::' || btrim(o)
    from items i, lateral unnest(string_to_array(i.owner_text, ',')) as o
   where position('::' in i.item) = 0 and btrim(o) <> ''
  union   -- jeu SANS propriétaire : personne à qui rattacher, l'item reste commun
  select id, item from items
   where position('::' in item) = 0 and btrim(owner_text) = ''
), agg as (
  select id, string_agg(distinct final, ', ' order by final) as txt
    from expl group by id
)
update public.games g set tags = agg.txt
  from agg
 where agg.id = g.id and coalesce(g.tags,'') <> agg.txt;
