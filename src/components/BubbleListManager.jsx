import { useState } from 'react'
import { ownerColor, ownerInitials, muteOwnerColor } from '../lib/games'
import { PlusIcon, PencilIcon, XIcon } from './icons'
import EditeurBulle from './EditeurBulle'

// Gestionnaire d'une liste de « bulles » : liste + éditeur. Depuis que les COMPTES ont
// leur propre écran (le menu Compte de la barre du haut), ce composant ne sert plus
// qu'aux TAGS — mais il reste générique, l'éditeur étant partagé avec l'écran Compte.
export default function BubbleListManager({
  title, items, namePlaceholder, addLabel, online = true,
  avecAvatar = false, avecModeTag = false, compte = null, jeux = [],
  onAdd, onUpdate, onRename, onDelete,
}) {
  // null = éditeur fermé (on ne voit que la liste + le bouton d'ajout) ;
  // 'new' = création ; sinon = la ligne en cours de modification.
  const [editing, setEditing] = useState(null)
  const close = () => setEditing(null)

  // ⚠️ `visibleMoi` n'entre PAS dans le patch : il ne se recompose qu'après relecture de la
  // ligne (la colonne porte le choix des autres comptes). App s'en charge.
  const valider = (nom, initiales, couleur, avatar, origine, visibleMoi) => {
    const patch = avecAvatar ? { initials: initiales, color: couleur, avatar } : { initials: initiales, color: couleur }
    if (!origine) {
      onAdd(nom, initiales, couleur, avatar, visibleMoi)
    } else if (nom !== origine.name && onRename) {
      // Le nom a changé → renommage AVEC propagation sur tous les jeux concernés.
      onRename(origine.id, origine.name, nom, patch, visibleMoi)
    } else {
      onUpdate(origine.id, patch, visibleMoi)
    }
    close() // on referme : la liste reste lisible
  }

  return (
    <section className="settings-card">
      <h3>{title}</h3>
      {items === null ? (
        <p className="muted">Cette liste n'est pas encore activée sur votre base.</p>
      ) : (
        <>
          {items.length > 0 && (
            <ul className="owner-list">
              {items.map((o) => (
                <li key={o.id} className={editing !== 'new' && editing && editing.id === o.id ? 'editing' : ''}>
                  <span className="owner-bubble bulle-tag" style={{ background: o.color ? muteOwnerColor(o.color) : ownerColor(o.name) }}>
                    {o.initials || ownerInitials(o.name)}
                  </span>
                  <span className="owner-name-txt">{o.name}</span>
                  {online && (
                    <>
                      <button type="button" className="owner-edit" onClick={() => setEditing(o)} aria-label={`Modifier ${o.name}`}><PencilIcon size={15} /></button>
                      <button type="button" className="owner-del" onClick={() => onDelete(o)} aria-label={`Supprimer ${o.name}`}><XIcon size={14} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!online && <p className="muted">Hors ligne : lecture seule.</p>}

          {/* Éditeur replié par défaut : on ne montre qu'un bouton, l'écran reste léger. */}
          {online && editing === null && (
            <button type="button" className="btn-ghost btn-add bubble-add" onClick={() => setEditing('new')}>
              <PlusIcon size={14} /> {addLabel}
            </button>
          )}

          {online && editing !== null && (
            <EditeurBulle
              key={editing === 'new' ? 'new' : editing.id}
              bulle={editing}
              titre={editing === 'new' ? `Nouveau — ${title}` : `Modifier « ${editing.name} »`}
              namePlaceholder={namePlaceholder}
              avecAvatar={avecAvatar}
              avecModeTag={avecModeTag}
              compte={compte}
              jeux={jeux}
              onValider={valider}
              onAnnuler={close}
            />
          )}
        </>
      )}
    </section>
  )
}
