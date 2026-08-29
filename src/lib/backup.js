import { erreurUtilisateur } from './messages'
import { supabase, writeDb } from './supabase'
import { tousLesTags } from './tagsJeux'
import { fetchAllPlays } from './plays'
import { fetchAllScoresheets } from './scoresheets'
import { fetchAllTierlists } from './tierlists'

// Sauvegarde / restauration de TOUTES les données (fichier JSON ou table `backups`).
// Contenu d'une sauvegarde : jeux + propriétaires + tags + PARTIES + FICHES + TIERLISTS.
// Import = on ré-insère ce contenu (mise à jour de l'existant par identifiant, ajout du
// reste), pour restaurer après une fausse manœuvre ou déménager vers une autre base.

// ⚠️ Ces listes de colonnes sont écrites À LA MAIN : toute nouvelle colonne ajoutée en
// base doit être ajoutée ici, sinon elle sera silencieusement absente des sauvegardes.
const GAME_COLS = [
  'id', 'bgg_id', 'name', 'players', 'players_min', 'players_max', 'players_best',
  'duration_min', 'duration_max', 'complexity', 'price', 'image_url', 'owner', 'tags', 'status', 'extensions', 'bgg_poll', 'created_at',
]
const PLAY_COLS = [
  'id', 'game_id', 'played_at', 'players', 'winner', 'extensions',
  'outcome', 'scenario', 'score', 'notes', 'trigger', 'created_at',
]
const SHEET_COLS = ['id', 'game_id', 'template', 'updated_at']
const TIERLIST_COLS = ['id', 'player', 'ranking', 'created_at', 'updated_at']

function pick(obj, cols) {
  const out = {}
  cols.forEach((c) => {
    if (obj[c] !== undefined) out[c] = obj[c]
  })
  return out
}

// Une bulle gérée (compte ou tag) → objet à sauvegarder.
// ⚠️ Les trois champs de base existent depuis toujours. `BUBBLE_OPT` liste les colonnes
// AJOUTÉES PLUS TARD : elles ne sont recopiées que si la LIGNE les porte, et l'upsert les
// retire d'elle-même si la base ne les connaît pas encore (migration non lancée).
// Sans cette liste, une colonne neuve serait SILENCIEUSEMENT absente de toutes les
// sauvegardes — et effacée à la première restauration.
//
// ⚠️⚠️ LE TEST PORTE SUR `undefined`, JAMAIS SUR `null` — et la nuance est tout le sujet.
// Cette fonction sert à DEUX moments, sur deux sortes d'objets :
//  · à la SAUVEGARDE, sur une ligne venue de la base : la clé est toujours là, éventuellement
//    à `null`. Un `null` DOIT partir dans le fichier, sinon la restauration ne peut pas
//    remettre un réglage à sa valeur d'origine — un tag repassé « visibles » après coup
//    resterait visible, un avatar ajouté après coup resterait en place. C'était le trou.
//  · à la RESTAURATION, sur un objet venu du FICHIER : une sauvegarde ANCIENNE, faite avant
//    l'ajout de la colonne, n'a pas la clé du tout → `undefined` → on ne l'envoie pas, et la
//    valeur actuelle en base est PRÉSERVÉE. C'est le bon comportement : une vieille sauvegarde
//    ne doit pas effacer une donnée dont elle ignore l'existence.
// Écarter `null` confondait ces deux cas et ne servait que le second.
const BUBBLE_OPT = ['avatar', 'visible_pour', 'compte']
function pickBubble(o) {
  const out = { name: o.name, initials: o.initials ?? null, color: o.color ?? null }
  for (const c of BUBBLE_OPT) if (o[c] !== undefined) out[c] = o[c]
  return out
}

