import { supabase } from './supabase'

// Tierlists : un classement des jeux par joueur. Le classement stocke des ID de jeux
// (pas des images) → changer l'image d'un jeu la fait suivre dans les tierlists.

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

// Les 7 lignes de la tierlist. `score` sert à la tierlist GLOBALE (moyenne) ; la ligne
// « Pas d'avis » a un score null → elle N'entre PAS dans la moyenne.
// Couleurs = dégradé habituel des tierlists (rouge → bleu).
export const TIERS = [
  { key: 'S', label: 'S', color: '#ff7f7f', score: 6 },
  { key: 'A', label: 'A', color: '#ffbf7f', score: 5 },
  { key: 'B', label: 'B', color: '#ffdf80', score: 4 },
  { key: 'C', label: 'C', color: '#ffff7f', score: 3 },
  { key: 'D', label: 'D', color: '#bfff7f', score: 2 },
  { key: 'F', label: 'F', color: '#7fbfff', score: 1 },
  { key: '?', label: '🤷', title: "Pas d'avis", color: '#c9ccd6', score: null },
]
export const SCORED_TIERS = TIERS.filter((t) => t.score != null)

// Un classement vide = une ligne (clé) par tier, tableau d'ID vide.
export function emptyRanking() {
  const r = {}
  TIERS.forEach((t) => {
    r[t.key] = []
  })
  return r
}

// Normalise un classement relu (comble les tiers manquants, ignore les clés inconnues).
export function normalizeRanking(raw) {
  const r = emptyRanking()
  if (raw && typeof raw === 'object') {
    TIERS.forEach((t) => {
      if (Array.isArray(raw[t.key])) r[t.key] = raw[t.key].filter(Boolean)
    })
  }
  return r
}

// Mutualisation par NOM : un même jeu présent plusieurs fois dans la collection (ex.
// Belote/Tarot en double chez des propriétaires différents) ne doit être classé qu'UNE
// fois. On se base sur le nom STRICTEMENT identique. Le « représentant » d'un nom = le
// 1er jeu rencontré avec ce nom ; toutes les tierlists n'utilisent que des représentants.

// Un seul jeu par nom (les doublons sont retirés).
export function dedupeByName(games) {
  const seen = new Set()
  return (games || []).filter((g) => {
    if (seen.has(g.name)) return false
    seen.add(g.name)
    return true
  })
}

// id de n'importe quel jeu → id de son représentant (même nom). Map.
export function repIdMap(games) {
  const repByName = new Map()
  ;(games || []).forEach((g) => {
    if (!repByName.has(g.name)) repByName.set(g.name, g.id)
  })
  const m = new Map()
  ;(games || []).forEach((g) => m.set(g.id, repByName.get(g.name)))
  return m
}

// Remappe un classement vers les ids représentants + dédoublonne (un jeu une seule fois,
// à sa 1re position rencontrée) → un doublon classé sous un autre id est mutualisé.
// `validIds` (facultatif) : si fourni, on RETIRE les ids absents (jeux supprimés de la
// collection) → nettoyage des classements.
export function remapRanking(ranking, repById, validIds) {
  const seen = new Set()
  const out = {}
  TIERS.forEach((t) => {
    out[t.key] = []
    ;(ranking?.[t.key] || []).forEach((id) => {
      const rep = repById.get(id) || id
      if (validIds && !validIds.has(rep)) return // jeu supprimé de la collection → retiré
      if (!seen.has(rep)) {
        seen.add(rep)
        out[t.key].push(rep)
      }
    })
  })
  return out
}

// TOUTES les tierlists (colonnes brutes, pour les sauvegardes). [] si table absente.
export async function fetchAllTierlists() {
  const { data, error } = await supabase.from('tierlists').select('id, player, ranking, created_at, updated_at')
  if (error) {
    if (tableMissing(error)) return []
    throw error
  }
  return data ?? []
}

// Toutes les tierlists (sans filtre). null si la table n'existe pas encore.
export async function fetchTierlists() {
  const { data, error } = await supabase
    .from('tierlists')
    .select('id, player, ranking, updated_at')
    .order('updated_at', { ascending: false })
  if (error) {
    if (tableMissing(error)) return null // table pas encore créée (migration à lancer)
    throw error
  }
  return (data ?? []).map((t) => ({ ...t, ranking: normalizeRanking(t.ranking) }))
}

