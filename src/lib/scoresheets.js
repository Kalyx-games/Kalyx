import { supabase } from './supabase'

// Fiches de score par jeu (table `scoresheets`).
// template = { categories: [{ label, hint, ext }], extensions: [noms] }
//   - categories : les lignes de la fiche. `ext` = nom de l'extension qui apporte
//     cette catégorie (ou null/absent = jeu de base, toujours affichée).
//   - extensions : les extensions qui modifient le score (pour le menu à cocher).

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

// Extensions cochées par défaut (saisie d'une partie + filtre stats). `extDefault` est
// une LISTE de noms ; compat ascendante avec l'ancien mode 'all' / 'none'.
//   allNames = toutes les extensions du jeu (pour valider / résoudre 'all').
export function resolveDefaultExts(template, allNames) {
  const d = template?.extDefault
  if (Array.isArray(d)) return d.filter((n) => allNames.includes(n))
  if (d === 'all') return [...allNames]
  return []
}

// Récupère toutes les fiches → objet { game_id: template }. null si table absente.
export async function fetchScoresheets() {
  const { data, error } = await supabase.from('scoresheets').select('game_id, template')
  if (error) {
    if (tableMissing(error)) return null
    throw error
  }
  const map = {}
  ;(data ?? []).forEach((r) => {
    map[r.game_id] = r.template
  })
  return map
}

// TOUTES les fiches, en lignes brutes (pour les sauvegardes) : on garde game_id et
// updated_at, contrairement à fetchScoresheets qui n'en fait qu'une table de consultation.
// [] si la table n'existe pas encore.
export async function fetchAllScoresheets() {
  const { data, error } = await supabase.from('scoresheets').select('id, game_id, template, updated_at')
  if (error) {
    if (tableMissing(error)) return []
    throw error
  }
  return data ?? []
}

// Enregistre (crée ou met à jour) la fiche d'un jeu. Renvoie le template sauvegardé.
export async function saveScoresheet(gameId, template) {
  const row = { game_id: gameId, template, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('scoresheets').upsert(row, { onConflict: 'game_id' })
  if (error) throw error
  return template
}

// Supprime la fiche d'un jeu.