// Construit l'objet de sauvegarde. `plays` et `scoresheets` viennent de la base
// (ils ne sont pas tous chargés dans l'app) → voir collectSnapshot ci-dessous.
// version 2 = contient les parties et les fiches ; version 1 = anciennes sauvegardes.
export function buildBackup(games, owners, tags, plays, scoresheets, tierlists, exportedAt) {
  return {
    app: 'kalyx',
    version: 2,
    exportedAt: exportedAt || null,
    games: (games ?? []).map((g) => pick(g, GAME_COLS)),
    owners: (owners ?? []).map(pickBubble),
    tags: (tags ?? []).map(pickBubble),
    plays: (plays ?? []).map((p) => pick(p, PLAY_COLS)),
    scoresheets: (scoresheets ?? []).map((s) => pick(s, SHEET_COLS)),
    tierlists: (tierlists ?? []).map((t) => pick(t, TIERLIST_COLS)),
  }
}

// Instantané COMPLET : on relit parties, fiches et tierlists en base (l'app n'en garde
// qu'une partie en mémoire), puis on assemble la sauvegarde.
export async function collectSnapshot(games, owners, tags, exportedAt) {
  const [plays, scoresheets, tierlists] = await Promise.all([fetchAllPlays(), fetchAllScoresheets(), fetchAllTierlists()])
  return buildBackup(games, owners, tags, plays, scoresheets, tierlists, exportedAt)
}

// Déclenche le téléchargement du fichier de sauvegarde. Renvoie le détail des quantités.
export async function downloadBackup(games, owners, tags, dateStr) {
  const data = await collectSnapshot(games, owners, tags, dateStr)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kalyx-sauvegarde-${dateStr || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { games: data.games.length, plays: data.plays.length, sheets: data.scoresheets.length, tierlists: data.tierlists.length }
}

// ============================================================
//  Export CSV (pour ouvrir les données dans un tableur)
// ============================================================
// Excel en français attend le POINT-VIRGULE comme séparateur et un BOM UTF-8, sinon les
// accents deviennent illisibles et tout se retrouve dans une seule colonne.
const SEP = ';'
const BOM = '﻿'

// Échappe une valeur : guillemets doublés, et on entoure dès qu'il y a un caractère gênant.
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(entetes, lignes) {
  return BOM + [entetes, ...lignes].map((r) => r.map(csvCell).join(SEP)).join('\r\n')
}

function telecharger(contenu, nom, type) {
  const blob = new Blob([contenu], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Deux fichiers CSV : un pour les jeux, un pour les parties (une ligne PAR JOUEUR et par
// partie — le format le plus pratique pour un tableur croisé dynamique).
export async function downloadCsv(games, owners, tags, dateStr) {
  const data = await collectSnapshot(games, owners, tags, dateStr)
  const nomDuJeu = new Map(data.games.map((g) => [g.id, g.name]))

  const jeux = data.games.map((g) => [
    g.name, g.status === 'wishlist' ? 'wishlist' : 'collection', g.players,
    g.players_best, g.duration_max ?? g.duration_min, g.complexity, g.price,
    // ⚠️ Les NOMS de tags, jamais la colonne brute : depuis les tags par compte, un item
    // peut valoir « Grenier::Claire & Nazim », illisible et intriable dans un tableur.
    g.owner, tousLesTags(g.tags).join(', '), g.bgg_id, g.image_url,
  ])
  telecharger(
    toCsv(
      ['Jeu', 'Statut', 'Joueurs', 'Joueurs idéal', 'Durée (min)', 'Complexité', 'Prix', 'Propriétaires', 'Tags', 'ID BGG', 'Image'],
      jeux
    ),
    `kalyx-jeux-${dateStr || 'export'}.csv`,
    'text/csv;charset=utf-8'
  )

  // Une ligne par joueur ET par partie : le nom du jeu est écrit en clair (pas d'identifiant
  // à recoller à la main), ce qui rend le fichier exploitable tel quel dans un tableur.
  const parties = []
  data.plays.forEach((p) => {
    const gagnants = String(p.winner || '').split(',').map((s) => s.trim()).filter(Boolean)
    ;(p.players || []).forEach((j) => {
      const nom = (j?.name || '').trim()
      // Les catégories varient d'un jeu à l'autre : les mettre en colonnes fixes n'aurait
      // aucun sens. On les rassemble en un texte lisible « Lieux=14, Seigneurs=20 ».
      const detail = Object.entries(j?.scores || {}).map(([c, v]) => `${c}=${v}`).join(', ')
      parties.push([
        nomDuJeu.get(p.game_id) || '(jeu supprimé)',
        (p.played_at || '').slice(0, 10),
        nom,
        j?.team || '',
        j?.total ?? p.score ?? '',
        gagnants.includes(nom) || p.outcome === 'win' ? 'oui' : 'non',
        p.outcome === 'win' ? 'gagné' : p.outcome === 'loss' ? 'perdu' : '',
        p.scenario || '',
        p.trigger || '',
        (p.extensions || []).join(', '),
        detail,
        p.notes || '',
      ])
    })
  })
  telecharger(
    toCsv(
      ['Jeu', 'Date', 'Joueur', 'Équipe', 'Score', 'Gagnant', 'Résultat (coop)', 'Scénario', 'Fin de partie', 'Extensions', 'Détail des points', 'Notes'],
      parties
    ),
    `kalyx-parties-${dateStr || 'export'}.csv`,
    'text/csv;charset=utf-8'
  )

  return { games: jeux.length, lignesParties: parties.length }
}

// Valide et lit un fichier de sauvegarde (texte JSON). Lève une erreur si invalide.
export function parseBackup(text) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('Fichier illisible (ce n\'est pas du JSON valide).')
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.games)) {
    throw new Error('Ce fichier n\'est pas une sauvegarde Kalyx.')
  }
  const games = obj.games.filter((g) => g && g.name)
  const owners = Array.isArray(obj.owners) ? obj.owners.filter((o) => o && o.name) : []
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t) => t && t.name) : []
  // Anciennes sauvegardes (version 1) : pas de parties ni de fiches → tableaux vides,
  // et surtout on ne touchera à rien de ce côté-là à l'import.
  const plays = Array.isArray(obj.plays) ? obj.plays.filter((p) => p && p.id && p.game_id) : []
  const scoresheets = Array.isArray(obj.scoresheets) ? obj.scoresheets.filter((s) => s && s.game_id) : []
  const tierlists = Array.isArray(obj.tierlists) ? obj.tierlists.filter((t) => t && t.player) : []
  return { games, owners, tags, plays, scoresheets, tierlists }
}

