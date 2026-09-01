import { supabase, writeDb } from './supabase'
import { parseOwners } from './games'

// TAGS PAR COMPTE — un même jeu peut être « À Vendre » chez un foyer et pas chez l'autre.
//
// Retour user à l'origine de ce module : « il faudrait qu'un même jeu ait des tags qui
// puissent être différents en fonction du compte, sinon les gens ne comprendront pas
// pourquoi leur jeu qu'ils avaient mis dans leur collection se retrouve à vendre. »
// Un jeu possédé à deux est UNE SEULE ligne (`games.owner` est un CSV de noms) : sa colonne
// `tags` valait donc pour tout le monde.
//
// LE FORMAT — la colonne reste un CSV « item, item ». Seul l'ITEM se précise :
//   « Grenier »                 → tag COMMUN (ancien format, ou posé sans compte actif)
//   « Grenier::Claire & Nazim » → tag propre à ce compte
//
// ⚠️⚠️ L'INVARIANT QUI PROTÈGE LES DONNÉES D'UN APPAREIL RESTÉ SUR L'ANCIEN CODE :
// items trimés, non vides, sans doublon, sans virgule, joints par « , » — c'est-à-dire la
// forme que produisait déjà `ownersToText`. Sous cette forme, l'ancien
// `tagsToText(parseTags(v))` rend EXACTEMENT `v` : un vieux bundle qui enregistre un prix ou
// bascule un jeu en collection **rend la colonne à l'octet près**. C'est ce qui rend ce
// changement sûr alors que le service worker peut resservir un ancien code pendant des jours.
// NE JAMAIS introduire d'échappement, changer le séparateur, ni laisser passer un item vide
// ou en doublon : chacune de ces trois choses casserait la propriété.
//
// AUCUNE MIGRATION : un item sans « :: » se comporte exactement comme avant (visible par
// tous). L'éclatement vers les propriétaires se fait PARESSEUSEMENT, au premier
// enregistrement, par la personne qui sait ce qu'elle veut garder.
export const TAG_SEP = '::'

// La couche CSV est la même que celle des propriétaires : même format, même garanties.
const parseCsv = parseOwners

// « Grenier::Claire & Nazim » → { tag, compte } ; « Grenier » → { tag, compte: null }
export function parseTagItems(text) {
  return parseCsv(text).map((item) => {
    const i = item.indexOf(TAG_SEP)
    if (i < 0) return { tag: item, compte: null }
    const tag = item.slice(0, i).trim()
    const compte = item.slice(i + TAG_SEP.length).trim()
    // Item mal formé (« ::x », « y:: ») : on le garde tel quel plutôt que de le perdre.
    return tag && compte ? { tag, compte } : { tag: item, compte: null }
  })
}

// Items → texte à stocker, sous la forme CANONIQUE (dédoublonnée, triée, « , »).
export function serializeTagItems(items) {
  const vus = new Set()
  for (const it of items || []) {
    const tag = String(it?.tag ?? '').trim()
    if (!tag) continue
    const compte = String(it?.compte ?? '').trim()
    vus.add(compte ? tag + TAG_SEP + compte : tag)
  }
  return [...vus].sort((a, b) => a.localeCompare(b, 'fr')).join(', ')
}

