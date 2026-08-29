import { erreurUtilisateur } from './messages'
import { supabase, writeDb } from './supabase'
import { parseOwners } from './games'

// Liste gérée des tags (table "tags"), éditée depuis le MENU COMPTE.
// Même structure et même logique que les propriétaires (owners).
//
// ── LE MODE DE FILTRAGE, PROPRE À CHAQUE COMPTE ──────────────────────────────────────
// Demande user : « lorsqu'un compte crée un tag il puisse choisir si le jeu qui a ce tag
// doit toujours apparaître dans la collection, ou s'il ne doit jamais apparaître tant que
// la case du filtre n'est pas cochée. Ça permet aux gens d'avoir des usages différents. »
//
// Le mode vit dans `tags.visible_pour` : le CSV des comptes pour qui ce tag NE MASQUE PAS.
//   NULL / ''         → masquant pour tout le monde (le comportement d'avant, donc le repli sûr)
//   'Claire & Nazim'  → toujours visible chez elle, masquant chez les autres
//
// ⚠️ POURQUOI UNE COLONNE À CÔTÉ, et non une ligne de tag par compte : `tags.name` est
// unique, et cette unicité est la clé de TROIS couches de stockage (le cache hors ligne à
// keyPath 'name', l'upsert des sauvegardes on_conflict 'name', et `deleteExtra`). La casser
// dupliquerait aussi le dictionnaire — chaque compte aurait sa propre couleur pour « À
// Vendre », et la fiche d'un jeu ne pourrait plus les mettre en regard. Ici, le vocabulaire
// reste commun et seul le COMPORTEMENT se règle par compte.

// ⚠️ Colonnes qui peuvent manquer si une migration n'a pas été lancée. Même motif que les
// comptes : si l'écriture échoue à cause d'une de ces colonnes, on la retire et on réessaie
// → le reste s'enregistre, et l'app fonctionne normalement AVANT la migration.
const OPTIONAL_COLS = ['visible_pour', 'compte']
const colManquante = (error, payload) => {
  if (!error) return null
  // ⚠️ Regex par CONCATÉNATION : dans un template literal, `\b` est le caractère BACKSPACE.
  // Le piège a déjà coûté une dégradation morte dans ce projet.
  return OPTIONAL_COLS.find(
    (c) => payload[c] !== undefined && new RegExp('\\b' + c + '\\b', 'i').test(error.message || '')
  )
}

// Ce tag masque-t-il, pour CE compte ?
// ⚠️ Sans compte actif (« tout voir »), on ne sait pas qui regarde → on retombe sur le
// comportement historique : masquant. C'est le repli sûr, et il est cohérent avec le reste.
export const tagVisiblePour = (ligne, compte) =>
  Boolean(compte) && parseOwners(ligne?.visible_pour).includes(compte)

// Cette ligne appartient-elle à MA bibliothèque ?
// ⚠️ `compte === undefined` = la base ne connaît pas encore la colonne (migration non
// lancée) → tout m'appartient, c'est-à-dire exactement le comportement d'avant.
// `''` = tag commun (ancien format) → il appartient à tout le monde. Repli sûr dans les
// deux cas : on ne fait JAMAIS disparaître une bibliothèque parce qu'une colonne manque.
export const estMonTag = (t, compte) =>
  t?.compte === undefined || t?.compte === '' || t?.compte === compte

// Recompose la colonne en n'écrivant QUE la part de ce compte. Forme canonique (trimée,
// dédoublonnée, triée, jointe par « , ») — la même que `ownersToText`.
export const ecritVisiblePour = (raw, compte, visible) => {
  const l = parseOwners(raw).filter((c) => c !== compte)
  if (visible && compte) l.push(compte)
  return [...new Set(l)].sort((a, b) => a.localeCompare(b, 'fr')).join(', ')
}

// Le patch à appliquer, en RELISANT la ligne juste avant.
// ⚠️ `visible_pour` porte le choix des AUTRES comptes : sans cette relecture, enregistrer
// depuis un éditeur ouvert depuis cinq minutes effacerait le réglage qu'un autre foyer vient
// de poser. Même motif, et pour la même raison, que `tagsAEcrire` dans tagsJeux.js.
// ⚠️⚠️ `rawFallback` = la valeur DÉJÀ CHARGÉE. Elle n'est pas un confort : postgrest-js
// **ne lève pas** sur un échec de requête, il résout `{ data: null, error }` — le `catch` ne
// voit donc rien passer. Sans ce repli, une lecture qui échoue (réseau capricieux, colonne
// absente) fait recomposer la colonne À PARTIR DE RIEN et **efface le réglage des autres
// foyers**. Exactement le motif de `tagsAEcrire` (tagsJeux.js), qui a ce repli depuis le début.
export async function patchVisiblePour(id, compte, visible, rawFallback) {
  let raw = rawFallback ?? null
  try {
    const { data, error } = await supabase.from('tags').select('visible_pour').eq('id', id).single()
    if (!error && data) raw = data.visible_pour ?? null
  } catch {
    /* client indisponible : on garde le repli */
  }
  return { visible_pour: ecritVisiblePour(raw, compte, visible) }
}