// Insère/écrase une liste de bulles gérées (propriétaires ou tags) par nom.
// Si la table n'existe pas (migration non lancée), on ignore silencieusement.
async function upsertBubbles(table, list) {
  if (!list || !list.length) return
  let rows = list.map((o) => ({ ...pickBubble(o), name: String(o.name).trim() }))
  // ⚠️ Depuis les bibliothèques par compte, un tag est unique par (name, compte) : deux
  // foyers peuvent avoir chacun leur « Grenier ». Viser `name` seul en écraserait un.
  // `compte` est normalisé à '' quand la sauvegarde ne le porte pas (fichier antérieur à la
  // migration) : c'est le tag commun, et la restauration redevient un vrai retour arrière.
  let cible = 'name'
  if (table === 'tags' && rows.some((r) => r.compte !== undefined)) {
    rows = rows.map((r) => ({ ...r, compte: r.compte ?? '' }))
    cible = 'name,compte'
  }
  // Dégradation en cascade, comme pour les jeux : si la base ne connaît pas encore une
  // colonne optionnelle, on la retire et on réessaie → le reste se restaure quand même.
  for (;;) {
    const { error } = await writeDb().from(table).upsert(rows, { onConflict: cible })
    if (!error) return
    // ⚠️ 42P10 = « no unique or exclusion constraint matching the ON CONFLICT specification » :
    // la base ne connaît pas encore le monde par compte (migration non lancée). Ce code n'est
    // reconnu NI par la boucle de colonnes NI par `tableMissing` → sans cette branche, la
    // restauration s'arrêterait net et la sauvegarde d'urgence deviendrait inutilisable.
    if (cible !== 'name' && (error.code === '42P10' || /ON CONFLICT/i.test(error.message || ''))) {
      cible = 'name'
      rows = rows.map(({ compte: _c, ...reste }) => reste)
      continue
    }
    // ⚠️⚠️ DEUX FAUTES QUI S'ADDITIONNAIENT ICI, et la dégradation était morte deux fois :
    //  1. le test « table absente » passait EN PREMIER — or PostgREST annonce une COLONNE manquante
    //     par « Could not find the 'avatar' column … in the schema cache », qui contient « schema
    //     cache » : on sortait en silence, comptes et tags perdus, l'import se disant réussi ;
    //  2. le motif était écrit dans un TEMPLATE LITERAL, où \b est le caractère BACKSPACE et non la
    //     frontière de mot d'une regex (piège déjà documenté et corrigé dans owners.js) → la colonne
    //     n'était de toute façon jamais reconnue. On construit la regex par CONCATÉNATION.
    const col = BUBBLE_OPT.find(
      (c) => rows.some((r) => r[c] !== undefined) && new RegExp('\\b' + c + '\\b', 'i').test(error.message || '')
    )
    if (col) {
      rows = rows.map(({ [col]: _ignore, ...reste }) => reste)
      continue
    }
    if (tableMissing(error)) return // table absente : migration pas lancée, on ignore
    throw error
  }
}

