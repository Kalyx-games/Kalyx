import { useMemo, useState } from 'react'

// Fiche de saisie d'une partie.
//  • Compétitif : une colonne par joueur, une ligne par catégorie, total auto +
//    vainqueur mis en avant.
//  • Coopératif : tout le groupe gagne/perd ensemble → résultat Gagné/Perdu,
//    score de groupe et scénario facultatifs, liste des joueurs présents.
// Si le jeu a des extensions qui modifient le score, on coche celles utilisées.

let pid = 0
const makePlayer = (name = '') => ({ id: ++pid, name, scores: {} })

// Champ « nom de joueur » avec auto-complétion maison (le <datalist> natif ne
// marche pas partout sur mobile). Partagé par les deux modes.
function NameField({ id, value, onChange, onPick, placeholder, playerNames, focused, setFocused, className, style }) {
  const v = (value || '').trim().toLowerCase()
  const suggestions =
    focused === id
      ? playerNames.filter((n) => n.toLowerCase() !== v && (v === '' || n.toLowerCase().includes(v))).slice(0, 6)
      : []
  return (
    <div className="sheet-name-wrap">
      <input
        className={className}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(id)}
        onBlur={() => setTimeout(() => setFocused((cur) => (cur === id ? null : cur)), 150)}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <ul className="name-suggest">
          {suggestions.map((n) => (
            <li key={n}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(n)
                  setFocused(null)
                }}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ScoreSheet({ game, template, playerNames = [], onSavePlay, saving, onEdit, onClose }) {
  const isCoop = template?.mode === 'coop'
  const cats = template?.categories ?? []
  const exts = template?.extensions ?? []

  const [activeExts, setActiveExts] = useState(() => new Set())
  const [players, setPlayers] = useState(() => [makePlayer(), makePlayer()])
  const [focusedPlayer, setFocusedPlayer] = useState(null)

  // Coopératif
  const [outcome, setOutcome] = useState(null) // 'win' | 'loss'
  const [scenario, setScenario] = useState('')
  const [groupScore, setGroupScore] = useState('')

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

  const namesOf = () => players.map((p, i) => (p.name || '').trim() || `Joueur ${i + 1}`)

  // Enregistre une partie COMPÉTITIVE.
  const savePlayCompetitive = () => {
    const built = players.map((p, i) => {
      const scores = {}
      visibleCats.forEach((c) => {
        const v = p.scores[c.label]
        if (v !== '' && v != null && Number.isFinite(Number(v))) scores[c.label] = Number(v)
      })
      return { name: (p.name || '').trim() || `Joueur ${i + 1}`, total: totalOf(p), scores }
    })
    const max = Math.max(...built.map((b) => b.total))
    const top = built.filter((b) => b.total === max).map((b) => b.name)
    onSavePlay({ players: built, winner: top.join(', '), extensions: [...activeExts] })
  }

  // Enregistre une partie COOPÉRATIVE.
  const savePlayCoop = () => {
    if (!outcome) return
    const built = namesOf().map((name) => ({ name }))
    const s = Number(groupScore)
    onSavePlay({
      mode: 'coop',
      players: built,
      outcome,
      scenario: scenario.trim() || null,
      score: groupScore.trim() !== '' && Number.isFinite(s) ? s : null,
      winner: outcome === 'win' ? built.map((b) => b.name).join(', ') : '',
      extensions: [...activeExts],
    })
  }

  const head = (
    <>
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
    </>
  )

  // ----- Mode COOPÉRATIF -----
  if (isCoop) {
    return (
      <div className="sheet">
        {head}

        <div className="coop-form">
          <div className="field">
            <label className="field-label">Résultat</label>
            <div className="chips">
              <button type="button" className={`fchip coop-win ${outcome === 'win' ? 'on' : ''}`} onClick={() => setOutcome('win')}>
                🏆 Gagné
              </button>
              <button type="button" className={`fchip coop-loss ${outcome === 'loss' ? 'on' : ''}`} onClick={() => setOutcome('loss')}>
                💀 Perdu
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label">🎯 Scénario / niveau <span className="field-opt">(facultatif)</span></label>
            <input
              className="input"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="ex. Scénario 3, difficile…"
            />
          </div>

          <div className="field">
            <label className="field-label">🔢 Score du groupe <span className="field-opt">(facultatif)</span></label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={groupScore}
              onChange={(e) => setGroupScore(e.target.value)}
              placeholder="ex. 42"
            />
          </div>

          <div className="field">
            <label className="field-label">👥 Joueurs présents</label>
            <div className="coop-players">
              {players.map((p, i) => (
                <div key={p.id} className="coop-player-row">
                  <NameField
                    id={p.id}
                    className="input"
                    value={p.name}
                    onChange={(v) => setName(p.id, v)}
                    onPick={(n) => setName(p.id, n)}
                    placeholder={`Joueur ${i + 1}`}
                    playerNames={playerNames}
                    focused={focusedPlayer}
                    setFocused={setFocusedPlayer}
                  />
                  {players.length > 1 && (
                    <button type="button" className="sheet-del" onClick={() => removePlayer(p.id)} aria-label="Retirer ce joueur">×</button>
                  )}
                </div>
              ))}
              {players.length < 8 && (
                <button type="button" className="btn-ghost coop-add" onClick={addPlayer}>➕ Ajouter un joueur</button>
              )}
            </div>
          </div>
        </div>

        {onSavePlay && (
          <div className="sheet-editor-actions">
            <button type="button" className="btn-primary" onClick={savePlayCoop} disabled={saving || !outcome}>
              {saving ? '…' : '💾 Enregistrer la partie'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ----- Mode COMPÉTITIF -----
  return (
    <div className="sheet">
      {head}

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-cat-head">Catégorie</th>
              {players.map((p, i) => (
                <th key={p.id} className={maxTotal != null && totals[i] === maxTotal ? 'sheet-winner' : ''}>
                  <div className="sheet-player">
                    <NameField
                      id={p.id}
                      className="sheet-name"
                      style={{ width: `${Math.min(160, Math.max(72, (p.name.length || 8) * 8.5 + 22))}px` }}
                      value={p.name}
                      onChange={(v) => setName(p.id, v)}
                      onPick={(n) => setName(p.id, n)}
                      placeholder={`Joueur ${i + 1}`}
                      playerNames={playerNames}
                      focused={focusedPlayer}
                      setFocused={setFocusedPlayer}
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

      {onSavePlay && visibleCats.length > 0 && (
        <div className="sheet-editor-actions">
          <button type="button" className="btn-primary" onClick={savePlayCompetitive} disabled={saving || !anyScore}>
            {saving ? '…' : '💾 Enregistrer la partie'}
          </button>
        </div>
      )}
    </div>
  )
}
