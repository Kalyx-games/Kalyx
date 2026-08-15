import { createClient } from '@supabase/supabase-js'

// L'URL du projet et la clé publique sont lues depuis le fichier .env
// (ou les variables d'environnement Vercel). Elles ne sont PAS secrètes :
// la clé publique est faite pour vivre dans le navigateur. Elle sert à LIRE la base.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Tant que les deux valeurs ne sont pas renseignées, l'app affiche un écran
// « pas encore configuré » au lieu de planter.
export const isConfigured = Boolean(url && key)

// Le client de LECTURE : parle directement à Supabase avec la clé publique.
export const supabase = isConfigured ? createClient(url, key) : null

// ============================================================
//  ÉCRITURES : sécurisées par un CODE d'accès + un proxy serveur
// ============================================================
// Les écritures (ajout / modification / suppression) ne passent PAS directement par
// Supabase : elles transitent par la fonction serveur /api/sb, qui détient la vraie clé
// SECRÈTE et exige le CODE d'accès de l'appareil. Le code est saisi UNE fois par appareil,
// puis mémorisé (localStorage). Ainsi la base est en lecture seule pour la clé publique :
// un robot qui trouve l'appli ne peut rien casser.

const CODE_KEY = 'kalyx-code'

export function getCode() {
  try {
    return localStorage.getItem(CODE_KEY) || ''
  } catch {
    return ''
  }
}

export function setCode(c) {
  try {
    if (c) localStorage.setItem(CODE_KEY, c)
    else localStorage.removeItem(CODE_KEY)
  } catch {
    /* localStorage indisponible : on ignore */
  }
  _wc = null // force la recréation du client d'écriture avec le nouveau code
}

export function hasCode() {
  return Boolean(getCode())
}

const isLocalhost = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

let _wc = null
let _wcCode = null

// Client d'ÉCRITURE : un client supabase-js pointé sur le proxy /api/sb, avec le CODE
// d'accès en guise de clé (le proxy le vérifie puis met la vraie clé secrète à la place).
export function writeDb() {
  // En développement local (vite), les fonctions /api/* ne tournent pas → on écrit en direct.
  // Le verrouillage ne concerne que la prod.
  if (isLocalhost()) return supabase

  const code = getCode()
  if (_wc && _wcCode === code) return _wc
  const base = (typeof location !== 'undefined' ? location.origin : '') + '/api/sb'
  _wc = createClient(base, code || 'sans-code', { auth: { persistSession: false } })
  _wcCode = code
  return _wc
}

// Vérifie un code auprès du proxy (lecture légère via le chemin d'écriture).
// Renvoie true si le code est accepté.
export async function verifyCode(code) {
  if (isLocalhost()) return true
  try {
    const base = location.origin + '/api/sb'
    const client = createClient(base, code || 'sans-code', { auth: { persistSession: false } })
    const { error } = await client.from('owners').select('id').limit(1)
    return !error
  } catch {
    return false
  }
}