// Colonnes qui peuvent manquer sur une base dont toutes les migrations n'ont pas été lancées.
const OPTIONAL_ROW_COLS = { plays: ['trigger', 'notes', 'scenario', 'score', 'outcome'] }

// Ré-insère des lignes par identifiant, en ignorant la table si elle n'existe pas encore.
// ⚠️ Une COLONNE absente n'est pas une TABLE absente : PostgREST dit « Could not find the 'trigger'
// column … in the schema cache », qui matchait `tableMissing` → on renvoyait 0 et la restauration
// annonçait un SUCCÈS en ayant jeté toutes les parties. On dégrade donc colonne par colonne, comme
// pour les jeux, et on ne rend 0 que si la table est réellement absente.
async function upsertRows(table, rows, conflictCol) {
  if (!rows || !rows.length) return 0
  const opt = OPTIONAL_ROW_COLS[table] || []
  let lignes = rows
  for (let garde = 0; garde <= opt.length; garde++) {
    const { error } = await writeDb().from(table).upsert(lignes, { onConflict: conflictCol })
    if (!error) return lignes.length
    const col = opt.find((c) => new RegExp('\\b' + c + '\\b', 'i').test(error.message || ''))
    if (col) {
      lignes = lignes.map(({ [col]: _ignore, ...reste }) => reste)
      continue
    }
    if (tableMissing(error)) return 0
    throw error
  }
  return 0
}

// Applique une sauvegarde : propriétaires + tags (par nom), puis les jeux (par
// identifiant), puis les parties et les fiches — DANS CET ORDRE : parties et fiches
// pointent vers un jeu, celui-ci doit donc exister d'abord.
export async function importBackup({ games, owners, tags, plays, scoresheets, tierlists }) {
  await upsertBubbles('owners', owners)
  await upsertBubbles('tags', tags)

  const rows = games
    .map((g) => {
      const row = pick(g, GAME_COLS)
      if (!row.id) delete row.id // pas d'id → la base en génère un (nouveau jeu)
      if (row.owner == null) row.owner = '' // colonne NOT NULL
      if (row.status !== 'wishlist') row.status = 'collection'
      return row.name ? row : null
    })
    .filter(Boolean)
  // Repli si une colonne optionnelle n'existe pas encore sur la base cible (migration non
  // lancée / base plus ancienne) : on retire la colonne fautive et on réessaie, sinon
  // TOUTE la restauration échouerait. Couvre tags / extensions / bgg_poll.
  const OPTIONAL_GAME_COLS = ['tags', 'extensions', 'bgg_poll']
  let { error } = await writeDb().from('games').upsert(rows, { onConflict: 'id' })
  let guard = 0
  while (error && guard++ < OPTIONAL_GAME_COLS.length) {
    const miss = OPTIONAL_GAME_COLS.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(error.message || ''))
    if (!miss) break
    rows.forEach((r) => delete r[miss])
    ;({ error } = await writeDb().from('games').upsert(rows, { onConflict: 'id' }))
  }
  if (error) throw error

  // Les parties et fiches ne sont réinsérées que pour des jeux réellement présents,
  // sinon la clé étrangère ferait échouer tout le lot.
  const gameIds = new Set(rows.map((r) => r.id).filter(Boolean))
  const okGame = (r) => gameIds.size === 0 || gameIds.has(r.game_id)
  const playRows = (plays ?? []).map((p) => pick(p, PLAY_COLS)).filter(okGame)
  const sheetRows = (scoresheets ?? []).map((s) => pick(s, SHEET_COLS)).filter(okGame)
  const nPlays = await upsertRows('plays', playRows, 'id')
  const nSheets = await upsertRows('scoresheets', sheetRows, 'game_id')

  // Tierlists : indépendantes des jeux (le classement stocke des ids dans un jsonb, pas de
  // FK). On upsert par `player` (clé naturelle) SANS l'id (non signifiant entre bases).
  const tierlistRows = (tierlists ?? [])
    .map((t) => ({ player: String(t.player || '').trim(), ranking: t.ranking || {} }))
    .filter((t) => t.player)
  const nTierlists = await upsertRows('tierlists', tierlistRows, 'player')

  return {
    games: rows.length,
    owners: (owners && owners.length) || 0,
    tags: (tags && tags.length) || 0,
    plays: nPlays,
    scoresheets: nSheets,
    tierlists: nTierlists,
  }
}

