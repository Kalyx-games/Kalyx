import { supabase } from './supabase'

// Liste gérée des propriétaires (table "owners"), éditée depuis les Réglages.

// Renvoie la liste des propriétaires, ou null si la table n'existe pas encore
// (migration pas encore lancée) → l'app se rabat alors sur les noms des jeux.
export async function fetchOwners() {
  const { data, error } = await supabase.from('owners').select('*').order('name')
  if (error) return null
  return data
}

export async function addOwner(name, initials, color) {
  const { data, error } = await supabase
    .from('owners')
    .insert({ name: name.trim(), initials: initials || null, color: color || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOwner(id, patch) {
  const { data, error } = await supabase.from('owners').update(patch).eq('id', id).select()
  if (error) throw error
  // Si aucune ligne n'est revenue, la modification a été bloquée (ex. policy RLS
  // UPDATE manquante) : on le signale au lieu de faire croire que c'est enregistré.
  if (!data || data.length === 0) {
    throw new Error("Modification impossible : lance la migration migration_owners_update_policy.sql dans Supabase.")
  }
}

export async function deleteOwner(id) {
  const { error } = await supabase.from('owners').delete().eq('id', id)
  if (error) throw error
}
