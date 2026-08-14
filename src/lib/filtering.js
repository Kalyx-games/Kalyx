// Filtres partagés entre la liste Collection/Wishlist, l'onglet Stats et les Tierlists,
// pour que tout réagisse aux MÊMES filtres (extrait de App.jsx pour être réutilisable).
import { parseOwners, parseTags, effectivePlayersSet, effectiveBestSet, extensionNames } from './games'

export const PRICE_MIN = 0
export const PRICE_MAX = 150

export const EMPTY_FILTERS = {
  owners: [],
  tags: [], // tags cochés
  tagsOnly: false, // si vrai : n'afficher que les jeux ayant l'un des tags cochés
  players: [], // cases cochées (nombres de joueurs), vide = pas de filtre
  playerOptimal: false,
  duration: null, // seuil "moins de X min" choisi (15|30|60) ou null
  priceRange: [PRICE_MIN, PRICE_MAX],
  complexity: [],
}

// Bucket de complexité d'un jeu (pour le filtre).
export function complexityBucket(c) {
  if (c == null) return null
  const n = Number(c)
  return n < 2 ? 'simple' : n < 3 ? 'moyen' : 'complexe'
}

// Enlève les accents et met en minuscules, pour une recherche tolérante.
// (̀-ͯ = les marques d'accent que NFD sépare des lettres)
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
export const norm = (s) => (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase()

// Un jeu passe-t-il la recherche + les filtres ?
// `includePrice` : n'applique le filtre prix que dans la Wishlist (sans objet ailleurs).
export function passesFilters(g, filters, q, includePrice, applyTags = true) {
  // Recherche : nom OU noms d'extensions.
  if (q && !(norm(g.name).includes(q) || norm(extensionNames(g.extensions).join(' ')).includes(q))) return false

  // Propriétaire (les jeux sans propriétaire restent toujours visibles).
  if (filters.owners.length) {
    const os = parseOwners(g.owner)
    if (!(os.length === 0 || os.some((o) => filters.owners.includes(o)))) return false
  }

  // Tags : masqués par défaut. Ignoré en wishlist (les jeux à acheter n'ont pas de tag).
  if (applyTags) {
    if (filters.tagsOnly && filters.tags.length) {
      if (!parseTags(g.tags).some((t) => filters.tags.includes(t))) return false
    } else {
      const ts = parseTags(g.tags)
      if (!(ts.length === 0 || ts.some((t) => filters.tags.includes(t)))) return false
    }
  }

  // Pour chaque filtre : un jeu SANS valeur dans ce champ reste TOUJOURS affiché.
  if (filters.players.length) {
    const set = filters.playerOptimal ? effectiveBestSet(g) : effectivePlayersSet(g)
    if (!(set.length === 0 || set.some((v) => filters.players.includes(v)))) return false
  }
  if (filters.duration != null) {
    const dur = g.duration_max ?? g.duration_min
    if (!(dur == null || dur <= filters.duration)) return false
  }
  if (filters.complexity.length) {
    const b = complexityBucket(g.complexity)
    if (!(b == null || filters.complexity.includes(b))) return false
  }
  if (includePrice) {
    const [prlo, prhi] = filters.priceRange
    if (prlo !== PRICE_MIN || prhi !== PRICE_MAX) {
      const hiCap = prhi >= PRICE_MAX ? Infinity : prhi
      if (!(g.price == null || (g.price >= prlo && g.price <= hiCap))) return false
    }
  }
  return true
}