// ============================================================
//  Sauvegardes automatiques stockées dans Supabase (table `backups`)
//  → rechargeables depuis n'importe quel appareil, rotation des N plus récentes.
// ============================================================

const BACKUP_KEEP = 3 // nombre de sauvegardes AUTO conservées (rotation)
// Chute du nombre de jeux au-delà de laquelle on refuse la sauvegarde automatique
// (0.2 = 20 %) : on préfère garder les sauvegardes saines et alerter.
const DROP_ALERT = 0.2

// Délai minimal entre 2 sauvegardes AUTO, selon la fréquence choisie.
const FREQ_MS = {
  always: 2 * 60 * 1000, // à chaque ouverture (min 2 min pour éviter les doublons d'une même session)
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

// ⚠️ Une colonne manquante est annoncée « Could not find the 'x' column … in the schema cache » :
// sans l'exclure, tout appelant de tableMissing prendrait une colonne absente pour une table absente.
const colonneAbsente = (error) => /Could not find the '[^']+' column/i.test(error?.message || '')
const tableMissing = (error) =>
  !colonneAbsente(error) && /does not exist|schema cache|relation/i.test(error?.message || '')

// Liste des sauvegardes (SANS les données lourdes), plus récente d'abord.
// Renvoie null si la table n'existe pas encore (migration non lancée).
export async function fetchBackups() {
  const { data, error } = await supabase
    .from('backups')
    .select('id, created_at, games_count, owners_count, tags_count, kind')
    .order('created_at', { ascending: false })
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  return data ?? []
}

// Crée une sauvegarde (snapshot complet) puis ne garde que les BACKUP_KEEP plus récentes.
// kind = 'auto' | 'manual'. Renvoie true, ou null si la table n'existe pas encore.
export async function createBackup(games, owners, tags, kind = 'auto') {
  const snapshot = await collectSnapshot(games, owners, tags, new Date().toISOString())
  const row = {
    data: snapshot,
    games_count: snapshot.games.length,
    owners_count: snapshot.owners.length,
    tags_count: snapshot.tags.length,
    kind,
  }
  const { error } = await writeDb().from('backups').insert(row)
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  // Rotation : uniquement sur les sauvegardes AUTOMATIQUES. Une sauvegarde manuelle est
  // faite exprès (souvent juste avant une manœuvre risquée) → elle ne doit pas être
  // balayée par les automatiques des jours suivants.
  const { data: autos } = await supabase
    .from('backups')
    .select('id')
    .eq('kind', 'auto')
    .order('created_at', { ascending: false })
  if (autos && autos.length > BACKUP_KEEP) {
    const toDelete = autos.slice(BACKUP_KEEP).map((b) => b.id)
    await writeDb().from('backups').delete().in('id', toDelete)
  }
  return true
}

