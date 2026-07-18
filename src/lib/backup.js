import { supabase } from './supabase'
import { fetchAllPlays } from './plays'
import { fetchAllScoresheets } from './scoresheets'

// Sauvegarde / restauration de TOUTES les données (fichier JSON ou table `backups`).
// Contenu d'une sauvegarde : jeux + propriétaires + tags + PARTIES + FICHES DE SCORE.
// Import = on ré-insère ce contenu (mise à jour de l'existant par identifiant, ajout du
// reste), pour restaurer après une fausse manœuvre ou déménager vers une autre base.

// ⚠️ Ces listes de colonnes sont écrites À LA MAIN : toute nouvelle colonne ajoutée en
// base doit être ajoutée ici, sinon elle sera silencieusement absente des sauvegardes.
const GAME_COLS = [
  'id', 'bgg_id', 'name', 'players', 'players_min', 'players_max', 'players_best',
  'duration_min', 'duration_max', 'complexity', 'price', 'image_url', 'owner', 'tags', 'status', 'extensions', 'created_at',
]
const PLAY_COLS = [
  'id', 'game_id', 'played_at', 'players', 'winner', 'extensions',
  'outcome', 'scenario', 'score', 'notes', 'trigger', 'created_at',
]
const SHEET_COLS = ['id', 'game_id', 'template', 'updated_at']

function pick(obj, cols) {
  const out = {}
  cols.forEach((c) => {
    if (obj[c] !== undefined) out[c] = obj[c]
  })
  return out
}

// Une bulle gérée (propriétaire ou tag) → objet minimal à sauvegarder.
function pickBubble(o) {
  return { name: o.name, initials: o.initials ?? null, color: o.color ?? null }
}

// Construit l'objet de sauvegarde. `plays` et `scoresheets` viennent de la base
// (ils ne sont pas tous chargés dans l'app) → voir collectSnapshot ci-dessous.
// version 2 = contient les parties et les fiches ; version 1 = anciennes sauvegardes.
export function buildBackup(games, owners, tags, plays, scoresheets, exportedAt) {
  return {
    app: 'kalyx',
    version: 2,
    exportedAt: exportedAt || null,
    games: (games ?? []).map((g) => pick(g, GAME_COLS)),
    owners: (owners ?? []).map(pickBubble),
    tags: (tags ?? []).map(pickBubble),
    plays: (plays ?? []).map((p) => pick(p, PLAY_COLS)),
    scoresheets: (scoresheets ?? []).map((s) => pick(s, SHEET_COLS)),
  }
}

// Instantané COMPLET : on relit les parties et les fiches en base (l'app n'en garde
// qu'une partie en mémoire), puis on assemble la sauvegarde.
export async function collectSnapshot(games, owners, tags, exportedAt) {
  const [plays, scoresheets] = await Promise.all([fetchAllPlays(), fetchAllScoresheets()])
  return buildBackup(games, owners, tags, plays, scoresheets, exportedAt)
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
  return { games: data.games.length, plays: data.plays.length, sheets: data.scoresheets.length }
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
  return { games, owners, tags, plays, scoresheets }
}

// Insère/écrase une liste de bulles gérées (propriétaires ou tags) par nom.
// Si la table n'existe pas (migration non lancée), on ignore silencieusement.
async function upsertBubbles(table, list) {
  if (!list || !list.length) return
  const rows = list.map((o) => ({
    name: String(o.name).trim(),
    initials: o.initials ?? null,
    color: o.color ?? null,
  }))
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'name' })
  if (error && !/does not exist|schema cache|relation/i.test(error.message || '')) throw error
}

// Ré-insère des lignes par identifiant, en ignorant la table si elle n'existe pas encore.
async function upsertRows(table, rows, conflictCol) {
  if (!rows || !rows.length) return 0
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCol })
  if (error) {
    if (tableMissing(error)) return 0
    throw error
  }
  return rows.length
}

// Applique une sauvegarde : propriétaires + tags (par nom), puis les jeux (par
// identifiant), puis les parties et les fiches — DANS CET ORDRE : parties et fiches
// pointent vers un jeu, celui-ci doit donc exister d'abord.
export async function importBackup({ games, owners, tags, plays, scoresheets }) {
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
  // Repli si la colonne "tags" n'existe pas encore (migration non lancée).
  let { error } = await supabase.from('games').upsert(rows, { onConflict: 'id' })
  if (error && /\btags\b/i.test(error.message || '')) {
    rows.forEach((r) => delete r.tags)
    ;({ error } = await supabase.from('games').upsert(rows, { onConflict: 'id' }))
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

  return {
    games: rows.length,
    owners: (owners && owners.length) || 0,
    tags: (tags && tags.length) || 0,
    plays: nPlays,
    scoresheets: nSheets,
  }
}

// ============================================================
//  Sauvegardes automatiques stockées dans Supabase (table `backups`)
//  → rechargeables depuis n'importe quel appareil, rotation des N plus récentes.
// ============================================================

const BACKUP_KEEP = 3 // nombre de sauvegardes conservées (rotation)

// Délai minimal entre 2 sauvegardes AUTO, selon la fréquence choisie.
const FREQ_MS = {
  always: 2 * 60 * 1000, // à chaque ouverture (min 2 min pour éviter les doublons d'une même session)
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

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
  const { error } = await supabase.from('backups').insert(row)
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
    await supabase.from('backups').delete().in('id', toDelete)
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
  await createBackup(games, owners, tags, 'auto')
  return true
}

// Supprime dans `table` les lignes dont la clé (keyCol) n'est pas dans `keep` (Set).
async function deleteExtra(table, keyCol, keep) {
  const { data, error } = await supabase.from(table).select(keyCol)
  if (error) {
    if (tableMissing(error)) return
    throw error
  }
  const toDelete = (data ?? []).map((r) => r[keyCol]).filter((v) => v != null && !keep.has(v))
  if (toDelete.length) {
    const { error: delErr } = await supabase.from(table).delete().in(keyCol, toDelete)
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
  if (!doomed.length) return { games: 0, plays: 0, sheets: 0, names: [] }
  const ids = doomed.map((g) => g.id)
  const [{ data: pl }, { data: sh }] = await Promise.all([
    supabase.from('plays').select('id').in('game_id', ids),
    supabase.from('scoresheets').select('id').in('game_id', ids),
  ])
  return {
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

  // 1) ré-insère / met à jour tout ce qui est dans la sauvegarde (jeux d'abord)
  const res = await importBackup({ games, owners, tags, plays, scoresheets })
  // 2) supprime les jeux / propriétaires / tags absents de la sauvegarde (retour arrière)
  await deleteExtra('games', 'id', new Set(games.map((g) => g.id).filter(Boolean)))
  await deleteExtra('owners', 'name', new Set(owners.map((o) => o.name)))
  await deleteExtra('tags', 'name', new Set(tags.map((t) => t.name)))

  return { games: games.length, owners: owners.length, tags: tags.length, plays: res.plays, scoresheets: res.scoresheets }
}
