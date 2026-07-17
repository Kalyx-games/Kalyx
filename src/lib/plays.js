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
  let { data, error } = await run('id, played_at, players, winner, extensions, outcome, scenario, score, notes, trigger')
  if (error && missingCol(error)) ({ data, error } = await run('id, played_at, players, winner, extensions, outcome, scenario, score, notes'))
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
  const withNotes = { ...withCoop, notes: play.notes || null }
  const full = { ...withNotes, trigger: play.trigger || null }
  return [full, withNotes, withCoop, base]
}

// Enregistre une partie (INSERT).
//  Compétitif : play = { players:[{name,total,scores}], winner, extensions, notes }
//  Coopératif : play = { players:[{name}], outcome:'win'|'loss', scenario, score, extensions, notes }
export async function savePlay(gameId, play) {
  const rows = playRows(play).map((r) => ({ ...r, game_id: gameId }))
  let res = await supabase.from('plays').insert(rows[0]).select('id').single()
  for (let i = 1; i < rows.length && res.error && missingCol(res.error); i++) {
    res = await supabase.from('plays').insert(rows[i]).select('id').single()
  }
  if (res.error) throw res.error
  return res.data
}

// Met à jour une partie existante (édition). Même dégradation en cascade.
export async function updatePlay(id, play) {
  const rows = playRows(play)
  const upd = (row) => supabase.from('plays').update(row).eq('id', id)
  let { error } = await upd(rows[0])
  for (let i = 1; i < rows.length && error && missingCol(error); i++) {
    ;({ error } = await upd(rows[i]))
  }
  if (error) throw error
}

// Renomme des catégories de score dans les parties DÉJÀ enregistrées d'un jeu.
// Les scores sont rangés par nom de catégorie (`players[].scores = { "Seigneurs": 19 }`),
// donc renommer une catégorie sur la fiche laisserait l'ancien nom dans les stats.
// `renames` = [{ from, to }]. Renvoie le nombre de parties modifiées.
export async function renameCategories(gameId, renames) {
  const list = (renames || []).filter((r) => r && r.from && r.to && r.from !== r.to)
  if (!list.length) return 0
  const { data, error } = await supabase.from('plays').select('id, players').eq('game_id', gameId)
  if (error) {
    if (tableMissing(error)) return 0
    throw error
  }
  let changed = 0
  for (const play of data ?? []) {
    let touched = false
    const players = (play.players || []).map((pl) => {
      const scores = pl?.scores
      if (!scores) return pl
      const next = {}
      // On reconstruit l'objet pour préserver l'ordre des clés.
      Object.entries(scores).forEach(([cat, v]) => {
        const hit = list.find((r) => r.from === cat)
        if (hit && !(hit.to in scores)) {
          next[hit.to] = v
          touched = true
        } else {
          next[cat] = v
        }
      })
      return touched ? { ...pl, scores: next } : pl
    })
    if (!touched) continue
    const { error: upErr } = await supabase.from('plays').update({ players }).eq('id', play.id)
    if (upErr) throw upErr
    changed += 1
  }
  return changed
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

// Tous les joueurs enregistrés (TOUS jeux confondus) → [{ name, games }], du plus
// assidu au moins assidu. [] si table absente.
export async function fetchPlayerRoster() {
  const { data, error } = await supabase.from('plays').select('players')
  if (error) {
    if (tableMissing(error)) return []
    throw error
  }
  const counts = {}
  ;(data ?? []).forEach((row) => {
    ;(row.players || []).forEach((p) => {
      const n = (p?.name || '').trim()
      if (n) counts[n] = (counts[n] || 0) + 1
    })
  })
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'fr'))
    .map((name) => ({ name, games: counts[name] }))
}

// Noms seuls, dans le même ordre (les joueurs habituels d'abord) → auto-complétion.
export async function fetchPlayerNames() {
  return (await fetchPlayerRoster()).map((p) => p.name)
}