// Sauvegarde AUTO si le délai lié à la fréquence est écoulé depuis la dernière.
// Renvoie true si une sauvegarde a été créée.
export async function maybeAutoBackup(frequency, games, owners, tags) {
  if (!frequency || frequency === 'manual') return false
  if (!games || !games.length) return false // ne jamais sauvegarder un état vide
  const interval = FREQ_MS[frequency]
  if (!interval) return false
  const list = await fetchBackups()
  if (list === null) return false // table absente → rien à faire
  const newest = list[0]
  if (newest && Date.now() - new Date(newest.created_at).getTime() < interval) return false // trop récent

  // GARDE-FOU : une chute brutale du nombre de jeux signale presque toujours un incident
  // (import raté, suppressions en série, base à moitié chargée) et jamais une intention.
  // On refuse alors d'écraser les sauvegardes saines par l'état abîmé, et on prévient.
  if (newest && newest.games_count > 0) {
    const perdus = newest.games_count - games.length
    // Seuil calculé EN NOMBRE DE JEUX (arrondi) : comparer des pourcentages en décimaux
    // rate le cas pile-au-seuil (135 → 108 donne 0,19999… et non 0,2).
    const seuil = Math.max(1, Math.round(newest.games_count * DROP_ALERT))
    if (perdus >= seuil) {
      return { skipped: 'drop', before: newest.games_count, after: games.length, lost: perdus }
    }
  }

  await createBackup(games, owners, tags, 'auto')
  return true
}

// Supprime dans `table` les lignes dont la clé (keyCol) n'est pas dans `keep` (Set).
// La clé d'un tag depuis les bibliothèques par compte. '' = commun (avant migration).
const cleTag = (name, compte) => String(name ?? '').trim() + '|' + String(compte ?? '').trim()

// Jumeau de `deleteExtra` pour les tags : on compare la PAIRE et on supprime par id.
// ⚠️ Dégradation : si la base ne connaît pas encore `compte`, le select échoue → on retombe
// sur l'ancien comportement (par nom), qui est le bon dans ce monde-là.
async function deleteExtraTags(keep) {
  const { data, error } = await supabase.from('tags').select('id, name, compte')
  if (error) {
    if (tableMissing(error)) return
    return deleteExtra('tags', 'name', new Set([...keep].map((k) => k.split('|')[0])))
  }
  const toDelete = (data ?? []).filter((r) => !keep.has(cleTag(r.name, r.compte))).map((r) => r.id)
  if (toDelete.length) {
    const { error: delErr } = await writeDb().from('tags').delete().in('id', toDelete)
    if (delErr) throw delErr
  }
}

async function deleteExtra(table, keyCol, keep) {
  const { data, error } = await supabase.from(table).select(keyCol)
  if (error) {
    if (tableMissing(error)) return
    throw error
  }
  const toDelete = (data ?? []).map((r) => r[keyCol]).filter((v) => v != null && !keep.has(v))
  if (toDelete.length) {
    const { error: delErr } = await writeDb().from(table).delete().in(keyCol, toDelete)
    if (delErr) throw delErr
  }
}

