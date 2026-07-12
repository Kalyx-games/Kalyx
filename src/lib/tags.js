import { supabase } from './supabase'

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
  const { data, error } = await supabase
    .from('tags')
    .insert({ name: name.trim(), initials: initials || null, color: color || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTag(id, patch) {
  const { data, error } = await supabase.from('tags').update(patch).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Modification impossible : lance la migration migration_tags.sql dans Supabase.')
  }
}

export async function deleteTag(id) {
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) throw error
}
