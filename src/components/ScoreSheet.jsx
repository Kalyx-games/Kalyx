import { useMemo, useState } from 'react'

// Fiche de saisie d'une partie. Le type de partie vient du template :
//  • win     : 'competitive' | 'coop'
//  • scoring : 'high' | 'low' | 'none'  (plus haut / plus petit / pas de points)
//  • scenario: booléen → demande un scénario / niveau de difficulté
// En compétitif on note par joueur (table + total), le vainqueur = meilleur score
// (ou le(s) joueur(s) coché(s) si « pas de points »). En coopératif, tout le groupe
// gagne/perd ensemble (+ score de groupe facultatif).

let pid = 0
const makePlayer = (name = '') => ({ id: ++pid, name, scores: {} })

// Champ « nom de joueur » avec auto-complétion maison (le <datalist> natif ne
// marche pas partout sur mobile). Partagé par tous les modes.
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

let tid = 0
const makeTeamRow = (t = {}) => {
  const size = t.size != null ? t.size : null
  const n = size && size > 0 ? size : 1
  return { id: ++tid, name: t.name || '', size, players: Array.from({ length: n }, () => makePlayer()), score: '', win: false }
}

export default function ScoreSheet({ game, template, playerNames = [], onSavePlay, saving, onEdit, onClose }) {
  const win = template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive')
  const scoring = template?.scoring || 'high'
  const wantScenario = !!template?.scenario
  const isCoop = win === 'coop'
  const noPoints = scoring === 'none'
  const teamsCfg = template?.teams
  const isTeams = !isCoop && !!teamsCfg?.on
  const predefined = (teamsCfg?.list || []).length > 0
  const cats = template?.categories ?? []
  const exts = template?.extensions ?? []

  const [activeExts, setActiveExts] = useState(() => new Set())
  const [players, setPlayers] = useState(() => [makePlayer(), makePlayer()])
  const [focusedPlayer, setFocusedPlayer] = useState(null)
  const [scenario, setScenario] = useState('')
  const [notes, setNotes] = useState(template?.notes || '')

  // Coopératif
  const [outcome, setOutcome] = useState(null) // 'win' | 'loss'
  const [groupScore, setGroupScore] = useState('')
  // Compétitif « pas de points » : id des vainqueurs cochés
  const [winnerIds, setWinnerIds] = useState(() => new Set())
  // En équipes
  const [teams, setTeams] = useState(() => {
    const list = teamsCfg?.list || []
    return (list.length ? list : [{}, {}]).map((t) => makeTeamRow(t))
  })
  const setTeamField = (id, field, val) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: val } : t)))
  const toggleTeamWin = (id) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, win: !t.win } : t)))
  const addTeam = () => setTeams((ts) => (ts.length < 8 ? [...ts, makeTeamRow()] : ts))
  const removeTeam = (id) => setTeams((ts) => (ts.length > 1 ? ts.filter((t) => t.id !== id) : ts))
  const addMember = (teamId) =>
    setTeams((ts) =>
      ts.map((t) => {
        if (t.id !== teamId) return t
        const cap = t.size && t.size > 0 ? t.size : 8
        return t.players.length < cap ? { ...t, players: [...t.players, makePlayer()] } : t
      })
    )
  const removeMember = (teamId, pid) =>
    setTeams((ts) =>
      ts.map((t) => (t.id === teamId && t.players.length > 1 ? { ...t, players: t.players.filter((p) => p.id !== pid) } : t))
    )
  const setMemberName = (teamId, pid, name) =>
    setTeams((ts) =>
      ts.map((t) => (t.id === teamId ? { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, name } : p)) } : t))
    )

  const visibleCats = useMemo(() => cats.filter((c) => !c.ext || activeExts.has(c.ext)), [cats, activeExts])

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
  const removePlayer = (playerId) => {
    setWinnerIds((s) => {
      const n = new Set(s)
      n.delete(playerId)
      return n
    })
    setPlayers((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== playerId) : ps))
  }
  const toggleWinner = (playerId) =>
    setWinnerIds((s) => {
      const n = new Set(s)
      if (n.has(playerId)) n.delete(playerId)
      else n.add(playerId)
      return n
    })

  const totalOf = (p) =>
    visibleCats.reduce((sum, c) => {
      const n = Number(p.scores[c.label])
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)

  const totals = players.map(totalOf)
  const anyScore = players.some((p) => Object.values(p.scores).some((v) => v !== '' && v != null))
  // Meilleur score selon le sens (plus haut / plus petit).
  const best = anyScore ? (scoring === 'low' ? Math.min(...totals) : Math.max(...totals)) : null

  const nameOf = (p, i) => (p.name || '').trim() || `Joueur ${i + 1}`
  const namesOf = () => players.map(nameOf)
  const scenarioVal = () => (wantScenario ? scenario.trim() || null : null)
  // La note voyage avec la partie ; App la persiste sur la fiche si elle a changé.
  const notesVal = () => notes

  // ----- Enregistrement selon le type -----
  const saveCoop = () => {
    if (!outcome) return
    const built = namesOf().map((name) => ({ name }))
    const s = Number(groupScore)
    onSavePlay({
      win: 'coop',
      players: built,
      outcome,
      scenario: scenarioVal(),
      score: !noPoints && groupScore.trim() !== '' && Number.isFinite(s) ? s : null,
      winner: outcome === 'win' ? built.map((b) => b.name).join(', ') : '',
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }

  const saveNoPoints = () => {
    if (!winnerIds.size) return
    const built = players.map((p, i) => ({ name: nameOf(p, i), winner: winnerIds.has(p.id) }))
    const winnerNames = built.filter((b) => b.winner).map((b) => b.name)
    onSavePlay({
      players: built.map((b) => ({ name: b.name })),
      winner: winnerNames.join(', '),
      scenario: scenarioVal(),
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }

  const saveScored = () => {
    const built = players.map((p, i) => {
      const scores = {}
      visibleCats.forEach((c) => {
        const v = p.scores[c.label]
        if (v !== '' && v != null && Number.isFinite(Number(v))) scores[c.label] = Number(v)
      })
      return { name: nameOf(p, i), total: totalOf(p), scores }
    })
    const extreme = scoring === 'low' ? Math.min(...built.map((b) => b.total)) : Math.max(...built.map((b) => b.total))
    const winners = built.filter((b) => b.total === extreme).map((b) => b.name)
    onSavePlay({ players: built, winner: winners.join(', '), scenario: scenarioVal(), extensions: [...activeExts], notes: notesVal() })
  }

  // Enregistre une partie EN ÉQUIPES. Le score d'équipe est copié sur chaque membre
  // (champ total), et les membres sont taggés avec le nom de leur équipe.
  const saveTeams = () => {
    const data = teams.map((t, ti) => {
      const tn = t.name.trim() || `Équipe ${ti + 1}`
      const s = Number(t.score)
      const scoreNum = !noPoints && t.score.trim() !== '' && Number.isFinite(s) ? s : null
      const members = t.players.map((p, i) => (p.name || '').trim() || `${tn} ${i + 1}`)
      return { tn, scoreNum, members, win: t.win }
    })
    let winnerTeams = []
    if (noPoints) {
      winnerTeams = data.filter((t) => t.win)
    } else {
      const scored = data.filter((t) => t.scoreNum != null)
      if (scored.length) {
        const extreme = scoring === 'low' ? Math.min(...scored.map((t) => t.scoreNum)) : Math.max(...scored.map((t) => t.scoreNum))
        winnerTeams = scored.filter((t) => t.scoreNum === extreme)
      }
    }
    const winnerSet = new Set(winnerTeams.map((t) => t.tn))
    const built = []
    data.forEach((t) => {
      t.members.forEach((name) => {
        const rec = { name, team: t.tn }
        if (!noPoints && t.scoreNum != null) rec.total = t.scoreNum
        built.push(rec)
      })
    })
    const winnerNames = built.filter((p) => winnerSet.has(p.team)).map((p) => p.name)
    onSavePlay({ players: built, winner: winnerNames.join(', '), scenario: scenarioVal(), extensions: [...activeExts], notes: notesVal() })
  }
  const canSaveTeams = noPoints ? teams.some((t) => t.win) : teams.some((t) => t.score.trim() !== '')

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
              <button key={name} type="button" className={`fchip ${activeExts.has(name) ? 'on' : ''}`} onClick={() => toggleExt(name)}>
                {name}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )

  const scenarioField = wantScenario && (
    <div className="field">
      <label className="field-label">🎯 Scénario / niveau <span className="field-opt">(facultatif)</span></label>
      <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="ex. Scénario 3, difficile…" />
    </div>
  )

  const notesField = (
    <div className="field">
      <label className="field-label">📝 Notes</label>
      <textarea
        className="notes-area"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rappels de règles, variante maison, précisions de score…"
        rows={2}
      />
    </div>
  )

  // Liste de noms de joueurs (utilisée en coop et en « pas de points »).
  const playerList = (withWinnerToggle) => (
    <div className="coop-players">
      {players.map((p, i) => (
        <div key={p.id} className="coop-player-row">
          {withWinnerToggle && (
            <button
              type="button"
              className={`win-toggle ${winnerIds.has(p.id) ? 'on' : ''}`}
              onClick={() => toggleWinner(p.id)}
              aria-label="Désigner vainqueur"
              title="Vainqueur"
            >
              🏆
            </button>
          )}
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
  )

  // ---------- COOPÉRATIF ----------
  if (isCoop) {
    return (
      <div className="sheet">
        {head}
        <div className="coop-form">
          {notesField}
          <div className="field">
            <label className="field-label">Résultat</label>
            <div className="chips">
              <button type="button" className={`fchip coop-win ${outcome === 'win' ? 'on' : ''}`} onClick={() => setOutcome('win')}>🏆 Gagné</button>
              <button type="button" className={`fchip coop-loss ${outcome === 'loss' ? 'on' : ''}`} onClick={() => setOutcome('loss')}>💀 Perdu</button>
            </div>
          </div>
          {scenarioField}
          {!noPoints && (
            <div className="field">
              <label className="field-label">🔢 Score du groupe <span className="field-opt">(facultatif)</span></label>
              <input className="input" type="number" inputMode="numeric" value={groupScore} onChange={(e) => setGroupScore(e.target.value)} placeholder="ex. 42" />
            </div>
          )}
          <div className="field">
            <label className="field-label">👥 Joueurs présents</label>
            {playerList(false)}
          </div>
        </div>
        {onSavePlay && (
          <div className="sheet-editor-actions">
            <button type="button" className="btn-primary" onClick={saveCoop} disabled={saving || !outcome}>
              {saving ? '…' : '💾 Enregistrer la partie'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---------- EN ÉQUIPES ----------
  if (isTeams) {
    return (
      <div className="sheet">
        {head}
        <div className="coop-form">
          {notesField}
          {scenarioField}
          {teams.map((t, ti) => (
            <div key={t.id} className="team-block">
              <div className="team-block-head">
                {noPoints && (
                  <button
                    type="button"
                    className={`win-toggle ${t.win ? 'on' : ''}`}
                    onClick={() => toggleTeamWin(t.id)}
                    aria-label="Équipe gagnante"
                    title="Équipe gagnante"
                  >🏆</button>
                )}
                {predefined ? (
                  <span className="team-name-fixed">{t.name || `Équipe ${ti + 1}`}</span>
                ) : (
                  <input
                    className="input team-name-input"
                    value={t.name}
                    onChange={(e) => setTeamField(t.id, 'name', e.target.value)}
                    placeholder={`Équipe ${ti + 1}`}
                  />
                )}
                {!noPoints && (
                  <input
                    className="input team-score-input"
                    type="number"
                    inputMode="numeric"
                    value={t.score}
                    onChange={(e) => setTeamField(t.id, 'score', e.target.value)}
                    placeholder="score"
                  />
                )}
                {!predefined && teams.length > 1 && (
                  <button type="button" className="sheet-del" onClick={() => removeTeam(t.id)} aria-label="Retirer l'équipe">×</button>
                )}
              </div>
              <div className="team-members">
                {t.players.map((p, i) => (
                  <div key={p.id} className="coop-player-row">
                    <NameField
                      id={p.id}
                      className="input"
                      value={p.name}
                      onChange={(v) => setMemberName(t.id, p.id, v)}
                      onPick={(n) => setMemberName(t.id, p.id, n)}
                      placeholder={`Joueur ${i + 1}`}
                      playerNames={playerNames}
                      focused={focusedPlayer}
                      setFocused={setFocusedPlayer}
                    />
                    {t.players.length > 1 && (
                      <button type="button" className="sheet-del" onClick={() => removeMember(t.id, p.id)} aria-label="Retirer ce joueur">×</button>
                    )}
                  </div>
                ))}
                {(!t.size || t.players.length < t.size) && t.players.length < 8 && (
                  <button type="button" className="btn-ghost coop-add" onClick={() => addMember(t.id)}>➕ Ajouter un joueur</button>
                )}
              </div>
            </div>
          ))}
          {!predefined && teams.length < 8 && (
            <button type="button" className="btn-ghost team-add" onClick={addTeam}>➕ Ajouter une équipe</button>
          )}
        </div>
        {onSavePlay && (
          <div className="sheet-editor-actions">
            <button type="button" className="btn-primary" onClick={saveTeams} disabled={saving || !canSaveTeams}>
              {saving ? '…' : '💾 Enregistrer la partie'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---------- COMPÉTITIF, PAS DE POINTS ----------
  if (noPoints) {
    return (
      <div className="sheet">
        {head}
        <div className="coop-form">
          {notesField}
          {scenarioField}
          <div className="field">
            <label className="field-label">Joueurs — coche le(s) vainqueur(s) 🏆</label>
            {playerList(true)}
          </div>
        </div>
        {onSavePlay && (
          <div className="sheet-editor-actions">
            <button type="button" className="btn-primary" onClick={saveNoPoints} disabled={saving || !winnerIds.size}>
              {saving ? '…' : '💾 Enregistrer la partie'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---------- COMPÉTITIF AVEC POINTS ----------
  return (
    <div className="sheet">
      {head}
      <div className="coop-form">{notesField}{scenarioField}</div>

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-cat-head">Catégorie</th>
              {players.map((p, i) => (
                <th key={p.id} className={best != null && totals[i] === best ? 'sheet-winner' : ''}>
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
                <td key={p.id} className={`sheet-total ${best != null && totals[i] === best ? 'sheet-winner' : ''}`}>
                  {best != null && totals[i] === best ? '🏆 ' : ''}
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
          <button type="button" className="btn-primary" onClick={saveScored} disabled={saving || !anyScore}>
            {saving ? '…' : '💾 Enregistrer la partie'}
          </button>
        </div>
      )}
    </div>
  )
}
