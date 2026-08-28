// L'avatar d'un compte, rangé dans UNE colonne texte (`owners.avatar`).
//
//   null / ''     → les initiales sur la couleur du compte — le comportement historique,
//                   et le repli de tous les cas douteux
//   'emoji:🐙'     → l'emoji choisi, posé sur la couleur du compte
//   'jeu:<uuid>'  → la jaquette d'un jeu de la collection
//
// ⚠️ Un seul champ, pas trois : la valeur se lit à l'œil en base, une sauvegarde la
// transporte sans traitement, et un compte sans avatar reste STRICTEMENT ce qu'il est
// aujourd'hui. Le lien vers un jeu est volontairement souple : si le jeu disparaît,
// `avatarDuCompte` retombe sur les initiales au lieu d'afficher un trou.

export const AVATAR_INITIALES = 'initiales'
export const AVATAR_EMOJI = 'emoji'
export const AVATAR_JEU = 'jeu'

// Texte stocké → { type, valeur }. Tolère null, '', et toute valeur inconnue.
export function parseAvatar(v) {
  const s = (v || '').trim()
  if (!s) return { type: AVATAR_INITIALES, valeur: '' }
  const i = s.indexOf(':')
  if (i > 0) {
    const type = s.slice(0, i)
    const valeur = s.slice(i + 1)
    if (type === AVATAR_EMOJI && valeur) return { type: AVATAR_EMOJI, valeur }
    if (type === AVATAR_JEU && valeur) return { type: AVATAR_JEU, valeur }
  }
  return { type: AVATAR_INITIALES, valeur: '' }
}

// { type, valeur } → texte à stocker. Les initiales ne stockent RIEN (null) : le défaut
// ne doit pas occuper de place, et un compte d'avant la migration reste identique.
export function formatAvatar(type, valeur) {
  const v = (valeur || '').trim()
  if (type === AVATAR_EMOJI && v) return `${AVATAR_EMOJI}:${v}`
  if (type === AVATAR_JEU && v) return `${AVATAR_JEU}:${v}`
  return null
}

// Quelques emojis proposés — des objets de table, pas des visages : ce sont des comptes
// de foyer, pas des personnes.
export const EMOJIS_PROPOSES = ['🎲', '🃏', '🐙', '🦊', '🌿', '⚓', '🍄', '🔮', '🧩', '🏰', '🚀', '🐉']
