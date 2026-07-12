import { useState } from 'react'
import { ownerColor, ownerInitials } from '../lib/games'

// Gestionnaire d'une liste de "bulles" (propriétaires OU tags) : liste + éditeur
// (nom + initiales 2 lettres + couleur). Même UI pour les deux, d'où ce composant partagé.

// Palette de couleurs des bulles.
const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#16a34a', '#0d9488', '#2f6df6', '#8b5cf6', '#ec4899']

export default function BubbleListManager({ title, items, migrationCode, namePlaceholder, onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState('new') // 'new' | ligne en cours d'édition
  const [name, setName] = useState('')
  const [initials, setInitials] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [initialsTouched, setInitialsTouched] = useState(false)

  const startNew = () => {
    setEditing('new')
    setName('')
    setInitials('')
    setColor(PALETTE[0])
    setInitialsTouched(false)
  }
  const startEdit = (o) => {
    setEditing(o)
    setName(o.name)
    setInitials(o.initials || ownerInitials(o.name))
    setColor(o.color || ownerColor(o.name))
    setInitialsTouched(true)
  }
  const onNameChange = (v) => {
    setName(v)
    if (!initialsTouched) setInitials(v.trim().slice(0, 2).toUpperCase())
  }
  const save = () => {
    const ini = (initials || name).trim().slice(0, 2).toUpperCase()
    if (editing === 'new') {
      const nm = name.trim()
      if (!nm) return
      onAdd(nm, ini, color)
    } else {
      onUpdate(editing.id, { initials: ini, color })
    }
    startNew()
  }

  const previewInitials = (initials || name).trim().slice(0, 2).toUpperCase() || '?'

  return (
    <section className="settings-card">
      <h3>{title}</h3>
      {items === null ? (
        <p className="muted">
          Lance d'abord la migration <code>{migrationCode}</code> dans Supabase pour gérer la liste ici.
        </p>
      ) : (
        <>
          {items.length > 0 && (
            <ul className="owner-list">
              {items.map((o) => (
                <li key={o.id} className={editing !== 'new' && editing && editing.id === o.id ? 'editing' : ''}>
                  <span className="owner-bubble" style={{ background: o.color || ownerColor(o.name) }}>
                    {o.initials || ownerInitials(o.name)}
                  </span>
                  <span className="owner-name-txt">{o.name}</span>
                  <button type="button" className="owner-edit" onClick={() => startEdit(o)} aria-label={`Modifier ${o.name}`}>✏️</button>
                  <button type="button" className="owner-del" onClick={() => onDelete(o)} aria-label={`Supprimer ${o.name}`}>✕</button>
                </li>
              ))}
            </ul>
          )}

          <div
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

            {editing === 'new' && (
              <input className="oe-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePlaceholder} />
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
              <span className="owner-bubble oe-preview" style={{ background: color }}>{previewInitials}</span>
            </div>

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
              {editing !== 'new' && (
                <button type="button" className="btn-ghost" onClick={startNew}>Annuler</button>
              )}
              <button type="button" className="owner-add-btn" onClick={save} disabled={editing === 'new' && !name.trim()}>
                {editing === 'new' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
