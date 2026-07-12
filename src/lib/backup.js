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
