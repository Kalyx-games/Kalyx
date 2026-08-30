import { BackIcon, PencilIcon } from './icons'
import Avatar from './Avatar'
import EditeurBulle from './EditeurBulle'
import BubbleListManager from './BubbleListManager'

// LE MENU DU COMPTE, ouvert depuis la barre du haut.
//
// ⚠️ L'écran s'ouvre sur le COMPTE, pas sur son formulaire : l'avatar en grand et le nom à
// côté, alignés à gauche, et un crayon pour ouvrir les champs (retour user du 30/08 — il
// annule la décision du 28/08 « l'éditeur EST l'écran »). On vient ici bien plus souvent
// pour changer de compte ou régler ses tags que pour se renommer.
//
// ⚠️ UN SEUL AVATAR À L'ÉCRAN : l'éditeur REMPLACE la tête au lieu de s'ajouter dessous.
// Deux images du même compte à quelques pixels d'écart se contrediraient pendant l'édition
// (l'une vivante, l'autre figée).
export default function EcranCompte({
  compte, // la ligne du compte actif | null (aucun compte choisi)
  // ⚠️ L'INSTANTANÉ de la ligne éditée, figé au tap du crayon, tenu par App (c'est une COUCHE :
  // le bouton retour la referme). PAS `compte`, qui se dégrade en `{ name }` pendant un
  // renommage — la `key` changerait et React remonterait l'éditeur EN PLEIN ENREGISTREMENT.
  edition = null,
  onOuvrirEdition,
  onFermerEdition,
  jeux = [],
  online = true,
  creation = false, // on arrive ici pour CRÉER un compte (depuis l'écran des avatars)
  onChangerCompte,
  onAnnulerCreation,
  onEnregistrer, // (nom, initiales, couleur, avatar, origine)
  onSupprimer,
  onClose,
  // Les tags vivent ici et non plus dans les Réglages : chaque compte règle SES tags
  // (leur mode de filtrage lui est propre), donc l'écran de gestion appartient au compte.
  tags = null,
  onAddTag,
  onUpdateTag,
  onRenameTag,
  onDeleteTag,
  modeTagDispo = false, // la colonne `tags.visible_pour` existe-t-elle déjà en base ?
}) {
  return (
    <div className="settings">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2>{creation ? 'Nouveau compte' : 'Compte'}</h2>
      </div>

      <section className="settings-card compte-carte">
        {creation && !online ? (
          <p className="muted">Hors ligne : impossible de créer un compte.</p>
        ) : creation ? (
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
        ) : edition ? (
          <EditeurBulle
            key={edition.id || edition.name}
            bulle={edition}
            namePlaceholder="Nom du compte"
            avecAvatar
            apercuGrand
            jeux={jeux}
            onValider={async (...args) => {
              // ⚠️ On ne referme QUE si l'écriture a abouti : sinon on renverrait sur la tête du
              // compte en effaçant ce qui vient d'être tapé, et le bandeau d'erreur (monté en
              // haut de l'app) parlerait d'une saisie qui n'existe plus.
              if (await onEnregistrer(...args)) onFermerEdition()
            }}
            onAnnuler={onFermerEdition}
          />
        ) : (
          /* Le compte au repos. Hors ligne le crayon est GRISÉ et non retiré : une commande qui
             disparaît laisse chercher, une commande éteinte se comprend. */
          <div className="compte-tete">
            <Avatar compte={compte} jeux={jeux} taille={72} className="compte-avatar" />
            <span className="compte-titre">{compte.name}</span>
            <button
              type="button"
              className="icon-btn compte-modifier"
              onClick={onOuvrirEdition}
              disabled={!online}
              title={online ? 'Modifier ce compte' : 'Indisponible hors ligne'}
              aria-label="Modifier ce compte"
            >
              <PencilIcon size={18} />
            </button>
          </div>
        )}
      </section>

      {/* Les tags du compte. Pas en création : il n'y a pas encore de compte à qui les
          rattacher, et le mode de filtrage se règle POUR quelqu'un. */}
      {!creation && compte && (
        <BubbleListManager
          title="Tags"
          items={tags}
          namePlaceholder="Nom du tag (ex. Coopératif)"
          addLabel="Ajouter un tag"
          nouveauLabel="Nouveau tag"
          online={online}
          avecModeTag={modeTagDispo}
          compte={compte.name}
          onAdd={onAddTag}
          onUpdate={onUpdateTag}
          onRename={onRenameTag}
          onDelete={onDeleteTag}
        />
      )}

      {/* Changer de compte reste possible hors ligne : c'est un geste local. */}
      {!creation && !edition && (
        <button type="button" className="btn-ghost compte-changer-btn" onClick={onChangerCompte}>
          Changer de compte
        </button>
      )}

      {/* Supprimer vit à part, et tout en bas : ce n'est pas une action du même rang. */}
      {compte && online && !creation && !edition && onSupprimer && (
        <button type="button" className="btn-ghost compte-supprimer" onClick={() => onSupprimer(compte)}>
          Supprimer ce compte
        </button>
      )}
    </div>
  )
}
