import { BackIcon } from './icons'
import Avatar from './Avatar'
import EditeurBulle from './EditeurBulle'

// LE MENU DU COMPTE, ouvert depuis la barre du haut.
//
// L'écran n'a qu'un sujet : ce compte. Les champs qui le modifient sont donc posés
// DIRECTEMENT — pas derrière un bouton « Modifier » qui ne masquerait qu'une page
// presque vide. L'aperçu en tête est vivant : il suit l'emoji et la couleur en direct.
export default function EcranCompte({
  compte, // la ligne du compte actif | null (aucun compte choisi)
  jeux = [],
  online = true,
  creation = false, // on arrive ici pour CRÉER un compte (depuis l'écran des avatars)
  onChangerCompte,
  onAnnulerCreation,
  onEnregistrer, // (nom, initiales, couleur, avatar, origine)
  onSupprimer,
  onClose,
}) {
  return (
    <div className="settings">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2>{creation ? 'Nouveau compte' : 'Compte'}</h2>
      </div>

      <section className="settings-card compte-carte">
        {creation ? (
          <EditeurBulle
            key="nouveau"
            bulle="new"
            namePlaceholder="Nom du compte (ex. Clémence & Mathieu)"
            avecAvatar
            apercuGrand
            jeux={jeux}
            onValider={onEnregistrer}
            onAnnuler={onAnnulerCreation}
          />
        ) : !compte ? (
          <>
            <p className="muted">Aucun compte n'est choisi sur cet appareil.</p>
            <button type="button" className="btn-ghost" onClick={onChangerCompte}>Choisir un compte</button>
          </>
        ) : online ? (
          <EditeurBulle
            key={compte.id || compte.name}
            bulle={compte}
            namePlaceholder="Nom du compte"
            avecAvatar
            apercuGrand
            jeux={jeux}
            onValider={onEnregistrer}
          />
        ) : (
          /* Hors ligne, rien ne s'écrit : on montre le compte, on ne l'édite pas. */
          <>
            <div className="compte-tete">
              <Avatar compte={compte} jeux={jeux} taille={72} className="compte-avatar" />
              <span className="compte-titre">{compte.name}</span>
            </div>
            <p className="muted">Hors ligne : lecture seule.</p>
          </>
        )}
      </section>

      {/* Changer de compte reste possible hors ligne : c'est un geste local. */}
      {!creation && (
        <button type="button" className="btn-ghost compte-changer-btn" onClick={onChangerCompte}>
          Changer de compte
        </button>
      )}

      {/* Supprimer vit à part, et tout en bas : ce n'est pas une action du même rang. */}
      {compte && online && !creation && onSupprimer && (
        <button type="button" className="btn-ghost compte-supprimer" onClick={() => onSupprimer(compte)}>
          Supprimer ce compte
        </button>
      )}
    </div>
  )
}