// Ce qu'une restauration détruirait : les jeux absents de la sauvegarde, et — par effet
// de cascade en base — leurs parties et leurs fiches. Sert à prévenir AVANT d'agir.
export async function restorePreview(backupId) {
  const { data: row, error } = await supabase.from('backups').select('data').eq('id', backupId).single()
  if (error) throw error
  const snap = row?.data || {}
  const keep = new Set((Array.isArray(snap.games) ? snap.games : []).map((g) => g.id).filter(Boolean))
  const { data: current } = await supabase.from('games').select('id, name')
  const doomed = (current ?? []).filter((g) => !keep.has(g.id))

  // ⚠️ La restauration supprime AUSSI les comptes et les tags absents de la sauvegarde
  // (deleteExtra plus bas) — l'écran de confirmation l'annonçait sans jamais dire lesquels
  // ni combien. Le jour où un compte porte un avatar choisi, le perdre en silence se voit.
  const nomsDe = (l) => new Set((Array.isArray(l) ? l : []).map((b) => String(b?.name ?? '').trim()).filter(Boolean))
  const gardeOwners = nomsDe(snap.owners)
  // ⚠️ Les tags se comparent sur la PAIRE (nom, compte) — deux foyers ont chacun le leur.
  const gardeTags = new Set(
    (Array.isArray(snap.tags) ? snap.tags : []).map((t) => cleTag(t?.name, t?.compte))
  )
  const [{ data: curOwners }, { data: curTags }] = await Promise.all([
    supabase.from('owners').select('name'),
    supabase.from('tags').select('name, compte'),
  ])
  const perdus = (cur, garde) =>
    (cur ?? []).map((r) => String(r.name ?? '').trim()).filter((n) => n && !garde.has(n))
  const ownersPerdus = perdus(curOwners, gardeOwners)
  // On NOMME le compte : « À Vendre — Claire & Nazim » dit lequel des deux disparaîtrait.
  const tagsPerdus = (curTags ?? [])
    .filter((r) => String(r.name ?? '').trim() && !gardeTags.has(cleTag(r.name, r.compte)))
    .map((r) => (r.compte ? `${r.name} — ${r.compte}` : String(r.name).trim()))

  const base = { games: 0, plays: 0, sheets: 0, names: [], owners: ownersPerdus, tags: tagsPerdus }
  if (!doomed.length) return base
  const ids = doomed.map((g) => g.id)
  const [{ data: pl }, { data: sh }] = await Promise.all([
    supabase.from('plays').select('id').in('game_id', ids),
    supabase.from('scoresheets').select('id').in('game_id', ids),
  ])
  return {
    ...base,
    games: doomed.length,
    plays: (pl ?? []).length,
    sheets: (sh ?? []).length,
    names: doomed.map((g) => g.name).filter(Boolean),
  }
}

// Restaure une sauvegarde.
//  • jeux / propriétaires / tags : vrai retour arrière (on remet l'état, on supprime le surplus)
//  • parties et fiches : AJOUT/MISE À JOUR SEULEMENT — une partie jouée après la sauvegarde
//    est conservée. Revenir en arrière sur la collection ne doit pas effacer une soirée de jeu.
export async function restoreBackup(backupId) {
  const { data: row, error } = await supabase.from('backups').select('data').eq('id', backupId).single()
  if (error) throw error
  const snap = row?.data || {}
  const games = Array.isArray(snap.games) ? snap.games : []
  const owners = Array.isArray(snap.owners) ? snap.owners : []
  const tags = Array.isArray(snap.tags) ? snap.tags : []
  const plays = Array.isArray(snap.plays) ? snap.plays : []
  const scoresheets = Array.isArray(snap.scoresheets) ? snap.scoresheets : []
  const tierlists = Array.isArray(snap.tierlists) ? snap.tierlists : []

  // GARDE-FOU : une sauvegarde sans aucun jeu (données vides, ligne corrompue) effacerait
  // TOUTE la collection via deleteExtra ci-dessous. On refuse plutôt que d'effacer.
  if (!games.length) throw erreurUtilisateur('Sauvegarde vide ou illisible — restauration annulée.')

  // 1) ré-insère / met à jour tout ce qui est dans la sauvegarde (jeux d'abord). Les tierlists
  //    sont ADDITIVES (comme les parties) : restaurer la collection n'efface pas une tierlist.
  const res = await importBackup({ games, owners, tags, plays, scoresheets, tierlists })
  // 2) supprime les jeux / propriétaires / tags absents de la sauvegarde (retour arrière)
  await deleteExtra('games', 'id', new Set(games.map((g) => g.id).filter(Boolean)))
  await deleteExtra('owners', 'name', new Set(owners.map((o) => String(o.name).trim())))
  // ⚠️ PAS `deleteExtra('tags','name',…)` : la clé est composite. Supprimer par nom
  // retirerait « À Vendre » de TOUS les comptes parce qu'un seul l'a dans sa sauvegarde.
  await deleteExtraTags(new Set(tags.map((t) => cleTag(t.name, t.compte))))

  return { games: games.length, owners: owners.length, tags: tags.length, plays: res.plays, scoresheets: res.scoresheets, tierlists: res.tierlists }
}
