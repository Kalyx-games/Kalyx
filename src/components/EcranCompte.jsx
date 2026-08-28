import { useState } from 'react'
import { BackIcon, PencilIcon } from './icons'
import Avatar from './Avatar'
import EditeurBulle from './EditeurBulle'

// LE MENU DU COMPTE, ouvert depuis la barre du haut. Il porte les deux gestes qui
// concernent le compte : en changer, et modifier celui-ci (nom, image, couleur).
// Les Réglages s'en trouvent allégés d'autant — ils ne parlent plus de comptes.
export default function EcranCompte({
  compte, // la ligne du compte actif | null (aucun compte choisi)
  jeux = [],
  online = true,
  creation = false, // on arrive ici pour CRÉER un compte (depuis l écran des avatars)
  onChangerCompte,
  onAnnulerCreation,
  onEnregistrer, // (nom, initiales, couleur, avatar, origine)
  onSupprimer,
  onClose,
}) {
  const [edite, setEdite] = useState(false)

  return (
    <div className="settings">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2>{creation ? 'Nouveau compte' : 'Compte'}</h2>
      </div>

      {/* Le compte tel qu'il est : son image en grand, son nom. C'est l'objet du menu,
          il occupe donc la première place — pas une ligne dans une liste. */}
      <section className="settings-card compte-carte">
        {creation ? (
          <EditeurBulle
            key="nouveau"
            bulle="new"
            namePlaceholder="Nom du compte (ex. Clémence & Mathieu)"
            avecAvatar
            jeux={jeux}
            onValider={onEnregistrer}
            onAnnuler={onAnnulerCreation}
          />
        ) : compte ? (
          <>
            <div className="compte-tete">
              <Avatar compte={compte} jeux={jeux} taille={72} className="compte-avatar" />
              <span className="compte-titre">{compte.name}</span>
            </div>
            {online && !edite && (
              <div className="compte-actions">
                <button type="button" className="btn-ghost" onClick={() => setEdite(true)}>
                  <PencilIcon size={15} /> Modifier
                </button>
                <button type="button" className="btn-ghost" onClick={onChangerCompte}>Changer de compte</button>
              </div>
            )}
            {online && edite && (
              <EditeurBulle
                key={compte.id || compte.name}
                bulle={compte}
                namePlaceholder="Nom du compte"
                avecAvatar
                jeux={jeux}
                onValider={(...a) => { onEnregistrer(...a); setEdite(false) }}
                onAnnuler={() => setEdite(false)}
              />
            )}
            {!online && <p className="muted">Hors ligne : lecture seule.</p>}
          </>
        ) : (
          <>
            <p className="muted">Aucun compte n'est choisi sur cet appareil.</p>
            <button type="button" className="btn-ghost" onClick={onChangerCompte}>Choisir un compte</button>
          </>
        )}
      </section>

      {/* Supprimer vit à part, et tout en bas : ce n'est pas une action du même rang. */}
      {compte && online && onSupprimer && !edite && (
        <button type="button" className="btn-ghost compte-supprimer" onClick={() => onSupprimer(compte)}>
          Supprimer ce compte
        </button>
      )}
    </div>
  )
}