// Crée OU met à jour une tierlist. Avec `id` → update ; sinon insert (player unique).
// Renvoie la ligne (dont son id, pour les sauvegardes suivantes).
export async function upsertTierlist({ id, player, ranking }) {
  const row = { player: (player || '').trim(), ranking }
  let res
  if (id) {
    res = await supabase.from('tierlists').update(row).eq('id', id).select('id, player, ranking, updated_at').single()
  } else {
    res = await supabase
      .from('tierlists')
      .upsert(row, { onConflict: 'player' })
      .select('id, player, ranking, updated_at')
      .single()
  }
  if (res.error) throw res.error
  return { ...res.data, ranking: normalizeRanking(res.data.ranking) }
}

export async function deleteTierlist(id) {
  const { error } = await supabase.from('tierlists').delete().eq('id', id)
  if (error) throw error
}

// Tierlist GLOBALE (moyenne). Pour chaque jeu, on moyenne le score des lignes où il a
// été placé (hors « Pas d'avis » et hors non-placé), puis on le range dans le tier dont
// le score est le plus proche de sa moyenne. `gameIds` = jeux existants (collection).
// Renvoie { ranking: {tier:[id...]}, unranked:[id...], avg: {id:number} } :
//  - ranking : les jeux notés, rangés par tier (triés par moyenne décroissante) ;
//  - unranked : les jeux qu'AUCUN joueur n'a notés (zone « Non classés »).
export function computeGlobalTierlist(tierlists, gameIds, repById) {
  const valid = new Set(gameIds)
  const sums = {} // id (représentant) → { total, n } — pour la moyenne de SCORE (→ le tier)
  const rankSum = {} // id → { total, n } — position MOYENNE dans les classements (→ l'ordre)
  ;(tierlists || []).forEach((tl) => {
    // Remappe vers les représentants (mutualise les doublons de nom) + dédoublonne par joueur.
    const rk = repById ? remapRanking(tl.ranking, repById) : tl.ranking || {}
    let pos = 0 // position dans le classement aplati (S en haut → F en bas) de CE joueur
    SCORED_TIERS.forEach((t) => {
      ;(rk[t.key] || []).forEach((id) => {
        if (!valid.has(id)) return
        const e = sums[id] || (sums[id] = { total: 0, n: 0 })
        e.total += t.score
        e.n += 1
        const rr = rankSum[id] || (rankSum[id] = { total: 0, n: 0 })
        rr.total += pos
        rr.n += 1
        pos += 1
      })
    })
  })
  // Position moyenne (plus petite = classé plus haut en moyenne) → ordre au sein d'une ligne.
  const avgRank = {}
  Object.entries(rankSum).forEach(([id, e]) => {
    avgRank[id] = e.total / e.n
  })
  const avg = {}
  Object.entries(sums).forEach(([id, e]) => {
    avg[id] = e.total / e.n
  })
  // Range chaque jeu noté dans le tier au score le plus proche de sa moyenne.
  const ranking = {}
  SCORED_TIERS.forEach((t) => {
    ranking[t.key] = []
  })
  Object.keys(avg).forEach((id) => {
    let best = SCORED_TIERS[0]
    SCORED_TIERS.forEach((t) => {
      if (Math.abs(t.score - avg[id]) < Math.abs(best.score - avg[id])) best = t
    })
    ranking[best.key].push(id)
  })
  // Tri au sein d'une ligne = ORDRE MOYEN des utilisateurs (position moyenne croissante),
  // avec la moyenne de score en départage.
  Object.keys(ranking).forEach((k) =>
    ranking[k].sort((a, b) => (avgRank[a] ?? 1e9) - (avgRank[b] ?? 1e9) || avg[b] - avg[a])
  )
  const unranked = gameIds.filter((id) => avg[id] == null)
  return { ranking, unranked, avg }
}

// Tier (lettre) le plus proche d'un score moyen.
function tierOfScore(s) {
  return SCORED_TIERS.reduce((best, t) => (Math.abs(t.score - s) < Math.abs(best.score - s) ? t : best), SCORED_TIERS[0])
}

