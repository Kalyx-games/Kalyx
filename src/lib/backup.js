import { supabase } from './supabase'

// Sauvegarde / restauration de la collection (fichier JSON).
// Export = un fichier téléchargé contenant tous les jeux + propriétaires.
// Import = on ré-insère ce fichier (mise à jour des jeux existants par identifiant,
// ajout des nouveaux), pour restaurer ou transférer une collection.

// Colonnes connues d'un jeu (on ignore le reste à l'import, par sécurité).
const GAME_COLS = [
  'id', 'bgg_id', 'name', 'players', 'players_min', 'players_max', 'players_best',
  'duration_min', 'duration_max', 'complexity', 'price', 'image_url', 'owner', 'tags', 'status', 'extensions', 'created_at',
]

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

// Construit l'objet de sauvegarde à partir de l'état chargé dans l'app.
export function buildBackup(games, owners, tags, exportedAt) {
  return {
    app: 'kalyx',
    version: 1,
    exportedAt: exportedAt || null,
    games: (games ?? []).map((g) => pick(g, GAME_COLS)),
    owners: (owners ?? []).map(pickBubble),
    tags: (tags ?? []).map(pickBubble),
  }
}

// Déclenche le téléchargement du fichier de sauvegarde. Renvoie le nb de jeux.
export function downloadBackup(games, owners, tags, dateStr) {
  const data = buildBackup(games, owners, tags, dateStr)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kalyx-sauvegarde-${dateStr || 'export'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return data.games.length
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
  return { games, owners, tags }
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

// Applique une sauvegarde : propriétaires + tags (par nom) puis jeux (par identifiant).
export async function importBackup({ games, owners, tags }) {
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

  return { games: rows.length, owners: (owners && owners.length) || 0, tags: (tags && tags.length) || 0 }
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
  const snapshot = buildBackup(games, owners, tags, new Date().toISOString())
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
  // Rotation : supprime les sauvegardes au-delà des BACKUP_KEEP plus récentes.
  const { data: all } = await supabase.from('backups').select('id').order('created_at', { ascending: false })
  if (all && all.length > BACKUP_KEEP) {
    const toDelete = all.slice(BACKUP_KEEP).map((b) => b.id)
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

// Restaure une sauvegarde : remet EXACTEMENT son état (ré-insère/écrase + supprime le surplus).
export async function restoreBackup(backupId) {
  const { data: row, error } = await supabase.from('backups').select('data').eq('id', backupId).single()
  if (error) throw error
  const snap = row?.data || {}
  const games = Array.isArray(snap.games) ? snap.games : []
  const owners = Array.isArray(snap.owners) ? snap.owners : []
  const tags = Array.isArray(snap.tags) ? snap.tags : []

  // 1) ré-insère / met à jour tout ce qui est dans la sauvegarde
  await importBackup({ games, owners, tags })
  // 2) supprime ce qui n'existe PAS dans la sauvegarde (vrai retour arrière)
  await deleteExtra('games', 'id', new Set(games.map((g) => g.id).filter(Boolean)))
  await deleteExtra('owners', 'name', new Set(owners.map((o) => o.name)))
  await deleteExtra('tags', 'name', new Set(tags.map((t) => t.name)))

  return { games: games.length, owners: owners.length, tags: tags.length }
}
