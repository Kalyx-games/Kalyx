import { useState } from 'react'
import { parseExtensions } from '../lib/games'

// Éditeur d'une fiche de score : on définit les catégories (nom + explication +
// éventuelle extension qui les apporte) et, si le jeu a des extensions enregistrées,
// lesquelles modifient le score. Sert à corriger une fiche générée OU à en créer une.

let cid = 0
const mkCat = (c = {}) => ({ id: ++cid, label: c.label || '', hint: c.hint || '', ext: c.ext || '' })
let teid = 0
const mkTeam = (t = {}) => ({ id: ++teid, name: t.name || '', size: t.size != null ? String(t.size) : '' })

export default function ScoreSheetEditor({ game, template, online, onSave, onClose }) {
  const isNew = !template
  // Extensions ENREGISTRÉES pour ce jeu (choix possibles).
  const availableExts = parseExtensions(game?.extensions).map((e) => e.name).filter(Boolean)

  // Type de partie (options composables).
  const [win, setWin] = useState(() => template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive'))
  const [scoring, setScoring] = useState(() => template?.scoring || 'high')
  const [scenario, setScenario] = useState(() => !!template?.scenario)
  const [teamsOn, setTeamsOn] = useState(() => !!template?.teams?.on)
  const [teamList, setTeamList] = useState(() => (template?.teams?.list || []).map(mkTeam))
  const isCoop = win === 'coop'
  // Catégories de score : en compétitif (détail par joueur) OU en coop (détail du score
  // du groupe), tant qu'il y a des points et hors équipes (là le score est par équipe).
  const catsRelevant = !teamsOn && scoring !== 'none'
  const [cats, setCats] = useState(() => (template?.categories || []).map(mkCat))

  const addTeam = () => setTeamList((t) => [...t, mkTeam()])
  const updTeam = (id, field, val) => setTeamList((t) => t.map((x) => (x.id === id ? { ...x, [field]: val } : x)))
  const delTeam = (id) => setTeamList((t) => t.filter((x) => x.id !== id))
  // Extensions qui modifient le score (sous-ensemble des extensions enregistrées).
  const [exts, setExts] = useState(() =>
    (template?.extensions || []).filter((n) => availableExts.includes(n))
  )
  // Extensions cochées par défaut (saisie d'une partie + filtre des stats) : LISTE des
  // extensions à cocher. Compat : ancien 'all' → toutes, 'none'/absent → aucune.
  const [extDefault, setExtDefault] = useState(() => {
    const d = template?.extDefault
    if (Array.isArray(d)) return d.filter((n) => availableExts.includes(n))
    if (d === 'all') return [...availableExts]
    return []
  })
  const toggleExtDefault = (n) =>
    setExtDefault((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))
  const [notes, setNotes] = useState(() => template?.notes || '')
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
    // Pas d'obligation de catégorie : sans catégorie, la saisie d'une partie affiche
    // un champ « Points » par défaut (voir ScoreSheet).
    const teams = {
      on: teamsOn,
      list: teamList
        .map((t) => ({ name: t.name.trim(), size: t.size.trim() !== '' && Number(t.size) > 0 ? Number(t.size) : null }))
        .filter((t) => t.name),
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(game.id, { win, scoring, scenario, teams, notes: notes.trim(), categories, extensions: extList, extDefault })
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
        <h3>Type de partie</h3>

        <label className="field-label">Qui gagne</label>
        <div className="chips">
          <button type="button" className={`fchip ${!isCoop ? 'on' : ''}`} onClick={() => setWin('competitive')}>
            🏅 Compétitif
          </button>
          <button type="button" className={`fchip ${isCoop ? 'on' : ''}`} onClick={() => setWin('coop')}>
            🤝 Coopératif
          </button>
        </div>

        <label className="field-label" style={{ marginTop: 14 }}>Comment on départage</label>
        <div className="chips">
          <button type="button" className={`fchip ${scoring === 'high' ? 'on' : ''}`} onClick={() => setScoring('high')}>
            ⬆️ Plus haut score
          </button>
          <button type="button" className={`fchip ${scoring === 'low' ? 'on' : ''}`} onClick={() => setScoring('low')}>
            ⬇️ Plus petit score
          </button>
          <button type="button" className={`fchip ${scoring === 'none' ? 'on' : ''}`} onClick={() => setScoring('none')}>
            🏁 Pas de points
          </button>
        </div>

        <label className="filter-check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={scenario} onChange={(e) => setScenario(e.target.checked)} />
          <span>🎯 Demander un scénario / niveau de difficulté</span>
        </label>

        {!isCoop && (
          <label className="filter-check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={teamsOn} onChange={(e) => setTeamsOn(e.target.checked)} />
            <span>🧑‍🤝‍🧑 En équipes</span>
          </label>
        )}

        <p className="field-hint" style={{ marginTop: 10 }}>
          {isCoop
            ? 'Tout le groupe gagne ou perd ensemble.'
            : scoring === 'none'
              ? 'Pas de points : on désigne simplement le(s) vainqueur(s).'
              : 'Chacun marque ses points.'}
        </p>
      </section>

      {teamsOn && !isCoop && (
        <section className="settings-card">
          <h3>Équipes</h3>
          <p className="field-hint" style={{ marginBottom: 10 }}>
            Définis les équipes à l'avance (avec un effectif si tu veux), ou laisse vide pour les créer au moment de la partie.
          </p>
          {teamList.map((t) => (
            <div key={t.id} className="team-edit">
              <input
                className="cat-edit-label"
                value={t.name}
                onChange={(e) => updTeam(t.id, 'name', e.target.value)}
                placeholder="Nom de l'équipe"
              />
              <input
                className="team-size"
                type="number"
                inputMode="numeric"
                min="1"
                value={t.size}
                onChange={(e) => updTeam(t.id, 'size', e.target.value)}
                placeholder="effectif"
              />
              <button type="button" className="ext-row-x" onClick={() => delTeam(t.id)} aria-label="Retirer l'équipe">×</button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={addTeam}>➕ Ajouter une équipe</button>
        </section>
      )}

      {availableExts.length > 0 && (
        <section className="settings-card">
          <h3>Extensions</h3>

          {/* Réglage TOUJOURS présent (dès que le jeu a des extensions) : on choisit
              lesquelles sont cochées par défaut (à la saisie d'une partie + filtre stats). */}
          <label className="field-label">Cochées par défaut</label>
          <p className="field-hint" style={{ margin: '2px 0 8px' }}>
            À l'ouverture d'une partie et dans le filtre des stats.
          </p>
          <div className="chips">
            {availableExts.map((n) => (
              <button key={n} type="button" className={`fchip ${extDefault.includes(n) ? 'on' : ''}`} onClick={() => toggleExtDefault(n)}>{n}</button>
            ))}
          </div>

          {/* Extensions qui modifient le score : seulement quand il y a des points. */}
          {scoring !== 'none' && (
            <>
              <label className="field-label" style={{ marginTop: 16 }}>Qui modifient le score</label>
              {exts.length === 0 && (
                <p className="field-hint" style={{ margin: '2px 0 8px' }}>Aucune pour l'instant.</p>
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
            </>
          )}
        </section>
      )}

      {catsRelevant && (
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

      <section className="settings-card">
        <h3>📝 Notes</h3>
        <p className="field-hint" style={{ marginBottom: 8 }}>
          Affichées (et modifiables) à chaque partie.
        </p>
        <textarea
          className="notes-area"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ex. Départage : joueur avec le plus de cartes. Variante maison : on retire les Léviathans."
          rows={4}
        />
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
