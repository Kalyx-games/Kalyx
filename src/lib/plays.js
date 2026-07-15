import { supabase } from './supabase'

// Parties jouées (table `plays`). Une partie = un jeu + une date + des joueurs
// avec leur score total (et le détail par catégorie) + le gagnant.

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

// Colonnes ajoutées pour les jeux coopératifs (migration `migration_plays_coop.sql`).
// Si elles manquent encore, on retombe sur les colonnes de base.
const missingCol = (error) => /column .* does not exist|schema cache|could not find/i.test(error?.message || '')

// Parties d'un jeu, plus récente d'abord. null si la table n'existe pas encore.
// Dégradation en cascade selon les colonnes présentes (notes → coop → base).
export async function fetchPlays(gameId) {
  const run = (cols) =>
    supabase.from('plays').select(cols).eq('game_id', gameId).order('played_at', { ascending: false })
  let { data, error } = await run('id, played_at, players, winner, extensions, outcome, scenario, score, notes')
  if (error && missingCol(error)) ({ data, error } = await run('id, played_at, players, winner, extensions, outcome, scenario, score'))
  if (error && missingCol(error)) ({ data, error } = await run('id, played_at, players, winner, extensions'))
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  return data ?? []
}

// Construit les 3 niveaux de colonnes d'une partie (pour la dégradation en cascade).
function playRows(play) {
  const base = { players: play.players, winner: play.winner || null, extensions: play.extensions || [] }
  const withCoop = { ...base, outcome: play.outcome || null, scenario: play.scenario || null, score: play.score ?? null }
  const full = { ...withCoop, notes: play.notes || null }
  return [full, withCoop, base]
}

// Enregistre une partie (INSERT).
//  Compétitif : play = { players:[{name,total,scores}], winner, extensions, notes }
//  Coopératif : play = { players:[{name}], outcome:'win'|'loss', scenario, score, extensions, notes }
export async function savePlay(gameId, play) {
  const [full, withCoop, base] = playRows(play).map((r) => ({ ...r, game_id: gameId }))
  let { data, error } = await supabase.from('plays').insert(full).select('id').single()
  if (error && missingCol(error)) ({ data, error } = await supabase.from('plays').insert(withCoop).select('id').single())
  if (error && missingCol(error)) ({ data, error } = await supabase.from('plays').insert(base).select('id').single())
  if (error) throw error
  return data
}

// Met à jour une partie existante (édition). Même dégradation en cascade.
export async function updatePlay(id, play) {
  const [full, withCoop, base] = playRows(play)
  const upd = (row) => supabase.from('plays').update(row).eq('id', id)
  let { error } = await upd(full)
  if (error && missingCol(error)) ({ error } = await upd(withCoop))
  if (error && missingCol(error)) ({ error } = await upd(base))
  if (error) throw error
}

export async function deletePlay(id) {
  const { error } = await supabase.from('plays').delete().eq('id', id)
  if (error) throw error
}

// Nombre de parties enregistrées par jeu → { game_id: nb }. {} si table absente.
// Sert au tri « par nombre de parties jouées ».
export async function fetchPlayCounts() {
  const { data, error } = await supabase.from('plays').select('game_id')
  if (error) {
    if (tableMissing(error)) return {}
    throw error
  }
  const counts = {}
  ;(data ?? []).forEach((row) => {
    if (row.game_id) counts[row.game_id] = (counts[row.game_id] || 0) + 1
  })
  return counts
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
  const playerScores = {} // nom → [scores perso] (individuel OU score de son équipe)
  const scores = [] // valeurs de score agrégées (par joueur en compétitif, du groupe en coop)
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
      // on ne le compte qu'une fois par équipe pour l'agrégat.
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
      const t = Number(pl?.total)
      if (Number.isFinite(t) && pl?.total !== undefined && pl?.total !== null) {
        if (!coop && !isTeam) scores.push(t)
        ;(playerScores[n] || (playerScores[n] = [])).push(t) // score perso (inclut les membres d'équipe)
      }
    })
    // Vainqueur(s) → chacun compte une victoire (gère l'égalité, le coop, les équipes).
    playWinners(p).forEach((w) => {
      wins[w] = (wins[w] || 0) + 1
    })
  })
  // Taux de victoire par scénario (jeux coopératifs avec scénario/niveau).
  const scen = {}
  list.forEach((p) => {
    if (p.outcome && p.scenario) {
      const s = (p.scenario || '').trim()
      if (!s) return
      const e = scen[s] || (scen[s] = { games: 0, wins: 0 })
      e.games += 1
      if (p.outcome === 'win') e.wins += 1
    }
  })
  const byScenario = Object.entries(scen)
    .map(([scenario, v]) => ({ scenario, games: v.games, wins: v.wins, winRate: Math.round((v.wins / v.games) * 100) }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.scenario.localeCompare(b.scenario, 'fr'))

  const ext = (arr) => (scoring === 'low' ? Math.min(...arr) : Math.max(...arr)) // « meilleur » selon le sens
  const worst = (arr) => (scoring === 'low' ? Math.max(...arr) : Math.min(...arr))
  const names = [...new Set([...Object.keys(games), ...Object.keys(wins)])]
  const byPlayer = names
    .map((name) => {
      const g = games[name] || 0
      const w = wins[name] || 0
      const ss = playerScores[name] || []
      return {
        name,
        games: g,
        wins: w,
        winRate: g ? Math.round((w / g) * 100) : 0,
        avg: ss.length ? Math.round(ss.reduce((s, v) => s + v, 0) / ss.length) : null,
        best: ss.length ? ext(ss) : null,
        worst: ss.length ? worst(ss) : null,
      }
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, 'fr'))
  const bestScore = scores.length ? ext(scores) : 0
  return {
    total: list.length,
    byPlayer,
    byScenario,
    scores,
    hasScores: Object.keys(playerScores).length > 0, // au moins un score perso enregistré
    coopWins,
    coopTotal,
    winRate: coopTotal ? Math.round((coopWins / coopTotal) * 100) : null,
    maxScore: bestScore,
    avgScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
  }
}
