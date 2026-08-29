// Filtres partagés entre la liste Collection/Wishlist, l'onglet Stats et les Tierlists,
// pour que tout réagisse aux MÊMES filtres (extrait de App.jsx pour être réutilisable).
import { parseOwners, effectivePlayersSet, effectiveBestSet, extensionNames } from './games'
import { tagsPourCompte } from './tagsJeux'

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
// ⚠️ Ensemble VIDE au niveau du module : ne pas allouer un Set neuf à chaque appel (cette
// fonction tourne sur toute la collection à chaque frappe).
const AUCUN_TAG_VISIBLE = new Set()

export function passesFilters(g, filters, q, includePrice, applyTags = true, compte = null,
                              tagsVisibles = AUCUN_TAG_VISIBLE) {
  // Recherche : nom OU noms d'extensions.
  if (q && !(norm(g.name).includes(q) || norm(extensionNames(g.extensions).join(' ')).includes(q))) return false

  // Propriétaire (les jeux sans propriétaire restent toujours visibles).
  if (filters.owners.length) {
    const os = parseOwners(g.owner)
    if (!(os.length === 0 || os.some((o) => filters.owners.includes(o)))) return false
  }

  // Tags : masqués par défaut. Ignoré en wishlist (les jeux à acheter n'ont pas de tag).
  // ⚠️ Les tags sont PAR COMPTE, et c'est la moitié cachée du problème : un jeu tagué est
  // MASQUÉ par défaut. Avant, le « Grenier » posé par un foyer faisait donc disparaître le jeu
  // de la collection de l'autre — et faussait ses statistiques — sans un mot d'explication.
  // ⚠️ Le périmètre suit le COMPTE (qui l'on est), jamais `filters.owners` (ce que l'on
  // regarde) : même règle que les anecdotes. Sinon le sens d'un tag changerait au gré d'un
  // réglage sans rapport.
  if (applyTags) {
    const ts = tagsPourCompte(g.tags, compte)
    if (filters.tagsOnly && filters.tags.length) {
      if (!ts.some((t) => filters.tags.includes(t))) return false
    } else {
      // Seuls les tags qui MASQUENT retirent le jeu : un jeu qui ne porte que des tags
      // réglés « toujours visibles » reste affiché. Le RETOUR ne change pas — cocher
      // n'importe lequel de ses tags le ramène, exactement comme avant.
      // ⚠️ Un tag ABSENT de `tagsVisibles` masque : ligne supprimée, table absente, migration
      // non lancée, argument oublié → on retombe sur le comportement d'avant. Repli sûr.
      const masquants = ts.filter((t) => !tagsVisibles.has(t))
      if (masquants.length && !ts.some((t) => filters.tags.includes(t))) return false
    }
  }

  // Pour chaque filtre : un jeu SANS valeur dans ce champ reste TOUJOURS affiché.
  if (filters.players.length) {
    const set = filters.playerOptimal ? effectiveBestSet(g) : effectivePlayersSet(g)
    // La case « 12 » du picker vaut « 12+ » : on plafonne à 12 pour matcher les jeux
    // jouables uniquement au-delà (ex. 13-15), comme le fait déjà le graphe des Stats.
    if (!(set.length === 0 || set.some((v) => filters.players.includes(Math.min(v, 12))))) return false
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
