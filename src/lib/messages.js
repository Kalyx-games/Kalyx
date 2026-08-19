// Traduction des erreurs techniques en phrases lisibles.
//
// Les messages bruts viennent de PostgREST, du proxy d'écriture ou du réseau : ils sont en
// anglais, parlent de colonnes et de codes HTTP, et n'apprennent rien à quelqu'un qui range
// ses jeux de société. Tout ce qui s'affiche à l'écran passe donc par ici ; le message
// d'origine reste dans la console pour le débogage.

// ⚠️ Les erreurs n'ont pas toutes la même forme :
//  · PostgREST → { message, code, details, hint }
//  · notre proxy /api/sb → { error: "Code d'accès invalide." } — AUCUNE clé `message`
//  · une chaîne jetée telle quelle
// Ne lire que `.message` laissait donc passer le cas le plus fréquent (appareil sans code).
function texteBrut(e) {
  if (!e) return ''
  if (typeof e === 'string') return e
  return e.message || e.error || e.error_description || e.details || e.hint || ''
}

// Une erreur écrite par l'app elle-même est DÉJÀ une phrase pour l'utilisateur : la traduire
// reviendrait à remplacer « Ce fichier n'est pas une sauvegarde Kalyx. » par un message vague.
export function erreurUtilisateur(message) {
  const e = new Error(message)
  e.pourUtilisateur = true
  return e
}

// Table ou colonne absente : Supabase répond « Could not find the table 'public.x' in the
// schema cache » — jamais « does not exist ». Même motif que les gardes de lib/plays.js.
const TABLE_ABSENTE = /does not exist|schema cache|relation|could not find/i

export function messageUtilisateur(e) {
  if (e && e.pourUtilisateur) return e.message

  const brut = texteBrut(e)
  const code = (e && (e.code || e.status)) || ''
  const m = (brut + ' ' + code).toLowerCase()
  if (typeof console !== 'undefined') console.warn('[Kalyx]', brut || e)

  if (!navigator.onLine || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'Pas de connexion. Reconnectez-vous pour enregistrer.'
  }
  // Notre proxy répond « Code d'accès invalide. » (401) : le cas le plus courant, un appareil
  // qui n'a jamais reçu le code essaie d'écrire.
  if (m.includes("code d'accès") || m.includes('permission denied') || m.includes('row-level security') || m.includes('401') || m.includes('jwt')) {
    return "Cet appareil n'a pas le droit de modifier la collection. Entrez le code d'accès dans les Réglages."
  }
  if (m.includes('duplicate key') || m.includes('already exists') || m.includes('23505')) {
    return 'Ce nom existe déjà.'
  }
  if (TABLE_ABSENTE.test(m)) {
    return "Cette fonction n'est pas encore activée sur votre base."
  }
  if (m.includes('timeout') || m.includes('504') || m.includes('gateway') || m.includes('502')) {
    return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.'
  }
  return "Ça n'a pas marché. Réessayez."
}
