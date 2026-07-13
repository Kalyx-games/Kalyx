import { useState } from 'react'

// Éditeur d'une fiche de score : on définit les catégories (nom + explication +
// éventuelle extension qui les apporte) et la liste des extensions qui modifient
// le score. Sert à corriger une fiche générée OU à en créer une à la main.

let cid = 0
const mkCat = (c = {}) => ({ id: ++cid, label: c.label || '', hint: c.hint || '', ext: c.ext || '' })

export default function ScoreSheetEditor({ game, template, online, onSave, onClose }) {
  const isNew = !template
  const [cats, setCats] = useState(() => (template?.categories || []).map(mkCat))
  const [exts, setExts] = useState(() => [...(template?.extensions || [])])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const extNames = exts.map((s) => s.trim()).filter(Boolean)

  const addCat = () => setCats((c) => [...c, mkCat()])
  const updCat = (id, field, val) => setCats((c) => c.map((x) => (x.id === id ? { ...x, [field]: val } : x)))
  const delCat = (id) => setCats((c) => c.filter((x) => x.id !== id))

  const addExt = () => setExts((e) => [...e, ''])
  const updExt = (i, val) => setExts((e) => e.map((x, j) => (j === i ? val : x)))
  const delExt = (i) => {
    const name = (exts[i] || '').trim()
    setCats((c) => c.map((x) => (x.ext === name ? { ...x, ext: '' } : x))) // détache les catégories liées
    setExts((e) => e.filter((_, j) => j !== i))
  }

  const save = async () => {
    const extList = exts.map((s) => s.trim()).filter(Boolean)
    const categories = cats
      .map((c) => ({
        label: c.label.trim(),
        hint: c.hint.trim() || null,
        ext: c.ext && extList.includes(c.ext) ? c.ext : null,
      }))
      .filter((c) => c.label)
    if (!categories.length) {
      setErr('Ajoute au moins une catégorie avec un nom.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(game.id, { categories, extensions: extList })
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
        <h3>Extensions qui modifient le score</h3>
        <p className="field-hint" style={{ marginBottom: 8 }}>
          Elles apparaîtront en cases à cocher avant de noter. Laisse vide si aucune.
        </p>
        {exts.map((name, i) => (
          <div key={i} className="ext-row">
            <input value={name} onChange={(e) => updExt(i, e.target.value)} placeholder="Nom de l'extension" />
            <button type="button" className="ext-row-x" onClick={() => delExt(i)} aria-label="Retirer l'extension">×</button>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={addExt}>➕ Ajouter une extension</button>
      </section>

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
