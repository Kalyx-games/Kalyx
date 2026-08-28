import { useMemo, useState } from 'react'
import { ownerColor, ownerInitials, OWNER_COLORS, muteOwnerColor, parseOwners } from '../lib/games'
import { PlusIcon, PencilIcon, XIcon } from './icons'
import Avatar from './Avatar'
import { thumbSrc } from '../lib/img'
import { parseAvatar, formatAvatar, AVATAR_INITIALES, AVATAR_EMOJI, AVATAR_JEU, EMOJIS_PROPOSES } from '../lib/avatar'

// Gestionnaire d'une liste de "bulles" (propriétaires OU tags) : liste + éditeur
// (nom + initiales 2 lettres + couleur). Même UI pour les deux, d'où ce composant partagé.

// Palette de couleurs des bulles.
const PALETTE = OWNER_COLORS // une seule palette pour toute l'app (tons sourds de la charte)

// `avecAvatar` n'est vrai que pour les COMPTES : un tag est une étiquette, pas une
// identité — lui donner un visage n'aurait aucun sens.
export default function BubbleListManager({
  title, items, namePlaceholder, addLabel, online = true,
  avecAvatar = false, jeux = [],
  onAdd, onUpdate, onRename, onDelete,
}) {
  // null = éditeur fermé (on ne voit que la liste + le bouton d'ajout) ;
  // 'new' = création ; sinon = la ligne en cours de modification.
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [initials, setInitials] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [initialsTouched, setInitialsTouched] = useState(false)
  // L'avatar : sa forme, et la valeur qui va avec (l'emoji, ou l'identifiant du jeu).
  const [forme, setForme] = useState(AVATAR_INITIALES)
  const [emoji, setEmoji] = useState('')
  const [jeuId, setJeuId] = useState('')

  const close = () => setEditing(null)
  const startNew = () => {
    setEditing('new')
    setName('')
    setInitials('')
    setColor(PALETTE[0])
    setInitialsTouched(false)
    setForme(AVATAR_INITIALES)
    setEmoji('')
    setJeuId('')
  }
  const startEdit = (o) => {
    setEditing(o)
    setName(o.name)
    setInitials(o.initials || ownerInitials(o.name))
    setColor(muteOwnerColor(o.color) || ownerColor(o.name))
    setInitialsTouched(true)
    const a = parseAvatar(o.avatar)
    setForme(a.type)
    setEmoji(a.type === AVATAR_EMOJI ? a.valeur : '')
    setJeuId(a.type === AVATAR_JEU ? a.valeur : '')
  }
  const onNameChange = (v) => {
    setName(v)
    if (!initialsTouched) setInitials(v.trim().slice(0, 2).toUpperCase())
  }
  const save = () => {
    const ini = (initials || name).trim().slice(0, 2).toUpperCase()
    const nm = name.trim()
    if (!nm) return
    // `undefined` quand la carte ne gère pas d'avatar (les tags) : la colonne n'est alors
    // pas touchée du tout. `null` = « initiales », le défaut, qui ne stocke rien.
    const av = avecAvatar ? formatAvatar(forme, forme === AVATAR_EMOJI ? emoji : jeuId) : undefined
    const patch = avecAvatar ? { initials: ini, color, avatar: av } : { initials: ini, color }
    if (editing === 'new') {
      onAdd(nm, ini, color, av)
    } else if (nm !== editing.name && onRename) {
      // Le nom a changé → renommage AVEC propagation sur tous les jeux concernés.
      onRename(editing.id, editing.name, nm, patch)
    } else {
      onUpdate(editing.id, patch)
    }
    close() // on referme : la liste reste lisible
  }

  const previewInitials = (initials || name).trim().slice(0, 2).toUpperCase() || '?'
  // L'aperçu se construit sur les valeurs EN COURS d'édition, pas sur la ligne enregistrée.
  const apercu = {
    name: name || '?',
    initials: previewInitials,
    color,
    avatar: avecAvatar ? formatAvatar(forme, forme === AVATAR_EMOJI ? emoji : jeuId) : null,
  }
  // Les jaquettes proposées : les jeux DU COMPTE d'abord (c'est sa collection), les autres
  // ensuite — un compte tout neuf n'a encore aucun jeu à son nom.
  const jeuxProposes = useMemo(() => {
    if (!avecAvatar) return []
    const avecImage = jeux.filter((g) => g.image_url)
    const nm = (editing && editing !== 'new' ? editing.name : name).trim()
    if (!nm) return avecImage
    const sien = (g) => parseOwners(g.owner).includes(nm)
    return [...avecImage.filter(sien), ...avecImage.filter((g) => !sien(g))]
  }, [avecAvatar, jeux, editing, name])

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
                  {avecAvatar ? (
                    <Avatar compte={o} jeux={jeux} taille={26} />
                  ) : (
                    <span className="owner-bubble" style={{ background: o.color ? muteOwnerColor(o.color) : ownerColor(o.name) }}>
                      {o.initials || ownerInitials(o.name)}
                    </span>
                  )}
                  <span className="owner-name-txt">{o.name}</span>
                  {online && (
                    <>
                      <button type="button" className="owner-edit" onClick={() => startEdit(o)} aria-label={`Modifier ${o.name}`}><PencilIcon size={15} /></button>
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
            <button type="button" className="btn-ghost btn-add bubble-add" onClick={startNew}>
              <PlusIcon size={14} /> {addLabel}
            </button>
          )}

          {online && editing !== null && <div
            className="owner-editor"
            onKeyDown={(e) => {
              // Entrée sur un champ → on masque le clavier (blur) sur mobile.
              if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                e.preventDefault()
                e.target.blur()
              }
            }}
          >
            <div className="owner-editor-title">{editing === 'new' ? `Nouveau — ${title}` : `Modifier « ${editing.name} »`}</div>

            <input className="oe-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePlaceholder} />
            {editing !== 'new' && name.trim() !== editing.name && (
              <p className="oe-rename-hint">Le nom sera aussi mis à jour sur tous les jeux concernés.</p>
            )}

            <div className="oe-row">
              <div className="oe-field">
                <span className="oe-label">Initiales (bulle)</span>
                <input
                  className="oe-initials"
                  maxLength={2}
                  value={initials}
                  onChange={(e) => {
                    setInitials(e.target.value.toUpperCase())
                    setInitialsTouched(true)
                  }}
                  placeholder="MA"
                />
              </div>
              {avecAvatar ? (
                <Avatar compte={apercu} jeux={jeux} taille={44} className="oe-preview" />
              ) : (
                <span className="owner-bubble oe-preview" style={{ background: color }}>{previewInitials}</span>
              )}
            </div>

            {avecAvatar && (
              <div className="oe-field">
                <span className="oe-label">Image du compte</span>
                <div className="chips av-formes">
                  <button type="button" className={`fchip ${forme === AVATAR_INITIALES ? 'on' : ''}`} onClick={() => setForme(AVATAR_INITIALES)}>Initiales</button>
                  <button type="button" className={`fchip ${forme === AVATAR_EMOJI ? 'on' : ''}`} onClick={() => setForme(AVATAR_EMOJI)}>Emoji</button>
                  <button type="button" className={`fchip ${forme === AVATAR_JEU ? 'on' : ''}`} onClick={() => setForme(AVATAR_JEU)}>Jaquette</button>
                </div>

                {forme === AVATAR_EMOJI && (
                  <>
                    <div className="av-emojis">
                      {EMOJIS_PROPOSES.map((e) => (
                        <button key={e} type="button" className={`av-emoji ${emoji === e ? 'sel' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
                      ))}
                    </div>
                    <input
                      className="input av-emoji-libre"
                      value={emoji}
                      onChange={(e) => setEmoji([...e.target.value.trim()].slice(0, 2).join(''))}
                      placeholder="ou le vôtre"
                      aria-label="Emoji du compte"
                    />
                  </>
                )}

                {forme === AVATAR_JEU &&
                  (jeuxProposes.length === 0 ? (
                    <p className="field-hint">Aucun jeu avec une image pour l'instant.</p>
                  ) : (
                    <div className="av-jeux">
                      {jeuxProposes.slice(0, 40).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={`av-jeu ${jeuId === g.id ? 'sel' : ''}`}
                          onClick={() => setJeuId(g.id)}
                          title={g.name}
                          aria-label={g.name}
                        >
                          <img src={thumbSrc(g.image_url, 256)} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            )}

            <div className="oe-field">
              <span className="oe-label">Couleur</span>
              <div className="palette">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${color === c ? 'sel' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Couleur ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="oe-actions">
              <button type="button" className="btn-ghost" onClick={close}>Annuler</button>
              <button type="button" className="owner-add-btn" onClick={save} disabled={!name.trim()}>
                {editing === 'new' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>}
        </>
      )}
    </section>
  )
}
