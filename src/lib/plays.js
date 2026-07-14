import { supabase } from './supabase'

// Parties jouées (table `plays`). Une partie = un jeu + une date + des joueurs
// avec leur score total (et le détail par catégorie) + le gagnant.

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

// Colonnes ajoutées pour les jeux coopératifs (migration `migration_plays_coop.sql`).
// Si elles manquent encore, on retombe sur les colonnes de base.
const missingCol = (error) => /column .* does not exist|schema cache|could not find/i.test(error?.message || '')

// Parties d'un jeu, plus récente d'abord. null si la table n'existe pas encore.
export async function fetchPlays(gameId) {
  const run = (cols) =>
    supabase.from('plays').select(cols).eq('game_id', gameId).order('played_at', { ascending: false })
  let { data, error } = await run('id, played_at, players, winner, extensions, outcome, scenario, score')
  if (error && missingCol(error)) ({ data, error } = await run('id, played_at, players, winner, extensions'))
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  return data ?? []
}

// Enregistre une partie.
//  Compétitif : play = { players:[{name,total,scores}], winner, extensions }
//  Coopératif : play = { players:[{name}], outcome:'win'|'loss', scenario, score, extensions }
export async function savePlay(gameId, play) {
  const base = { game_id: gameId, players: play.players, winner: play.winner || null, extensions: play.extensions || [] }
  const full = { ...base, outcome: play.outcome || null, scenario: play.scenario || null, score: play.score ?? null }
  let { data, error } = await supabase.from('plays').insert(full).select('id').single()
  if (error && missingCol(error)) ({ data, error } = await supabase.from('plays').insert(base).select('id').single())
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

// Vainqueur(s) d'une partie au score le plus élevé (gère les égalités).
export function winnersOf(players) {
  const list = players || []
  if (!list.length) return []
  const max = Math.max(...list.map((p) => Number(p?.total) || 0))
  return list.filter((p) => (Number(p?.total) || 0) === max).map((p) => (p?.name || '').trim()).filter(Boolean)
}

// Vainqueur(s) d'une partie, tous modes confondus.
//  • Coopératif : tout le groupe gagne (ou personne) selon le résultat.
//  • Sinon : on lit le(s) vainqueur(s) décidé(s) et enregistré(s) au moment de la
//    partie (champ `winner`, séparé par des virgules) ; à défaut, repli sur le
//    score le plus élevé (anciennes parties).
export function playWinners(play) {
  if (play?.outcome) {
    return play.outcome === 'win'
      ? (play.players || []).map((p) => (p?.name || '').trim()).filter(Boolean)
      : []
  }
  if (typeof play?.winner === 'string' && play.winner.trim()) {
    return play.winner.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return winnersOf(play?.players)
}

// Statistiques d'un jeu à partir de ses parties. `scoring` = 'high' | 'low' | 'none'
// pilote le « meilleur score » (max ou min).
export function computePlayStats(plays, scoring = 'high') {
  const list = plays || []
  const games = {} // nom → nb de parties jouées
  const wins = {} // nom → nb de victoires
  const scores = [] // valeurs de score (par joueur en compétitif, du groupe en coop)
  let coopWins = 0
  let coopTotal = 0
  list.forEach((p) => {
    const coop = !!p.outcome
    const isTeam = !coop && (p.players || []).some((pl) => pl && pl.team)
    if (coop) {
      coopTotal += 1
      if (p.outcome === 'win') coopWins += 1
      const s = Number(p.score)
      if (Number.isFinite(s)) scores.push(s)
    } else if (isTeam) {
      // En équipes : le score est celui de l'équipe (dupliqué sur chaque membre) →
      // on ne le compte qu'une fois par équipe.
      const seen = new Set()
      ;(p.players || []).forEach((pl) => {
        const t = pl?.team
        if (t && !seen.has(t)) {
          seen.add(t)
          const s = Number(pl?.total)
          if (Number.isFinite(s) && pl?.total !== undefined && pl?.total !== null) scores.push(s)
        }
      })
    }
    ;(p.players || []).forEach((pl) => {
      const n = (pl?.name || '').trim() || '—'
      games[n] = (games[n] || 0) + 1
      if (!coop && !isTeam) {
        const t = Number(pl?.total)
        if (Number.isFinite(t) && pl?.total !== undefined && pl?.total !== null) scores.push(t)
      }
    })
    // Vainqueur(s) → chacun compte une victoire (gère l'égalité, le coop, les équipes).
    playWinners(p).forEach((w) => {
      wins[w] = (wins[w] || 0) + 1
    })
  })
  const names = [...new Set([...Object.keys(games), ...Object.keys(wins)])]
  const byPlayer = names
    .map((name) => ({ name, games: games[name] || 0, wins: wins[name] || 0 }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'fr'))
  const bestScore = scores.length ? (scoring === 'low' ? Math.min(...scores) : Math.max(...scores)) : 0
  return {
    total: list.length,
    byPlayer,
    scores,
    coopWins,
    coopTotal,
    winRate: coopTotal ? Math.round((coopWins / coopTotal) * 100) : null,
    maxScore: bestScore,
    avgScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
  }
}
