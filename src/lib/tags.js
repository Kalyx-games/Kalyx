import { erreurUtilisateur } from './messages'
import { supabase, writeDb } from './supabase'
import { renameInGamesCsv } from './games'

// Liste gérée des tags (table "tags"), éditée depuis les Réglages.
// Même structure et même logique que les propriétaires (owners).

// Renvoie la liste des tags, ou null si la table n'existe pas encore
// (migration migration_tags.sql pas encore lancée).
export async function fetchTags() {
  const { data, error } = await supabase.from('tags').select('*').order('name')
  if (error) return null
  return data
}

export async function addTag(name, initials, color) {
  const { data, error } = await writeDb()
    .from('tags')
    .insert({ name: name.trim(), initials: initials || null, color: color || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTag(id, patch) {
  const { data, error } = await writeDb().from('tags').update(patch).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) {
    throw erreurUtilisateur("Les tags ne sont pas encore activés sur votre base.")
  }
}

export async function deleteTag(id) {
  const { error } = await writeDb().from('tags').delete().eq('id', id)
  if (error) throw error
}

// Renomme un tag : met à jour la ligne tags (nom + initiales/couleur) ET propage le nouveau
// nom dans la colonne games.tags de tous les jeux concernés. Renvoie le nb de jeux modifiés.
export async function renameTag(id, oldName, newName, patch = {}) {
  const to = (newName || '').trim()
  if (!to) throw erreurUtilisateur('Nom vide.')
  const { data, error } = await writeDb().from('tags').update({ name: to, ...patch }).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw erreurUtilisateur('Modification impossible (base non prête ?).')
  return renameInGamesCsv('tags', oldName, to)
}
