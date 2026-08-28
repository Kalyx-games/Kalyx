import { ownerColor, ownerInitials, muteOwnerColor } from '../lib/games'
import { parseAvatar, AVATAR_EMOJI, AVATAR_JEU } from '../lib/avatar'
import { thumbSrc } from '../lib/img'

// L'avatar d'un compte, à la taille demandée. Trois formes possibles (cf. lib/avatar.js) ;
// TOUT cas douteux retombe sur les initiales — un avatar ne doit jamais laisser un trou.
//
// ⚠️ La taille est passée en pixels et pilote tout (police, rayon) : le même composant
// sert la pastille de l'éditeur (44) et les grandes vignettes de l'écran de démarrage.
export default function Avatar({ compte, jeux = [], taille = 44, className = '' }) {
  const nom = compte?.name || ''
  const couleur = (compte?.color ? muteOwnerColor(compte.color) : null) || ownerColor(nom)
  const initiales = compte?.initials || ownerInitials(nom)
  const { type, valeur } = parseAvatar(compte?.avatar)

  const base = {
    width: taille,
    height: taille,
    borderRadius: '50%',
    flexShrink: 0,
  }

  if (type === AVATAR_JEU) {
    // Le jeu peut avoir été supprimé ou renommé : on ne fait confiance qu'à ce qu'on trouve.
    const jeu = jeux.find((g) => g.id === valeur)
    if (jeu?.image_url) {
      return (
        <span
          className={`kx-avatar kx-avatar-jeu ${className}`}
          style={{ ...base, background: couleur }}
          aria-hidden="true"
        >
          <img src={thumbSrc(jeu.image_url, 256)} alt="" loading="lazy" />
        </span>
      )
    }
  }

  if (type === AVATAR_EMOJI && valeur) {
    return (
      <span
        className={`kx-avatar ${className}`}
        style={{ ...base, background: couleur, fontSize: Math.round(taille * 0.52) }}
        aria-hidden="true"
      >
        {valeur}
      </span>
    )
  }

  return (
    <span
      className={`kx-avatar ${className}`}
      style={{ ...base, background: couleur, fontSize: Math.round(taille * 0.36) }}
      aria-hidden="true"
    >
      {initiales}
    </span>
  )
}
