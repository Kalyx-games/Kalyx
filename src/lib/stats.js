import { parseCounts, expandRange, parseOwners, ownerDisplay } from './games'

// Calcule toutes les statistiques affichées dans l'onglet Stats.
// Les répartitions portent sur la COLLECTION (jeux possédés) ; la wishlist
// n'est comptée que comme un total à part.

// Ensemble des nombres de joueurs supportés par un jeu (texte groupé sinon min/max).
function playersSetOf(g) {
  const fromText = parseCounts(g.players)
  if (fromText.length) return fromText
  return expandRange(g.players_min, g.players_max)
}

// Durée représentative d'un jeu : la borne haute (sinon la borne basse).
function durationOf(g) {
  const hi = Number(g.duration_max) || 0
  const lo = Number(g.duration_min) || 0
  return hi || lo || null
}

const PLAYER_MAX = 12 // 12 = "12+"

const DURATION_BUCKETS = [
  { label: '≤ 30 min', test: (d) => d <= 30 },
  { label: '31–60 min', test: (d) => d > 30 && d <= 60 },
  { label: '61–90 min', test: (d) => d > 60 && d <= 90 },
  { label: '+ de 90 min', test: (d) => d > 90 },
]

const COMPLEXITY_BUCKETS = [
  { label: 'Simple', hint: '< 2', test: (c) => c < 2 },
  { label: 'Moyen', hint: '2 à 3', test: (c) => c >= 2 && c < 3 },
  { label: 'Corsé', hint: '≥ 3', test: (c) => c >= 3 },
]

// Répartition d'un ensemble de jeux par nombre de joueurs supportés (setOf =
// playersSetOf pour "joueurs", ou parseCounts(players_best) pour "idéal").
function playerDistribution(games, setOf) {
  const rows = Array.from({ length: PLAYER_MAX - 1 }, (_, i) => {
    const n = i + 2
    return { n, label: n >= PLAYER_MAX ? `${PLAYER_MAX}+` : String(n), count: 0 }
  })
  games.forEach((g) => {
    const set = new Set(setOf(g).map((n) => Math.min(n, PLAYER_MAX)))
    set.forEach((n) => {
      const row = rows.find((r) => r.n === n)
      if (row) row.count++
    })
  })
  // On enlève les grands nombres de joueurs vides en fin de liste (garde compact).
  let end = rows.length
  while (end > 1 && rows[end - 1].count === 0) end--
  return rows.slice(0, end)
}

// Moyenne (arrondie via round) et médiane d'une liste de nombres.
function mean(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// `games` est déjà filtré en amont (mêmes filtres que la vue Collection).
// On sépare simplement collection (jeux possédés) et wishlist.
export function computeStats(games, ownerMap) {
  const all = games || []
  const collection = all.filter((g) => g.status !== 'wishlist')
  const wishlist = all.filter((g) => g.status === 'wishlist')

  // Moyennes & médianes (sur les jeux de la collection qui ont la donnée).
  const durations = collection.map(durationOf).filter((d) => d != null)
  const complexities = collection.map((g) => Number(g.complexity)).filter((c) => c > 0)
  const avgDuration = durations.length ? Math.round(mean(durations)) : null
  const medDuration = durations.length ? Math.round(median(durations)) : null
  const avgComplexity = mean(complexities)
  const medComplexity = median(complexities)

  // Par propriétaire (un jeu multi-propriétaires compte pour chacun).
  const ownerCounts = {}
  collection.forEach((g) =>
    parseOwners(g.owner).forEach((o) => {
      ownerCounts[o] = (ownerCounts[o] || 0) + 1
    })
  )
  const byOwner = Object.entries(ownerCounts)
    .map(([name, count]) => ({ name, count, ...ownerDisplay(name, ownerMap) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))

  // Par nombre de joueurs (combien de jeux jouables à N) et par nombre idéal.
  const byPlayers = playerDistribution(collection, playersSetOf)
  const byOptimalPlayers = playerDistribution(collection, (g) => parseCounts(g.players_best))

  // Par durée.
  const byDuration = DURATION_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  collection.forEach((g) => {
    const d = durationOf(g)
    if (d == null) return
    const idx = DURATION_BUCKETS.findIndex((b) => b.test(d))
    if (idx >= 0) byDuration[idx].count++
  })

  // Par complexité.
  const byComplexity = COMPLEXITY_BUCKETS.map((b) => ({ label: b.label, hint: b.hint, count: 0 }))
  collection.forEach((g) => {
    const c = Number(g.complexity)
    if (!(c > 0)) return
    const idx = COMPLEXITY_BUCKETS.findIndex((b) => b.test(c))
    if (idx >= 0) byComplexity[idx].count++
  })

  return {
    total: collection.length,
    wishlistCount: wishlist.length,
    ownersCount: byOwner.length,
    avgDuration,
    medDuration,
    avgComplexity,
    medComplexity,
    byOwner,
    byPlayers,
    byOptimalPlayers,
    byDuration,
    byComplexity,
  }
}
