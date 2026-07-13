import { useMemo, useState } from 'react'

// Fiche de score d'un jeu : une colonne par joueur, une ligne par catégorie,
// total calculé automatiquement + vainqueur mis en avant. Si le jeu a des
// extensions qui modifient le score, on coche celles utilisées avant de noter
// (les catégories liées aux extensions non cochées sont masquées).

let pid = 0
const makePlayer = (name = '') => ({ id: ++pid, name, scores: {} })

export default function ScoreSheet({ game, template, onEdit, onClose }) {
  const cats = template?.categories ?? []
  const exts = template?.extensions ?? []

  const [activeExts, setActiveExts] = useState(() => new Set())
  const [players, setPlayers] = useState(() => [makePlayer(), makePlayer()])

  // Catégories visibles = base + celles des extensions cochées.
  const visibleCats = useMemo(
    () => cats.filter((c) => !c.ext || activeExts.has(c.ext)),
    [cats, activeExts]
  )

  const toggleExt = (name) =>
    setActiveExts((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const setScore = (playerId, key, value) =>
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, scores: { ...p.scores, [key]: value } } : p)))
  const setName = (playerId, name) =>
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, name } : p)))
  const addPlayer = () => setPlayers((ps) => (ps.length < 8 ? [...ps, makePlayer()] : ps))
  const removePlayer = (playerId) => setPlayers((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== playerId) : ps))

  const totalOf = (p) =>
    visibleCats.reduce((sum, c) => {
      const n = Number(p.scores[c.label])
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)

  const totals = players.map(totalOf)
  const anyScore = players.some((p) => Object.values(p.scores).some((v) => v !== '' && v != null))
  const maxTotal = anyScore ? Math.max(...totals) : null

  return (
    <div className="sheet">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2 className="sheet-title">🧮 {game?.name}</h2>
        {onEdit && (
          <button type="button" className="back-btn sheet-edit-btn" onClick={onEdit} title="Modifier la fiche" aria-label="Modifier la fiche">✏️</button>
        )}
      </div>

      {exts.length > 0 && (
        <section className="settings-card">
          <div className="chips">
            {exts.map((name) => (
              <button
                key={name}
                type="button"
                className={`fchip ${activeExts.has(name) ? 'on' : ''}`}
                onClick={() => toggleExt(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-cat-head">Catégorie</th>
              {players.map((p, i) => (
                <th key={p.id} className={maxTotal != null && totals[i] === maxTotal ? 'sheet-winner' : ''}>
                  <div className="sheet-player">
                    <input
                      className="sheet-name"
                      value={p.name}
                      onChange={(e) => setName(p.id, e.target.value)}
                      placeholder={`Joueur ${i + 1}`}
                    />
                    {players.length > 1 && (
                      <button type="button" className="sheet-del" onClick={() => removePlayer(p.id)} aria-label="Retirer ce joueur">×</button>
                    )}
                  </div>
                </th>
              ))}
              <th className="sheet-add-col">
                {players.length < 8 && (
                  <button type="button" className="sheet-add" onClick={addPlayer} aria-label="Ajouter un joueur">＋</button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleCats.map((c) => (
              <tr key={c.label}>
                <th className="sheet-cat" scope="row">
                  <span className="sheet-cat-label">{c.label}</span>
                  {c.hint ? <span className="sheet-cat-hint">{c.hint}</span> : null}
                  {c.ext ? <span className="sheet-cat-ext">🧩 {c.ext}</span> : null}
                </th>
                {players.map((p) => (
                  <td key={p.id}>
                    <input
                      className="sheet-cell"
                      type="number"
                      inputMode="numeric"
                      value={p.scores[c.label] ?? ''}
                      onChange={(e) => setScore(p.id, c.label, e.target.value)}
                    />
                  </td>
                ))}
                <td className="sheet-add-col" />
              </tr>
            ))}
            <tr className="sheet-total-row">
              <th className="sheet-cat" scope="row">Total</th>
              {players.map((p, i) => (
                <td key={p.id} className={`sheet-total ${maxTotal != null && totals[i] === maxTotal ? 'sheet-winner' : ''}`}>
                  {maxTotal != null && totals[i] === maxTotal ? '🏆 ' : ''}
                  {totals[i]}
                </td>
              ))}
              <td className="sheet-add-col" />
            </tr>
          </tbody>
        </table>
      </div>

      {visibleCats.length === 0 && <p className="empty" style={{ padding: 24 }}>Cette fiche n'a pas encore de catégories.</p>}
    </div>
  )
}
