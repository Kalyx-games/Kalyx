import { supabase } from './supabase'

// Toutes les fonctions qui parlent à la table "games" de Supabase.
// Chacune lève une erreur en cas de problème (gérée plus haut dans l'app).

// Lire tous les jeux, triés par nom.
export async function fetchGames() {
  const { data, error } = await supabase.from('games').select('*').order('name')
  if (error) throw error
  return data ?? []
}

// Colonnes optionnelles qui peuvent manquer si une migration n'a pas été lancée.
// Si l'insert/update échoue à cause d'une de ces colonnes, on la retire et on réessaie
// → le reste du jeu s'enregistre quand même (rien ne casse avant la migration).
const OPTIONAL_COLS = ['tags', 'extensions']
function missingOptionalCol(error, payload) {
  if (!error) return null
  return OPTIONAL_COLS.find((c) => payload[c] !== undefined && new RegExp(`\\b${c}\\b`, 'i').test(error.message || ''))
}

// Ajouter un jeu. Renvoie le jeu créé (avec son id).
export async function addGame(game) {
  const payload = { ...game }
  let { data, error } = await supabase.from('games').insert(payload).select().single()
  let col
  while ((col = missingOptionalCol(error, payload))) {
    delete payload[col]
    ;({ data, error } = await supabase.from('games').insert(payload).select().single())
  }
  if (error) throw error
  return data
}

// Modifier un jeu existant. Renvoie le jeu mis à jour.
export async function updateGame(id, changes) {
  const payload = { ...changes }
  let { data, error } = await supabase.from('games').update(payload).eq('id', id).select().single()
  let col
  while ((col = missingOptionalCol(error, payload))) {
    delete payload[col]
    ;({ data, error } = await supabase.from('games').update(payload).eq('id', id).select().single())
  }
  if (error) throw error
  return data
}

// Supprimer un jeu.
export async function deleteGame(id) {
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) throw error
}

// Nettoie les données du formulaire avant envoi :
// - chaînes vides → null (pour les champs optionnels)
// - nombres convertis depuis le texte des champs
export function cleanGameInput(form) {
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  const txt = (v) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }
  return {
    name: (form.name ?? '').trim(),
    owner: (form.owner ?? '').trim(),
    status: form.status === 'wishlist' ? 'wishlist' : 'collection',
    players: txt(form.players), // texte groupé : "2-4" ou "3-5, 7-8, 10-12+"
    players_min: num(form.players_min), // min gardé (compat / tri)
    players_max: num(form.players_max), // max gardé (compat / tri)
    players_best: txt(form.players_best), // texte groupé : "3-4" ou "2, 5"
    duration_min: num(form.duration_min),
    duration_max: num(form.duration_max),
    complexity: num(form.complexity),
    price: num(form.price),
    image_url: txt(form.image_url),
    bgg_id: num(form.bgg_id),
    extensions: txt(form.extensions), // liste d'extensions (une par ligne)
    tags: txt(form.tags), // tags (noms séparés par des virgules, comme owner)
  }
}

// Le "nombre de joueurs idéal" est stocké en texte pour accepter aussi bien
// une valeur unique ("3"), une plage ("2-4") que des valeurs séparées ("2, 4").

// --- Outils pour les cases à cocher "nombre de joueurs" ---

// Une plage min–max devient la liste des nombres [min..max].
// Ex : (2, 4) -> [2, 3, 4]
export function expandRange(min, max) {
  const a = Number(min) || 0
  const b = Number(max) || 0
  if (!a && !b) return []
  const lo = Math.min(a || b, b || a)
  const hi = Math.max(a || b, b || a)
  const out = []
  for (let i = lo; i <= hi; i++) out.push(i)
  return out
}

// Un texte ("2", "2-4", "2, 4", "12+") devient une liste de nombres triés uniques.
export function parseCounts(text) {
  if (text === null || text === undefined || text === '') return []
  const set = new Set()
  String(text).split(/[,\s]+/).forEach((raw) => {
    const part = raw.replace('+', '')
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) return
    const lo = Number(m[1])
    const hi = m[2] ? Number(m[2]) : lo
    for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) set.add(i)
  })
  return [...set].sort((a, b) => a - b)
}

