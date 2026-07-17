import { useState } from 'react'

// Écran « Joueurs » : la liste de tous les joueurs enregistrés (toutes parties, tous
// jeux). Renommer ici met le nom à jour PARTOUT — pratique pour corriger une faute de
// frappe, ou fusionner deux orthographes du même joueur (renommer l'une vers l'autre).

export default function PlayersManager({ roster, busy, online, onRename, onClose }) {
  // Nom en cours d'édition, par joueur : { "Ancien nom": "nouvelle saisie" }
  const [edits, setEdits] = useState({})
  const valueOf = (p) => edits[p.name] ?? p.name
  const setValue = (name, v) => setEdits((e) => ({ ...e, [name]: v }))

  const names = (roster || []).map((p) => p.name)
  const rename = async (p) => {
    const next = valueOf(p).trim()
    if (!next || next === p.name) return
    await onRename(p.name, next)
    setEdits((e) => {
      const n = { ...e }
      delete n[p.name]
      return n
    })
  }

  // Entrée = masquer le clavier (on valide avec le bouton).
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault()
      e.target.blur()
    }
  }

  return (
    <div className="settings" onKeyDown={onKeyDown}>
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2>👥 Joueurs</h2>
      </div>

      <section className="settings-card">
        {roster == null ? (
          <p className="field-hint">Chargement…</p>
        ) : roster.length === 0 ? (
          <p className="field-hint">Aucun joueur pour l'instant : ils apparaîtront ici dès ta première partie enregistrée.</p>
        ) : (
          <>
            <p className="field-hint" style={{ marginBottom: 10 }}>
              Le nouveau nom remplace l'ancien dans toutes les parties. Donner à un joueur le nom d'un autre fusionne les deux.
            </p>
            {roster.map((p) => {
              const v = valueOf(p)
              const changed = v.trim() !== '' && v.trim() !== p.name
              // Renommer vers un nom déjà pris = fusion → on prévient.
              const merges = changed && names.includes(v.trim())
              return (
                <div key={p.name} className="player-row">
                  <div className="player-main">
                    <input
                      className="input"
                      value={v}
                      onChange={(e) => setValue(p.name, e.target.value)}
                      aria-label={`Nom de ${p.name}`}
                    />
                    <span className="player-count">{p.games} 🎮</span>
                    {/* Le bouton n'apparaît qu'une fois le nom modifié → rien à confirmer sinon. */}
                    {changed && (
                      <button
                        type="button"
                        className="btn-primary player-save"
                        onClick={() => rename(p)}
                        disabled={busy || !online}
                      >
                        {busy ? '…' : '✓'}
                      </button>
                    )}
                  </div>
                  {merges && (
                    <p className="player-merge">« {v.trim()} » existe déjà : les deux joueurs seront fusionnés.</p>
                  )}
                </div>
              )
            })}
          </>
        )}
      </section>
    </div>
  )
}