// Renomme un joueur PARTOUT : dans toutes les parties de tous les jeux, à la fois dans
// la liste des joueurs et dans le champ `winner` (noms séparés par des virgules).
// Renommer vers un nom existant FUSIONNE les deux joueurs (sert à corriger les doublons).
// Renvoie le nombre de parties modifiées.
export async function renamePlayer(from, to) {
  const oldName = (from || '').trim()
  const newName = (to || '').trim()
  if (!oldName || !newName || oldName === newName) return 0
  const { data, error } = await supabase.from('plays').select('id, players, winner')
  if (error) {
    if (tableMissing(error)) return 0
    throw error
  }
  let changed = 0
  for (const play of data ?? []) {
    const hasPlayer = (play.players || []).some((p) => (p?.name || '').trim() === oldName)
    const winners =
      typeof play.winner === 'string' ? play.winner.split(',').map((s) => s.trim()).filter(Boolean) : []
    const hasWinner = winners.includes(oldName)
    if (!hasPlayer && !hasWinner) continue
    const patch = {
      players: (play.players || []).map((p) => ((p?.name || '').trim() === oldName ? { ...p, name: newName } : p)),
    }
    if (hasWinner) {
      // Dédoublonne : si le nouveau nom gagnait déjà cette partie, on ne le liste pas 2×.
      patch.winner = [...new Set(winners.map((w) => (w === oldName ? newName : w)))].join(', ')
    }
    const { error: upErr } = await supabase.from('plays').update(patch).eq('id', play.id)
    if (upErr) throw upErr
    changed += 1
  }
  return changed
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
// `showPlayers` (facultatif) = seuls ces joueurs apparaissent dans le podium / la
// moyenne&record (les autres sont ignorés de ces vues par-joueur).
export function computePlayStats(plays, scoring = 'high', showPlayers = null) {
  const list = plays || []
  const inShow = (n) => !showPlayers || !showPlayers.length || showPlayers.includes(n) // score compté ?
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
        if (!coop && !isTeam && inShow(n)) scores.push(t) // tuiles meilleur/moyen : joueurs affichés
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

  // Répartition des victoires par déclencheur (jeux à victoire directe).
  const trig = {}
  list.forEach((p) => {
    const t = (p.trigger || '').trim()
    if (t) trig[t] = (trig[t] || 0) + 1
  })
  const byTrigger = Object.entries(trig)
    .map(([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger, 'fr'))

  // Stats par catégorie de score (moyenne / min / max / médiane), joueurs affichés.
  const catVals = {}
  list.forEach((p) => {
    ;(p.players || []).forEach((pl) => {
      const n = (pl?.name || '').trim() || '—'
      if (!inShow(n)) return
      Object.entries(pl?.scores || {}).forEach(([cat, v]) => {
        const num = Number(v)
        if (Number.isFinite(num)) (catVals[cat] || (catVals[cat] = [])).push(num)
      })
    })
  })
  const byCategory = Object.entries(catVals).map(([category, vals]) => ({
    category,
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals),
    count: vals.length,
  }))

  const ext = (arr) => (scoring === 'low' ? Math.min(...arr) : Math.max(...arr)) // « meilleur » selon le sens
  const worst = (arr) => (scoring === 'low' ? Math.max(...arr) : Math.min(...arr))
  const names = [...new Set([...Object.keys(games), ...Object.keys(wins)])]
  let byPlayer = names
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
  // On ne garde (classement / moyenne) que les joueurs sélectionnés, si une sélection est fournie.
  if (showPlayers && showPlayers.length) byPlayer = byPlayer.filter((p) => showPlayers.includes(p.name))
  // « Occasionnel » = ≤ ¼ des parties du plus assidu (même règle que les filtres). Ils sont
  // classés APRÈS les réguliers : sinon un joueur d'une seule partie gagnée (100 %) serait
  // premier en permanence.
  const topGames = byPlayer.reduce((m, p) => Math.max(m, p.games), 0)
  byPlayer.forEach((p) => {
    p.occasional = p.games * 4 <= topGames
  })
  // Classement par TAUX DE VICTOIRE (réguliers d'abord, puis occasionnels entre eux).
  byPlayer.sort(
    (a, b) =>
      a.occasional - b.occasional ||
      b.winRate - a.winRate ||
      b.wins - a.wins ||
      b.games - a.games ||
      a.name.localeCompare(b.name, 'fr')
  )
  // Rang « compétition » (1224) : les ex æquo (même taux ET mêmes victoires) partagent
  // le rang, et le suivant saute (ex. 3 premiers à égalité → rangs 1,1,1 puis 4).
  byPlayer.forEach((p, i) => {
    const prev = byPlayer[i - 1]
    p.rank =
      i > 0 && p.occasional === prev.occasional && p.winRate === prev.winRate && p.wins === prev.wins
        ? prev.rank
        : i + 1
  })
  const bestScore = scores.length ? ext(scores) : 0
  return {
    total: list.length,
    byPlayer,
    byScenario,
    byTrigger,
    byCategory,
    scores,
    hasScores: Object.keys(playerScores).length > 0, // au moins un score perso enregistré
    coopWins,
    coopTotal,
    winRate: coopTotal ? Math.round((coopWins / coopTotal) * 100) : null,
    maxScore: bestScore,
    avgScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
  }
}