// Une liste de nombres devient un texte compact où les nombres qui se suivent
// sont regroupés en plages. Le maximum (12) s'affiche "12+".
// Ex : [3,4,5,7,8,10,11,12] -> "3-5, 7-8, 10-12+"   ;   [12] -> "12+"
export function countsToText(arr, plusAt = 12) {
  const nums = [...new Set((arr || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
  if (nums.length === 0) return ''
  const label = (n) => (n >= plusAt ? `${plusAt}+` : String(n))
  const runs = []
  let start = nums[0]
  let prev = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === prev + 1) {
      prev = nums[i]
    } else {
      runs.push([start, prev])
      start = nums[i]
      prev = nums[i]
    }
  }
  runs.push([start, prev])
  return runs.map(([a, b]) => (a === b ? label(a) : `${a}-${label(b)}`)).join(', ')
}

// --- Extensions ---
// Une extension a un nom et, facultativement, un nombre de joueurs ET un nombre de
// joueurs idéal qu'elle AJOUTE (textes groupés, ex. "5-6"). Le jeu de base garde ses
// données ; posséder une extension ne fait qu'ÉLARGIR ces deux plages "effectives".
// Stockage dans la colonne texte `extensions` :
//   - JSON [{name, players, best}] dès qu'une extension précise des joueurs/idéal ;
//   - sinon simple liste de noms (une par ligne) — ancien format, toujours accepté.

export function parseExtensions(raw) {
  const t = (raw ?? '').trim()
  if (!t) return []
  if (t[0] === '[') {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr)) {
        return arr
          .map((e) => ({
            name: String(e?.name ?? '').trim(),
            players: String(e?.players ?? '').trim(),
            best: String(e?.best ?? '').trim(),
          }))
          .filter((e) => e.name)
      }
    } catch {
      /* pas du JSON valide → on retombe sur l'ancien format ci-dessous */
    }
  }
  return t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, players: '', best: '' }))
}

// Liste d'extensions -> texte à stocker. Trié par nom (fr), nombres normalisés.
// Si aucune extension n'ajoute de joueurs/idéal, on garde le format lisible (1/ligne).
export function serializeExtensions(list) {
  const clean = (list || [])
    .map((e) => ({
      name: String(e?.name ?? '').trim(),
      players: countsToText(parseCounts(e?.players)), // "6, 5" -> "5-6" ; vide si illisible
      best: countsToText(parseCounts(e?.best)),
    }))
    .filter((e) => e.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  if (clean.length === 0) return ''
  if (clean.every((e) => !e.players && !e.best)) return clean.map((e) => e.name).join('\n')
  return JSON.stringify(clean)
}

// Juste les noms d'extensions (pour l'affichage et la recherche).
export function extensionNames(raw) {
  return parseExtensions(raw).map((e) => e.name)
}

// Ensemble des nombres de joueurs jouables avec le jeu SEUL (base).
export function basePlayersSet(g) {
  return g.players ? parseCounts(g.players) : expandRange(g.players_min, g.players_max)
}

// Ensemble EFFECTIF joueurs = base ∪ joueurs ajoutés par chaque extension possédée.
export function effectivePlayersSet(g) {
  const set = new Set(basePlayersSet(g))
  parseExtensions(g.extensions).forEach((e) => parseCounts(e.players).forEach((n) => set.add(n)))
  return [...set].sort((a, b) => a - b)
}

// Nombres de joueurs idéaux du jeu SEUL (base).
export function baseBestSet(g) {
  return parseCounts(g.players_best)
}

// Ensemble EFFECTIF idéal = base ∪ idéal ajouté par chaque extension possédée.
export function effectiveBestSet(g) {
  const set = new Set(baseBestSet(g))
  parseExtensions(g.extensions).forEach((e) => parseCounts(e.best).forEach((n) => set.add(n)))
  return [...set].sort((a, b) => a - b)
}

// --- Propriétaires (un jeu peut en avoir plusieurs) ---
// Le champ "owner" stocke les noms séparés par des virgules : "Alex, Bob".

// Texte "Alex, Bob" -> ["Alex", "Bob"] (sans doublon, sans vide).
export function parseOwners(text) {
  if (!text) return []
  return [...new Set(String(text).split(',').map((s) => s.trim()).filter(Boolean))]
}

// Liste ["Alex", "Bob"] -> texte "Alex, Bob".
export function ownersToText(arr) {
  return [...new Set((arr || []).map((s) => s.trim()).filter(Boolean))].join(', ')
}

// Les tags utilisent exactement le même format que les propriétaires (CSV de noms).
export const parseTags = parseOwners
export const tagsToText = ownersToText

// Bulle propriétaire : 2 lettres + une couleur propre à chaque propriétaire.
const OWNER_COLORS = [
  '#ef4444', '#f59e0b', '#16a34a', '#2f6df6', '#8b5cf6', '#ec4899',
  '#0d9488', '#f97316', '#6366f1', '#65a30d', '#0ea5e9', '#d946ef',
]
// Hachage FNV-1a (bonne répartition) → une couleur stable par propriétaire.
export function ownerColor(name) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return OWNER_COLORS[(h >>> 0) % OWNER_COLORS.length]
}
export function ownerInitials(name) {
  return name.trim().slice(0, 2).toUpperCase()
}

// Initiales + couleur à afficher pour un propriétaire : celles définies dans les
// Réglages (ownerMap : nom -> ligne owners) si présentes, sinon calculées.
export function ownerDisplay(name, ownerMap) {
  const o = ownerMap && ownerMap[name]
  return {
    initials: (o && o.initials) || ownerInitials(name),
    color: (o && o.color) || ownerColor(name),
  }
}