// Anecdotes tirées des classements de tous les joueurs, GROUPÉES par type (⚔️ divise, 🏆 chouchou,
// 🫶 goûts proches…). Renvoie un tableau de groupes non vides ; le hub tire un groupe au hasard
// puis une anecdote dedans → chance égale par type. Recalculée à chaque changement des tierlists,
// donc les anecdotes ÉVOLUENT. `nameById` : id → nom de jeu.
export function computeAnecdoteList(tierlists, gameIds, repById, nameById) {
  const valid = new Set(gameIds)
  const gname = (id) => nameById.get(id) || '?'
  const tierOf = (s) => tierOfScore(s).label
  const byGame = {} // id → [{ player, score }]
  const byPlayer = {} // player → { id → score }
  ;(tierlists || []).forEach((tl) => {
    const rk = repById ? remapRanking(tl.ranking, repById, valid) : tl.ranking || {}
    SCORED_TIERS.forEach((t) => {
      ;(rk[t.key] || []).forEach((id) => {
        ;(byGame[id] = byGame[id] || []).push({ player: tl.player, score: t.score })
        ;(byPlayer[tl.player] = byPlayer[tl.player] || {})[id] = t.score
      })
    })
  })
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const nbPlayers = Object.keys(byPlayer).length
  // « Chouchou / mal-aimé du groupe » doit être noté par au moins la moitié des joueurs
  // (mini 2) pour être représentatif du groupe, pas d'un jeu que 2 personnes adorent.
  const minRepr = Math.max(2, Math.ceil(nbPlayers / 2))

  // Chaque TYPE d'anecdote = un groupe (tableau non vide). Le hub tire d'abord un groupe au
  // hasard, puis une anecdote dedans → chance ÉGALE par type (pas biaisée vers les catégories
  // qui produisent beaucoup de phrases).
  const groups = []
  const addGroup = (arr) => { if (arr.length) groups.push(arr) }

  // ⚔️ Ça divise : plus grand écart de notes (min↔max).
  addGroup(
    Object.entries(byGame)
      .filter(([, arr]) => arr.length >= 2)
      .map(([id, arr]) => {
        const sc = arr.map((a) => a.score)
        const max = Math.max(...sc)
        const min = Math.min(...sc)
        return { id, spread: max - min, max, min, hi: arr.filter((a) => a.score === max), lo: arr.filter((a) => a.score === min) }
      })
      .filter((d) => d.spread >= 2)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 8)
      .map((d) => ({
        icon: '⚔️',
        text: `${gname(d.id)} divise : ${tierOf(d.max)} pour ${d.hi.map((x) => x.player).join(', ')}, ${tierOf(d.min)} pour ${d.lo.map((x) => x.player).join(', ')}.`,
      }))
  )

  // 🤝 À l'unanimité (mêmes notes pour tous, ≥ 2 joueurs) — message selon le tier.
  const unan = []
  Object.entries(byGame)
    .filter(([, arr]) => arr.length >= 2 && new Set(arr.map((a) => a.score)).size === 1)
    .forEach(([id, arr]) => {
      const s = arr[0].score
      const n = gname(id)
      if (s >= 6) unan.push({ icon: '❤️', text: `Tout le monde adore ${n} (S) !` })
      else if (s >= 5) unan.push({ icon: '😍', text: `${n} fait l'unanimité en A.` })
      else if (s <= 1) unan.push({ icon: '🗑️', text: `Personne ne sauve ${n} (F).` })
      else if (s <= 2) unan.push({ icon: '💤', text: `${n} laisse tout le monde de marbre (D).` })
      else unan.push({ icon: '🎯', text: `Accord parfait : tout le monde met ${n} en ${tierOf(s)}.` })
    })
  addGroup(unan)

  // 🌶️ Avis tranchés : notes d'un joueur les plus éloignées du reste du groupe (≥ 3 votants).
  const bolds = []
  Object.entries(byGame).forEach(([id, arr]) => {
    if (arr.length < 3) return
    arr.forEach((a) => {
      const others = arr.filter((x) => x !== a)
      const avgO = others.reduce((s, x) => s + x.score, 0) / others.length
      const dev = Math.abs(a.score - avgO)
      if (dev >= 2) bolds.push({ id, player: a.player, tier: tierOf(a.score), othersTier: tierOf(avgO) })
    })
  })
  addGroup(
    bolds.slice(0, 6).map((b) => ({
      icon: '🌶️',
      text: `${b.player} met ${gname(b.id)} en ${b.tier}, là où le groupe le voit plutôt en ${b.othersTier}.`,
    }))
  )

  // 🏆 Chouchou / 📉 mal-aimé du groupe (meilleure / pire moyenne, noté par ≥ la moitié des joueurs).
  const avgList = Object.entries(byGame)
    .filter(([, arr]) => arr.length >= minRepr)
    .map(([id, arr]) => ({ id, avg: arr.reduce((s, a) => s + a.score, 0) / arr.length }))
  if (avgList.length) {
    const top = avgList.reduce((b, x) => (x.avg > b.avg ? x : b))
    const bot = avgList.reduce((b, x) => (x.avg < b.avg ? x : b))
    addGroup([{ icon: '🏆', text: `${gname(top.id)} est le jeu préféré du groupe.` }])
    addGroup([{ icon: '📉', text: `${gname(bot.id)} est le moins aimé du groupe.` }])
  }
  // 📊 Le jeu le plus classé (indépendant : c'est justement une histoire de nombre de votants).
  const rated = Object.entries(byGame)
  if (rated.length) {
    const mostRated = rated.reduce((b, x) => (x[1].length > b[1].length ? x : b))
    if (mostRated[1].length >= 3) addGroup([{ icon: '📊', text: `${gname(mostRated[0])} est le jeu le plus classé (${mostRated[1].length} joueurs).` }])
  }

  // ⭐ Coup de cœur / 😖 bête noire de chaque joueur (un jeu au hasard parmi ses S / ses F).
  const coups = []
  const betes = []
  Object.entries(byPlayer).forEach(([player, m]) => {
    const sGames = Object.keys(m).filter((id) => m[id] === 6)
    const fGames = Object.keys(m).filter((id) => m[id] === 1)
    if (sGames.length) coups.push({ icon: '⭐', text: `Un coup de cœur de ${player} : ${gname(pick(sGames))} (S).` })
    if (fGames.length) betes.push({ icon: '😖', text: `Une bête noire de ${player} : ${gname(pick(fGames))} (F).` })
  })
  addGroup(coups)
  addGroup(betes)

  // 😇 Le plus enthousiaste / 😈 le plus sévère (plus de S / plus de F).
  const gen = Object.entries(byPlayer).map(([p, m]) => ({
    p,
    s: Object.values(m).filter((v) => v === 6).length,
    f: Object.values(m).filter((v) => v === 1).length,
  }))
  if (gen.length) {
    const enthou = gen.reduce((b, x) => (x.s > b.s ? x : b))
    if (enthou.s > 0) addGroup([{ icon: '😇', text: `${enthou.p} est le plus enthousiaste : ${enthou.s} jeux en S !` }])
    const severe = gen.reduce((b, x) => (x.f > b.f ? x : b))
    if (severe.f > 0) addGroup([{ icon: '😈', text: `${severe.p} est le plus sévère : ${severe.f} jeux en F.` }])
  }

  // 🔢 Nombre de jeux classés par joueur.
  addGroup(
    Object.entries(byPlayer)
      .filter(([, m]) => Object.keys(m).length >= 5)
      .map(([player, m]) => ({ icon: '🔢', text: `${player} a classé ${Object.keys(m).length} jeux.` }))
  )

  // 👯 Goûts les plus proches / les plus opposés (paires, ≥ 5 jeux en commun).
  const players = Object.keys(byPlayer)
  const pairs = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const A = byPlayer[players[i]]
      const B = byPlayer[players[j]]
      const common = Object.keys(A).filter((id) => id in B)
      if (common.length < 5) continue
      const diff = common.reduce((s, id) => s + Math.abs(A[id] - B[id]), 0) / common.length
      pairs.push({ a: players[i], b: players[j], diff })
    }
  }
  if (pairs.length) {
    const close = pairs.reduce((b, x) => (x.diff < b.diff ? x : b))
    addGroup([{ icon: '🫶', text: `${close.a} et ${close.b} ont les goûts les plus proches.` }])
    if (pairs.length > 1) {
      const far = pairs.reduce((b, x) => (x.diff > b.diff ? x : b))
      addGroup([{ icon: '🙃', text: `${far.a} et ${far.b} ont les goûts les plus opposés.` }])
    }
  }

  return groups
}
