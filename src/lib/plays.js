import { supabase } from './supabase'

// Parties jouées (table `plays`). Une partie = un jeu + une date + des joueurs
// avec leur score total (et le détail par catégorie) + le gagnant.

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

// Parties d'un jeu, plus récente d'abord. null si la table n'existe pas encore.
export async function fetchPlays(gameId) {
  const { data, error } = await supabase
    .from('plays')
    .select('id, played_at, players, winner, extensions')
    .eq('game_id', gameId)
    .order('played_at', { ascending: false })
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  return data ?? []
}

// Enregistre une partie. play = { players:[{name,total,scores}], winner, extensions }
export async function savePlay(gameId, play) {
  const row = { game_id: gameId, players: play.players, winner: play.winner || null, extensions: play.extensions || [] }
  const { data, error } = await supabase.from('plays').insert(row).select('id').single()
  if (error) throw error
  return data
}

export async function deletePlay(id) {
  const { error } = await supabase.from('plays').delete().eq('id', id)
  if (error) throw error
}

// Tous les noms de joueurs déjà utilisés (toutes parties confondues), triés,
// pour l'auto-complétion. [] si table absente.
export async function fetchPlayerNames() {
  const { data, error } = await supabase.from('plays').select('players')
  if (error) {
    if (tableMissing(error)) return []
    throw error
  }
  const set = new Set()
  ;(data ?? []).forEach((row) => {
    ;(row.players || []).forEach((p) => {
      const n = (p?.name || '').trim()
      if (n) set.add(n)
    })
  })
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Vainqueur(s) d'une partie = tou(te)s les joueurs au score le plus élevé
// (gère les égalités : plusieurs vainqueurs possibles).
export function winnersOf(players) {
  const list = players || []
  if (!list.length) return []
  const max = Math.max(...list.map((p) => Number(p?.total) || 0))
  return list.filter((p) => (Number(p?.total) || 0) === max).map((p) => (p?.name || '').trim()).filter(Boolean)
}

// Statistiques d'un jeu à partir de ses parties.
export function computePlayStats(plays) {
  const list = plays || []
  const games = {} // nom → nb de parties jouées
  const wins = {} // nom → nb de victoires
  const scores = [] // toutes les valeurs de score total
  list.forEach((p) => {
    ;(p.players || []).forEach((pl) => {
      const n = (pl?.name || '').trim() || '—'
      games[n] = (games[n] || 0) + 1
      const t = Number(pl?.total)
      if (Number.isFinite(t)) scores.push(t)
    })
    // Égalité en tête → chaque vainqueur compte une victoire.
    winnersOf(p.players).forEach((w) => {
      wins[w] = (wins[w] || 0) + 1
    })
  })
  const names = [...new Set([...Object.keys(games), ...Object.keys(wins)])]
  const byPlayer = names
    .map((name) => ({ name, games: games[name] || 0, wins: wins[name] || 0 }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'fr'))
  return {
    total: list.length,
    byPlayer,
    scores,
    maxScore: scores.length ? Math.max(...scores) : 0,
    avgScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
  }
}