// ⚠️ INDISPENSABLE, même famille que `renameCompteDansTags` : renommer un compte sans suivre
// ici laisserait son nom orphelin dans `visible_pour` — tous les tags qu'il avait réglés sur
// « visibles » redeviendraient masquants du jour au lendemain, sans un mot.
export async function renameCompteDansTagsVisibles(oldName, newName) {
  const from = String(oldName || '').trim()
  const to = String(newName || '').trim()
  if (!from || !to || from === to) return 0
  const { data, error } = await supabase.from('tags').select('id, visible_pour')
  if (error) {
    // ⚠️ Colonne ou table absente : il n'y a rien à suivre, on se tait. Mais toute AUTRE panne
    // doit remonter : le compte vient d'être renommé PARTOUT ailleurs, et abandonner ici en
    // silence laisserait tous ses tags « visibles » redevenir masquants sans un mot.
    if (/does not exist|schema cache|relation|could not find/i.test(error.message || '')) return 0
    throw error
  }
  let changed = 0
  for (const t of data ?? []) {
    const l = parseOwners(t.visible_pour)
    if (!l.includes(from)) continue
    const next = [...new Set(l.map((c) => (c === from ? to : c)))].sort((a, b) => a.localeCompare(b, 'fr')).join(', ')
    const { error: e2 } = await writeDb().from('tags').update({ visible_pour: next }).eq('id', t.id)
    if (e2) throw e2
    changed++
  }
  return changed
}

// Renvoie la liste des tags, ou null si la table n'existe pas encore
// (migration migration_tags.sql pas encore lancée).
// ⚠️ INDISPENSABLE : le compte est mémorisé PAR SON NOM partout dans ce projet. Renommer un
// compte sans suivre ici laisserait TOUTE sa bibliothèque orpheline — ses tags
// disparaîtraient de son écran sans un mot.
export async function renameCompteDesTagsRows(oldName, newName) {
  const from = String(oldName || '').trim()
  const to = String(newName || '').trim()
  if (!from || !to || from === to) return 0
  const { data, error } = await supabase.from('tags').select('id').eq('compte', from)
  if (error) {
    if (/does not exist|schema cache|relation|could not find/i.test(error.message || '')) return 0
    throw error
  }
  if (!data?.length) return 0
  const { error: e2 } = await writeDb().from('tags').update({ compte: to }).eq('compte', from)
  if (e2) throw e2
  return data.length
}

// Supprimer un compte emporte SA bibliothèque : ses lignes n'appartiennent à personne
// d'autre, et deux lignes homonymes orphelines réapparaîtraient chez tout le monde.
export async function supprimeTagsDuCompte(nom) {
  const cible = String(nom || '').trim()
  if (!cible) return 0
  const { data, error } = await supabase.from('tags').select('id').eq('compte', cible)
  if (error) {
    if (/does not exist|schema cache|relation|could not find/i.test(error.message || '')) return 0
    throw error
  }
  if (!data?.length) return 0
  const { error: e2 } = await writeDb().from('tags').delete().eq('compte', cible)
  if (e2) throw e2
  return data.length
}

// Jumeau de `renameCompteDansTagsVisibles` pour la SUPPRESSION : sans lui, le nom d'un compte
// disparu reste pour toujours dans `visible_pour`. (Trou PRÉEXISTANT, fermé au passage.)
export async function retireCompteDeTagsVisibles(nom) {
  const cible = String(nom || '').trim()
  if (!cible) return 0
  const { data, error } = await supabase.from('tags').select('id, visible_pour')
  if (error) {
    if (/does not exist|schema cache|relation|could not find/i.test(error.message || '')) return 0
    throw error
  }
  let changed = 0
  for (const t of data ?? []) {
    if (!parseOwners(t.visible_pour).includes(cible)) continue
    const next = ecritVisiblePour(t.visible_pour, cible, false)
    const { error: e2 } = await writeDb().from('tags').update({ visible_pour: next }).eq('id', t.id)
    if (e2) throw e2
    changed++
  }
  return changed
}

export async function fetchTags() {
  const { data, error } = await supabase.from('tags').select('*').order('name')
  if (error) return null
  return data
}

export async function addTag(name, initials, color, visiblePour, compte) {
  const payload = { name: name.trim(), initials: initials || null, color: color || null }
  if (visiblePour !== undefined) payload.visible_pour = visiblePour || null
  // Le tag naît DANS la bibliothèque de son créateur. '' = commun (avant migration).
  if (compte !== undefined) payload.compte = compte || ''
  let { data, error } = await writeDb().from('tags').insert(payload).select().single()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('tags').insert(payload).select().single())
  }
  if (error) throw error
  return data
}

export async function updateTag(id, patch) {
  const payload = { ...patch }
  let { data, error } = await writeDb().from('tags').update(payload).eq('id', id).select()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('tags').update(payload).eq('id', id).select())
  }
  if (error) throw error
  if (!data || data.length === 0) {
    throw erreurUtilisateur("Les tags ne sont pas encore activés sur votre base.")
  }
}

export async function deleteTag(id) {
  const { error } = await writeDb().from('tags').delete().eq('id', id)
  if (error) throw error
}

// Renomme un tag : met à jour la ligne tags (nom + initiales/couleur) ET propage le nouveau
// nom dans la colonne games.tags de tous les jeux concernés. Renvoie le nb de jeux modifiés.
export async function renameTag(id, oldName, newName, patch = {}) {
  const to = (newName || '').trim()
  if (!to) throw erreurUtilisateur('Nom vide.')
  const payload = { name: to, ...patch }
  let { data, error } = await writeDb().from('tags').update(payload).eq('id', id).select()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('tags').update(payload).eq('id', id).select())
  }
  if (error) throw error
  if (!data || data.length === 0) throw erreurUtilisateur('Modification impossible (base non prête ?).')
  // ⚠️ On ne propage PAS ici. `renameInGamesCsv` compare l'ITEM ENTIER, ce que games.js
  // interdit explicitement pour `tags` depuis le format « tag::compte » — et `handleRenameTag`
  // appelle DÉJÀ `renameTagDansGames` juste après, qui couvre aussi les items communs.
  // L'appel était donc redondant depuis toujours, et doublait le compteur du toast.
  return 0
}