// Les tags VISIBLES depuis `compte` : les siens, plus les communs.
// ⚠️ `compte` null ou undefined (personne n'a choisi, ou on a choisi de tout voir) → on montre
// TOUT : on ne sait pas qui regarde, et masquer sur une base arbitraire serait un mensonge.
// C'est exactement le comportement d'avant les comptes.
export function tagsPourCompte(raw, compte) {
  const items = parseTagItems(raw)
  const list = compte ? items.filter((it) => it.compte === null || it.compte === compte) : items
  return [...new Set(list.map((it) => it.tag))].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Tous les tags du jeu, tous comptes confondus. Sert à PROPOSER des noms (chips du filtre,
// cases du formulaire) — jamais à afficher ce que porte un jeu.
export function tousLesTags(raw) {
  return [...new Set(parseTagItems(raw).map((it) => it.tag))]
}

// QUI POSSÈDE LE JEU, ET CE QUE CHACUN LUI A MIS — pour la fiche.
// Renvoie [{ compte, proprietaire, tags }] : les propriétaires du jeu d'abord, puis les
// comptes qui ont posé un tag sans le posséder (rare, mais on ne le cache pas).
// ⚠️ Les tags COMMUNS (ancien format, pas encore rattachés) comptent pour TOUT LE MONDE —
// c'est ce que voit chaque compte, donc c'est ce qu'on montre.
export function tagsParCompte(raw, ownerText) {
  const items = parseTagItems(raw)
  const proprios = parseOwners(ownerText)
  const communs = [...new Set(items.filter((it) => !it.compte).map((it) => it.tag))]
  const autres = [...new Set(items.filter((it) => it.compte).map((it) => it.compte))]
    .filter((c) => !proprios.includes(c))
  const pour = (c) =>
    [...new Set([...communs, ...items.filter((it) => it.compte === c).map((it) => it.tag)])]
      .sort((a, b) => a.localeCompare(b, 'fr'))
  return [
    ...proprios.map((c) => ({ compte: c, proprietaire: true, tags: pour(c) })),
    ...autres.map((c) => ({ compte: c, proprietaire: false, tags: pour(c) })),
  ]
}

// Écrit la tranche du compte actif SANS toucher à celle des autres.
// ⚠️ `ownerAvant` = `games.owner` TEL QU'EN BASE, jamais la valeur du formulaire : sinon,
// ajouter un propriétaire lui offrirait au passage les tags posés avant son arrivée.
export function ecritTagsDuCompte(raw, compte, tagsChoisis, ownerAvant) {
  const items = parseTagItems(raw)
  const choisis = [...new Set((tagsChoisis || []).map((t) => String(t).trim()).filter(Boolean))]
  if (!compte) {
    // ⚠️ Sans compte actif on n'écrit RIEN. L'ancienne branche reposait les tags « en commun »
    // — or `tagsPourCompte(raw, null)` rend TOUT : un simple « Modifier / Enregistrer » depuis
    // « tout voir » RENDAIT À TOUT LE MONDE les tags privés de chacun. Le champ Tags est
    // d'ailleurs masqué dans ce cas (GameForm), donc il n'y a rien à enregistrer.
    return raw ?? ''
  }
  const proprios = parseOwners(ownerAvant)
  // ÉCLATEMENT des communs vers les propriétaires du jeu.
  // ⚠️ Il ne dépend PAS de « suis-je propriétaire » : sinon, décocher un tag commun sur un jeu
  // qui n'est pas le mien n'aurait aucun effet — le commun resterait, n'appartenant à aucune
  // tranche — et rien ne le dirait. Éclater est sans dommage pour les propriétaires : ils
  // continuent de voir exactement le même tag.
  // ⚠️ Et si le jeu n'a PLUS AUCUN propriétaire (possible depuis que supprimer un compte retire
  // son nom des jeux), on rattache au compte qui enregistre — sinon le commun serait à jamais
  // indécochable. `compte` est garanti non nul ici (retour anticipé plus haut).
  const cibles = proprios.length ? proprios : [compte]
  const base = items.flatMap((it) => (it.compte ? [it] : cibles.map((p) => ({ tag: it.tag, compte: p }))))
  return serializeTagItems([
    ...base.filter((it) => it.compte !== compte),
    ...choisis.map((tag) => ({ tag, compte })),
  ])
}

// Ce qu'il faut écrire dans `games.tags`, en RELISANT la ligne juste avant.
// ⚠️ La relecture ramène la fenêtre de course de « la durée pendant laquelle le formulaire est
// resté ouvert » à quelques millisecondes : sans elle, enregistrer depuis un formulaire ouvert
// depuis cinq minutes écraserait ce qu'un autre compte vient de poser. Repli sur les valeurs du
// formulaire si la lecture échoue — le pire cas redevient simplement l'ancien comportement.
export async function tagsAEcrire(gameId, compte, tagsChoisis, rawFallback, ownerFallback) {
  let raw = rawFallback ?? null
  let owner = ownerFallback ?? ''
  if (gameId) {
    try {
      const { data } = await supabase.from('games').select('tags, owner').eq('id', gameId).single()
      if (data) {
        raw = data.tags ?? null
        owner = data.owner ?? ''
      }
    } catch {
      /* hors ligne ou lecture en échec : on garde les valeurs du formulaire */
    }
  }
  return ecritTagsDuCompte(raw, compte, tagsChoisis, owner)
}

// Renomme un TAG dans `games.tags`, dans toutes les tranches.
// ⚠️ `renameInGamesCsv` NE PEUT PLUS servir ici : il compare l'ITEM ENTIER au nom cherché,
// donc « Grenier » ne matcherait pas « Grenier::Claire & Nazim ». Le renommage ne
// propagerait rien et le tag se dédoublerait — une panne parfaitement silencieuse.
export function renameTagDansGames(oldName, newName, compte = null) {
  const from = String(oldName || '').trim()
  return remplaceDansTags(
    compte ? (it) => it.tag === from && it.compte === compte : (it) => it.tag === from,
    (it, to) => ({ ...it, tag: to }),
    oldName,
    newName,
    compte
  )
}

// ⚠️ INDISPENSABLE : renommer un COMPTE sans suivre ici laisserait toutes ses tranches
// orphelines — ses tags disparaîtraient de son écran sans un mot. Même famille de défaut que
// le filtre propriétaire mort, déjà traité dans `handleRenameOwner`.
export function renameCompteDansTags(oldName, newName) {
  return remplaceDansTags(
    (it) => it.compte === String(oldName || '').trim(),
    (it, to) => ({ ...it, compte: to }),
    oldName,
    newName
  )
}

// Retire de TOUS les jeux les items qui matchent, toutes tranches confondues.
// ⚠️ Sert à deux suppressions qui, sans elle, laissent une trace VISIBLE :
//  · un TAG supprimé de la liste resterait dans games.tags — sans ligne, il n'a plus de mode
//    de filtrage, redevient donc masquant, et ses jeux QUITTENT la collection sans un mot ;
//  · un COMPTE supprimé laisserait ses tranches « tag::lui » — la fiche d'un jeu afficherait
//    alors une ligne au nom d'un compte qui n'existe plus.
// ⚠️⚠️ L'ÉCLATEMENT PRÉALABLE, et pourquoi il n'est pas optionnel.
// Depuis que la bibliothèque appartient à un compte, une propagation qui ne touche QUE ma
// tranche doit d'abord rattacher les items COMMUNS à leurs propriétaires. Sans lui, renommer
// mon « Grenier » laisserait derrière un item commun « Grenier » — qui n'a plus de ligne chez
// personne, donc plus de mode de filtrage, donc redevient masquant : des jeux quitteraient la
// collection en silence. C'est exactement la règle qu'applique déjà `ecritTagsDuCompte`.
// ⚠️ `replacant` : à qui rattacher quand le jeu n'a PLUS AUCUN propriétaire (possible depuis
// que supprimer un compte retire son nom des jeux). Sans lui, l'item commun restait commun pour
// toujours — décocher n'écrivait rien, « Supprimer ce tag » ne le retirait pas, le renommage le
// sautait — et sans tranche chez personne il MASQUE le jeu pour tout le monde. On le rattache
// donc au compte QUI AGIT : c'est lui qui décide, et le geste redevient possible.
const eclate = (items, ownerText, replacant = null) => {
  const proprios = parseOwners(ownerText)
  const cibles = proprios.length ? proprios : replacant ? [replacant] : []
  if (!cibles.length) return items // ni propriétaire ni compte qui agit : on ne devine pas
  return items.flatMap((it) => (it.compte ? [it] : cibles.map((p) => ({ tag: it.tag, compte: p }))))
}

// `compte` non nul → on n'agit que sur MA tranche, après éclatement. Null → tout (l'ancien
// comportement, employé par la suppression d'un compte, qui vise justement toutes ses tranches).
async function retireDesTags(garde, compte = null) {
  const { data, error } = await supabase.from('games').select('id, tags, owner')
  if (error) throw error
  let changed = 0
  for (const g of data ?? []) {
    const items = compte ? eclate(parseTagItems(g.tags), g.owner, compte) : parseTagItems(g.tags)
    const restants = items.filter(garde)
    const next = serializeTagItems(restants)
    if (next === (g.tags ?? '')) continue
    const { error: e2 } = await writeDb().from('games').update({ tags: next }).eq('id', g.id)
    if (e2) throw e2
    changed++
  }
  return changed
}

// Supprimer un tag le retire aussi des jeux — c'est ce que le geste promet, et c'est le
// symétrique de `renameTagDansGames`, qui propage déjà le renommage.
export function supprimeTagDansGames(nom, compte = null) {
  const cible = String(nom || '').trim()
  if (!cible) return Promise.resolve(0)
  // Sans compte : toutes les tranches (le monde d'avant la migration).
  const garde = compte
    ? (it) => !(it.tag === cible && it.compte === compte)
    : (it) => it.tag !== cible
  return retireDesTags(garde, compte)
}

// Supprimer un compte retire les tranches qui lui appartiennent. Les tags COMMUNS (sans
// compte) sont conservés : ils n'appartiennent à personne en particulier.
export function supprimeCompteDansTags(nom) {
  const cible = String(nom || '').trim()
  if (!cible) return Promise.resolve(0)
  return retireDesTags((it) => it.compte !== cible)
}

async function remplaceDansTags(match, remplace, oldName, newName, compte = null) {
  const from = String(oldName || '').trim()
  const to = String(newName || '').trim()
  if (!from || !to || from === to) return 0
  const { data, error } = await supabase.from('games').select('id, tags, owner')
  if (error) throw error
  let changed = 0
  for (const g of data ?? []) {
    const items = compte ? eclate(parseTagItems(g.tags), g.owner, compte) : parseTagItems(g.tags)
    if (!items.some(match)) continue
    const next = serializeTagItems(items.map((it) => (match(it) ? remplace(it, to) : it)))
    if (next === (g.tags ?? '')) continue
    const { error: e2 } = await writeDb().from('games').update({ tags: next }).eq('id', g.id)
    if (e2) throw e2
    changed++
  }
  return changed
}
