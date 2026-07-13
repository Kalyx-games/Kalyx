import { useState } from 'react'
import { parseExtensions } from '../lib/games'

// Éditeur d'une fiche de score : on définit les catégories (nom + explication +
// éventuelle extension qui les apporte) et, si le jeu a des extensions enregistrées,
// lesquelles modifient le score. Sert à corriger une fiche générée OU à en créer une.

let cid = 0
const mkCat = (c = {}) => ({ id: ++cid, label: c.label || '', hint: c.hint || '', ext: c.ext || '' })

export default function ScoreSheetEditor({ game, template, online, onSave, onClose }) {
  const isNew = !template
  // Extensions ENREGISTRÉES pour ce jeu (choix possibles).
  const availableExts = parseExtensions(game?.extensions).map((e) => e.name).filter(Boolean)

  const [mode, setMode] = useState(template?.mode === 'coop' ? 'coop' : 'competitive')
  const isCoop = mode === 'coop'
  const [cats, setCats] = useState(() => (template?.categories || []).map(mkCat))
  // Extensions qui modifient le score (sous-ensemble des extensions enregistrées).
  const [exts, setExts] = useState(() =>
    (template?.extensions || []).filter((n) => availableExts.includes(n))
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const extNames = exts
  const remaining = availableExts.filter((n) => !exts.includes(n))

  const addCat = () => setCats((c) => [...c, mkCat()])
  const updCat = (id, field, val) => setCats((c) => c.map((x) => (x.id === id ? { ...x, [field]: val } : x)))
  const delCat = (id) => setCats((c) => c.filter((x) => x.id !== id))

  const addExtName = (name) => setExts((e) => (name && !e.includes(name) ? [...e, name] : e))
  const removeExt = (name) => {
    setCats((c) => c.map((x) => (x.ext === name ? { ...x, ext: '' } : x))) // détache les catégories liées
    setExts((e) => e.filter((x) => x !== name))
  }

  const save = async () => {
    const extList = [...exts]
    // On garde les catégories même en coopératif (elles ne servent pas mais on ne
    // les perd pas si on rebascule en compétitif).
    const categories = cats
      .map((c) => ({
        label: c.label.trim(),
        hint: c.hint.trim() || null,
        ext: c.ext && extList.includes(c.ext) ? c.ext : null,
      }))
      .filter((c) => c.label)
    if (!isCoop && !categories.length) {
      setErr('Ajoute au moins une catégorie avec un nom.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(game.id, { mode, categories, extensions: extList })
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2 className="sheet-title">✏️ {isNew ? 'Nouvelle fiche' : 'Modifier'} — {game?.name}</h2>
      </div>

      <section className="settings-card">
        <h3>Type de jeu</h3>
        <div className="chips">
          <button type="button" className={`fchip ${!isCoop ? 'on' : ''}`} onClick={() => setMode('competitive')}>
            🏅 Compétitif
          </button>
          <button type="button" className={`fchip ${isCoop ? 'on' : ''}`} onClick={() => setMode('coop')}>
            🤝 Coopératif
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 8 }}>
          {isCoop
            ? 'Tout le groupe gagne ou perd ensemble. À chaque partie : Gagné/Perdu, un score de groupe et un scénario (facultatifs).'
            : 'Chacun marque ses points, le meilleur score gagne.'}
        </p>
      </section>

      {availableExts.length > 0 && (
        <section className="settings-card">
          <h3>Extensions qui modifient le score</h3>
          {exts.length === 0 && (
            <p className="field-hint" style={{ marginBottom: 8 }}>Aucune pour l'instant.</p>
          )}
          {exts.map((name) => (
            <div key={name} className="ext-chip-row">
              <span className="ext-chip-name">🧩 {name}</span>
              <button type="button" className="ext-row-x" onClick={() => removeExt(name)} aria-label="Retirer l'extension">×</button>
            </div>
          ))}
          {remaining.length === 1 ? (
            <button type="button" className="btn-ghost" onClick={() => addExtName(remaining[0])}>
              ➕ Ajouter « {remaining[0]} »
            </button>
          ) : remaining.length > 1 ? (
            <select
              className="cat-edit-ext"
              value=""
              onChange={(e) => {
                if (e.target.value) addExtName(e.target.value)
              }}
            >
              <option value="">➕ Ajouter une extension…</option>
              {remaining.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          ) : null}
        </section>
      )}

      {!isCoop && (
      <section className="settings-card">
        <h3>Catégories de score</h3>
        {cats.length === 0 && <p className="field-hint" style={{ marginBottom: 8 }}>Aucune catégorie. Ajoute-en une ci-dessous.</p>}
        {cats.map((c) => (
          <div key={c.id} className="cat-edit">
            <div className="cat-edit-row">
              <input
                className="cat-edit-label"
                value={c.label}
                onChange={(e) => updCat(c.id, 'label', e.target.value)}
                placeholder="Nom de la catégorie (ex. Seigneurs)"
              />
              <button type="button" className="ext-row-x" onClick={() => delCat(c.id)} aria-label="Retirer la catégorie">×</button>
            </div>
            <input
              className="cat-edit-hint"
              value={c.hint}
              onChange={(e) => updCat(c.id, 'hint', e.target.value)}
              placeholder="Explication (facultatif)"
            />
            {extNames.length > 0 && (
              <select className="cat-edit-ext" value={c.ext} onChange={(e) => updCat(c.id, 'ext', e.target.value)}>
                <option value="">Jeu de base (toujours visible)</option>
                {extNames.map((n) => (
                  <option key={n} value={n}>🧩 {n}</option>
                ))}
              </select>
            )}
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={addCat}>➕ Ajouter une catégorie</button>
      </section>
      )}

      {err && <p className="banner banner-err" style={{ margin: '4px 0 12px' }}>{err}</p>}

      <div className="sheet-editor-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy || !online}>
          {busy ? '…' : 'Enregistrer la fiche'}
        </button>
      </div>
    </div>
  )
}
