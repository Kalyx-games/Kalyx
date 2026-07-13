import { supabase } from './supabase'

// Fiches de score par jeu (table `scoresheets`).
// template = { categories: [{ label, hint, ext }], extensions: [noms] }
//   - categories : les lignes de la fiche. `ext` = nom de l'extension qui apporte
//     cette catégorie (ou null/absent = jeu de base, toujours affichée).
//   - extensions : les extensions qui modifient le score (pour le menu à cocher).

const tableMissing = (error) => /does not exist|schema cache|relation/i.test(error?.message || '')

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
