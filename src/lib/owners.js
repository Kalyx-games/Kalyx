import { erreurUtilisateur } from './messages'
import { supabase, writeDb } from './supabase'
import { renameInGamesCsv } from './games'

// Liste gérée des propriétaires (table "owners"), éditée depuis les Réglages.

// ⚠️ Colonnes qui peuvent manquer si une migration n'a pas été lancée. Même motif que
// les jeux (OPTIONAL_COLS de games.js) : si l'écriture échoue à cause d'une de ces
// colonnes, on la retire et on réessaie — le reste s'enregistre quand même, et l'app
// fonctionne normalement AVANT la migration.
const OPTIONAL_COLS = ['avatar']
const colManquante = (error, payload) => {
  if (!error) return null
  return OPTIONAL_COLS.find(
    (c) => payload[c] !== undefined && new RegExp('\\b' + c + '\\b', 'i').test(error.message || '')
  )
}

// Renvoie la liste des propriétaires, ou null si la table n'existe pas encore
// (migration pas encore lancée) → l'app se rabat alors sur les noms des jeux.
export async function fetchOwners() {
  const { data, error } = await supabase.from('owners').select('*').order('name')
  if (error) return null
  return data
}

export async function addOwner(name, initials, color, avatar) {
  const payload = { name: name.trim(), initials: initials || null, color: color || null }
  if (avatar !== undefined) payload.avatar = avatar || null
  let { data, error } = await writeDb().from('owners').insert(payload).select().single()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('owners').insert(payload).select().single())
  }
  if (error) throw error
  return data
}

export async function updateOwner(id, patch) {
  const payload = { ...patch }
  let { data, error } = await writeDb().from('owners').update(payload).eq('id', id).select()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('owners').update(payload).eq('id', id).select())
  }
  if (error) throw error
  // Si aucune ligne n'est revenue, la modification a été bloquée (ex. policy RLS
  // UPDATE manquante) : on le signale au lieu de faire croire que c'est enregistré.
  if (!data || data.length === 0) {
    throw erreurUtilisateur("Le renommage n'est pas encore activé sur votre base.")
  }
}

export async function deleteOwner(id) {
  const { error } = await writeDb().from('owners').delete().eq('id', id)
  if (error) throw error
}

// Renomme un propriétaire : met à jour la ligne owners (nom + initiales/couleur) ET propage
// le nouveau nom dans la colonne games.owner de tous les jeux concernés. Renvoie le nb de jeux.
export async function renameOwner(id, oldName, newName, patch = {}) {
  const to = (newName || '').trim()
  if (!to) throw erreurUtilisateur('Nom vide.')
  const payload = { name: to, ...patch }
  let { data, error } = await writeDb().from('owners').update(payload).eq('id', id).select()
  let col
  while ((col = colManquante(error, payload))) {
    delete payload[col]
    ;({ data, error } = await writeDb().from('owners').update(payload).eq('id', id).select())
  }
  if (error) throw error
  if (!data || data.length === 0) throw erreurUtilisateur('Modification impossible (base non prête ?).')
  return renameInGamesCsv('owner', oldName, to)
}
