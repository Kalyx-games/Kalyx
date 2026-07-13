import { useMemo, useState } from 'react'
import { effectivePlayersSet } from '../lib/games'

// Fiche de score d'un jeu : une colonne par joueur, une ligne par catégorie,
// total calculé automatiquement + vainqueur mis en avant. Si le jeu a des
// extensions qui modifient le score, on coche celles utilisées avant de noter
// (les catégories liées aux extensions non cochées sont masquées).

let pid = 0
const makePlayer = (name = '') => ({ id: ++pid, name, scores: {} })

export default function ScoreSheet({ game, template, onClose }) {
  const cats = template?.categories ?? []
  const exts = template?.extensions ?? []

  // Nombres de joueurs supportés par le jeu (base ∪ extensions). Si le jeu se joue à
  // plusieurs nombres, on propose un sélecteur au-dessus du tableau.
  const playerCounts = useMemo(() => [...effectivePlayersSet(game)].sort((a, b) => a - b), [game])
  const canPickCount = playerCounts.length > 1

  const [activeExts, setActiveExts] = useState(() => new Set())
  const [players, setPlayers] = useState(() =>
    Array.from({ length: playerCounts[0] || 2 }, () => makePlayer())
  )

  // Ajuste le nombre de joueurs (en gardant les noms/scores déjà saisis).
  const setCount = (n) =>
    setPlayers((ps) => {
      if (n === ps.length) return ps
      if (n < ps.length) return ps.slice(0, n)
      return [...ps, ...Array.from({ length: n - ps.length }, () => makePlayer())]
    })

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
      </div>

      {canPickCount && (
        <section className="settings-card">
          <h3>Nombre de joueurs</h3>
          <div className="chips">
            {playerCounts.map((n) => (
              <button
                key={n}
                type="button"
                className={`fchip ${players.length === n ? 'on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      )}

      {exts.length > 0 && (
        <section className="settings-card">
          <h3>Extensions utilisées</h3>
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
