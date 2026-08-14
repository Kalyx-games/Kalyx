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
export function computeGlobalTierlist(tierlists, gameIds) {
  const valid = new Set(gameIds)
  const sums = {} // id → { total, n }
  ;(tierlists || []).forEach((tl) => {
    SCORED_TIERS.forEach((t) => {
      ;(tl.ranking?.[t.key] || []).forEach((id) => {
        if (!valid.has(id)) return
        const e = sums[id] || (sums[id] = { total: 0, n: 0 })
        e.total += t.score
        e.n += 1
      })
    })
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
  // Tri interne : meilleure moyenne d'abord.
  Object.keys(ranking).forEach((k) => ranking[k].sort((a, b) => avg[b] - avg[a]))
  const unranked = gameIds.filter((id) => avg[id] == null)
  return { ranking, unranked, avg }
}
