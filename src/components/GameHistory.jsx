import { useMemo, useState } from 'react'
import { computePlayStats, computeEntityStats, playWinners } from '../lib/plays'
import { effectivePlayersSet } from '../lib/games'
import SortMenu from './SortMenu'

// Filtres des stats des parties (vide = tout).
const EMPTY_HFILTERS = { players: [], period: 'all', extensions: [], scenarios: [], counts: [] }
// Les deux « entités » spéciales du tableau comparatif (sinon = un nom de joueur).
const ALL = '__all__'
const REGULARS = '__regulars__'
const PERIODS = [
  { value: 'all', label: 'Tout' },
  { value: 'year', label: 'Cette année' },
  { value: 'month', label: 'Ce mois-ci' },
]

// Historique des parties d'un jeu : stats en haut (total, victoires/parties par
// joueur, meilleur/moyen score) puis la liste des parties. Bouton « Nouvelle partie ».

function playDate(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// Tuile de stat. Si `holder` est fourni (qui détient ce score), la tuile se retourne
// au clic pour l'afficher — sinon c'est une simple boîte.
function Tile({ value, label, holder }) {
  const [flipped, setFlipped] = useState(false)
  if (!holder) {
    return (
      <div className="stat-tile">
        <div className="stat-tile-value">{value}</div>
        <div className="stat-tile-label">{label}</div>
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`stat-tile-flip ${flipped ? 'flipped' : ''}`}
      onClick={() => setFlipped((f) => !f)}
      aria-label={flipped ? `${label} : ${holder}` : `Voir qui détient ce ${label}`}
      title={flipped ? 'Revenir au score' : 'Voir qui détient ce score'}
    >
      <span className="tile-inner">
        <span className="tile-face stat-tile">
          <span className="stat-tile-value">{value}</span>
          <span className="stat-tile-label">{label}</span>
        </span>
        <span className="tile-face tile-back stat-tile">
          <span className="tile-holder-icon">🏆</span>
          <span className="tile-holder-name">{holder}</span>
        </span>
      </span>
    </button>
  )
}

export default function GameHistory({ game, plays, template, online, onNewPlay, onEditPlay, onEditSheet, onDeletePlay, onClose }) {
  const win = template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive')
  const scoring = template?.scoring || 'high'
  const isCoop = win === 'coop'
  const noPoints = scoring === 'none'
  const loading = plays == null
  const [showPlays, setShowPlays] = useState(false) // liste des parties repliée par défaut

  // --- Filtres des stats (joueur / période / extension / scénario) ---
  // RIEN n'est coché par défaut → toutes les parties comptent (une sélection vide = pas
  // de filtre). Le réglage « extensions cochées par défaut » de la fiche ne sert QU'À la
  // saisie d'une partie : ici, il cachait silencieusement les parties en jeu de base.
  const [filters, setFilters] = useState(() => ({ ...EMPTY_HFILTERS }))
  const [showFilters, setShowFilters] = useState(false)
  const [showOccasional, setShowOccasional] = useState(false)
  const allList = plays || []

  // Nombres de joueurs POSSIBLES pour ce jeu (extensions comprises) — ex. 2, 3, 4.
  // C'est la plage du jeu, pas seulement les configurations déjà jouées.
  const gameCounts = useMemo(() => (game ? effectivePlayersSet(game) : []), [game])

  // Extensions / scénarios / nombres de joueurs disponibles au filtrage.
  const { allExts, allScenarios, allCounts } = useMemo(() => {
    const ex = new Set()
    const sc = new Set()
    const ct = new Set(gameCounts)
    allList.forEach((p) => {
      ;(p.extensions || []).forEach((e) => e && ex.add(e))
      if (p.scenario && p.scenario.trim()) sc.add(p.scenario.trim())
      const n = (p.players || []).length
      if (n) ct.add(n) // une partie hors plage (ex. variante) reste filtrable
    })
    const s = (a) => [...a].sort((x, y) => x.localeCompare(y, 'fr'))
    return { allExts: s(ex), allScenarios: s(sc), allCounts: [...ct].sort((a, b) => a - b) }
  }, [allList, gameCounts])

  // Joueurs : nb de parties par joueur (sur TOUTES les parties du jeu), triés par
  // parties décroissantes puis alpha. « Occasionnels » = ≤ ¼ du plus assidu (repliés).
  // Aucun joueur n'est coché par défaut → toutes les parties comptent (sélection vide
  // = pas de filtre) ; cocher sert à restreindre les stats à ces joueurs.
  const { regulars, occasional } = useMemo(() => {
    const g = {}
    allList.forEach((p) =>
      (p.players || []).forEach((x) => {
        const n = (x?.name || '').trim()
        if (n) g[n] = (g[n] || 0) + 1
      })
    )
    const rows = Object.entries(g)
      .map(([name, games]) => ({ name, games }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'fr'))
    const maxGames = rows.length ? rows[0].games : 0
    return {
      regulars: rows.filter((r) => r.games * 4 > maxGames),
      occasional: rows.filter((r) => r.games * 4 <= maxGames),
    }
  }, [allList])

  // Borne de période (début du mois / de l'année en cours).
  const periodStart = useMemo(() => {
    if (filters.period === 'all') return null
    const now = new Date()
    return filters.period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      : new Date(now.getFullYear(), 0, 1).getTime()
  }, [filters.period])

  // Parties filtrées par période / extension / scénario / nb de joueurs (pas encore par joueur).
  const prePlayer = useMemo(
    () =>
      allList.filter((p) => {
        if (periodStart != null && !(Date.parse(p.played_at) >= periodStart)) return false
        if (filters.extensions.length && !(p.extensions || []).some((e) => filters.extensions.includes(e))) return false
        if (filters.scenarios.length && !(p.scenario && filters.scenarios.includes(p.scenario.trim()))) return false
        if (filters.counts.length && !filters.counts.includes((p.players || []).length)) return false
        return true
      }),
    [allList, filters.extensions, filters.scenarios, filters.counts, periodStart]
  )
  // + filtre joueur : on ne garde que les parties impliquant un joueur coché.
  const filtered = useMemo(
    () =>
      filters.players.length
        ? prePlayer.filter((p) => (p.players || []).some((x) => filters.players.includes((x?.name || '').trim())))
        : prePlayer,
    [prePlayer, filters.players]
  )

  // Classement / moyenne : seuls les joueurs cochés (aucun coché = tout le monde).
  const stats = useMemo(() => computePlayStats(filtered, scoring, filters.players), [filtered, scoring, filters.players])
  // Colonnes moyenne/record : seulement si le jeu a des points ET qu'il y en a d'enregistrés.
  const showScores = !noPoints && stats.hasScores && stats.byPlayer.some((p) => p.avg != null)

  // Classement : réguliers visibles, occasionnels repliés (même règle que les filtres).
  const [showOccStats, setShowOccStats] = useState(false)
  const regularPlayers = stats.byPlayer.filter((p) => !p.occasional)
  const occPlayers = stats.byPlayer.filter((p) => p.occasional)
  // Les médailles restent aux joueurs réguliers : un occasionnel ne monte pas sur le
  // podium (il garde son rang chiffré, à la suite).
  const playerRow = (p) => (
    <tr key={p.name} className={!p.occasional && p.rank <= 3 ? 'top' : ''}>
      <td className="rank">{(!p.occasional && ['🥇', '🥈', '🥉'][p.rank - 1]) || `${p.rank}e`}</td>
      <td className="name">
        <button type="button" className="player-link" onClick={() => filterOnPlayer(p.name)} title={`Ne voir que ${p.name}`}>
          {p.name}
        </button>
      </td>
      <td className="num rate">{p.winRate} %</td>
      <td className="num">{p.wins}</td>
      <td className="num">{p.games}</td>
      {showScores && <td className="num">{p.avg != null ? p.avg : '—'}</td>}
      {showScores && <td className="num best">{p.best != null ? p.best : '—'}</td>}
    </tr>
  )

  // ---- Tableau comparatif (2 entités : un joueur, les réguliers, ou tout le monde) ----
  // Il ne suit PAS le filtre « Joueur » : il a ses propres sélecteurs. Il respecte en
  // revanche les autres filtres (période, extension…) → il part de `prePlayer`.
  const regularNames = useMemo(() => regulars.map((r) => r.name), [regulars])
  const allPlayerNames = useMemo(() => [...regulars, ...occasional].map((r) => r.name), [regulars, occasional])
  const entityNames = (key) => (key === ALL ? allPlayerNames : key === REGULARS ? regularNames : [key])
  const entityOptions = useMemo(
    () => [
      { value: ALL, label: 'Tout le monde' },
      ...(regularNames.length > 1 ? [{ value: REGULARS, label: 'Joueurs réguliers' }] : []),
      ...allPlayerNames.map((n) => ({ value: n, label: n })),
    ],
    [regularNames, allPlayerNames]
  )
  // Meilleur joueur = 1er du classement, hors filtre joueur → sert de défaut à droite.
  const bestPlayer = useMemo(() => computePlayStats(prePlayer, scoring).byPlayer[0]?.name || null, [prePlayer, scoring])
  const [cmp, setCmp] = useState({ left: null, right: null })
  // Défaut : les réguliers (groupés) face au meilleur joueur.
  const cmpLeft = cmp.left ?? (regularNames.length > 1 ? REGULARS : ALL)
  const cmpRight = cmp.right ?? (bestPlayer || ALL)
  const cmpA = useMemo(() => computeEntityStats(prePlayer, scoring, entityNames(cmpLeft)), [prePlayer, scoring, cmpLeft, allPlayerNames, regularNames])
  const cmpB = useMemo(() => computeEntityStats(prePlayer, scoring, entityNames(cmpRight)), [prePlayer, scoring, cmpRight, allPlayerNames, regularNames])
  const showCmpScores = !noPoints && (cmpA.avg != null || cmpB.avg != null)

  // Catégories comparées : celles de la fiche (dans son ordre), hors valeur fixe (une
  // constante n'a rien à comparer), puis celles qui ne sont plus dans la fiche.
  const cmpCats = useMemo(() => {
    const tcats = template?.categories || []
    const fixed = new Set(tcats.filter((c) => c.value != null).map((c) => c.label))
    const order = tcats.map((c) => c.label).filter((n) => !fixed.has(n))
    const seen = new Set([...Object.keys(cmpA.byCategory), ...Object.keys(cmpB.byCategory)])
    const extra = [...seen].filter((n) => !fixed.has(n) && !order.includes(n)).sort((a, b) => a.localeCompare(b, 'fr'))
    return [...order.filter((n) => seen.has(n)), ...extra]
  }, [template, cmpA, cmpB])
  // Le filtre est-il exactement « les réguliers » ? (état du raccourci)
  const onlyRegulars =
    regularNames.length > 1 &&
    filters.players.length === regularNames.length &&
    regularNames.every((n) => filters.players.includes(n))
  // Clic sur un nom dans le classement → filtre sur lui seul (re-clic = tout le monde).
  const filterOnPlayer = (name) =>
    setFilters((f) => ({ ...f, players: f.players.length === 1 && f.players[0] === name ? [] : [name] }))

  // Vert = meilleur, rouge = moins bon, gris = égalité (ou rien à comparer).
  const scoreDir = scoring === 'low' ? 'low' : 'high'
  const cmpClasses = (a, b, dir) => {
    if (a == null || b == null || a === b) return ['cmp-tie', 'cmp-tie']
    const aBetter = dir === 'low' ? a < b : a > b
    return aBetter ? ['cmp-good', 'cmp-bad'] : ['cmp-bad', 'cmp-good']
  }
  // Une ligne du comparatif. `colored:false` → gris (ex. victoires/parties : un groupe en
  // a forcément plus qu'un joueur, le colorer ne voudrait rien dire).
  const cmpRow = (label, a, b, { colored = true, dir = 'high', fmt = (v) => (v == null ? '—' : v), subA, subB } = {}) => {
    const [ca, cb] = colored ? cmpClasses(a, b, dir) : ['cmp-tie', 'cmp-tie']
    return (
      <tr key={label}>
        <th className="cmp-label" scope="row">{label}</th>
        <td className={`cmp-cell ${ca}`}>
          <span className="cmp-val">{fmt(a)}</span>
          {subA ? <span className="cmp-range">{subA}</span> : null}
        </td>
        <td className={`cmp-cell ${cb}`}>
          <span className="cmp-val">{fmt(b)}</span>
          {subB ? <span className="cmp-range">{subB}</span> : null}
        </td>
      </tr>
    )
  }

  // Nb de filtres « actifs » = tout ce qui est coché (le défaut est vide partout).
  const activeFilters =
    (filters.period !== 'all' ? 1 : 0) +
    (filters.scenarios.length ? 1 : 0) +
    (filters.counts.length ? 1 : 0) +
    (filters.extensions.length ? 1 : 0) +
    (filters.players.length ? 1 : 0)
  const resetFilters = () => setFilters({ ...EMPTY_HFILTERS })
  // Chips extension = celles réellement utilisées dans les parties (filtrer sur une
  // extension jamais jouée ne renverrait rien).
  const extChips = allExts
  const toggleIn = (key, val) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }))

  return (
    <div className="sheet hist-sheet">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2 className="sheet-title">📚 {game?.name}</h2>
        {onEditSheet && (
          <button type="button" className="back-btn sheet-edit-btn" onClick={onEditSheet} disabled={!online} title={online ? 'Modifier la fiche' : 'Indisponible hors ligne'} aria-label="Modifier la fiche">✏️</button>
        )}
      </div>

      <div className="hist-newplay">
        <button type="button" className="btn-primary" onClick={onNewPlay} disabled={!online}>
          🎲 Nouvelle partie
        </button>
      </div>

      {loading ? (
        <p className="field-hint" style={{ padding: 16 }}>Chargement…</p>
      ) : allList.length === 0 ? (
        <p className="empty" style={{ padding: 24 }}>
          Aucune partie enregistrée pour l'instant.
        </p>
      ) : (
        <>
          {/* Bouton + panneau de filtres. */}
          {(regulars.length + occasional.length > 0 || allExts.length > 0 || allScenarios.length > 0) && (
            <div className="hist-filters">
              <button
                type="button"
                className={`filter-toggle ${activeFilters ? 'active' : ''}`}
                onClick={() => setShowFilters((s) => !s)}
                aria-expanded={showFilters}
              >
                Filtres
                {activeFilters > 0 && <span className="filter-badge">{activeFilters}</span>}
                <span className={`filter-chev ${showFilters ? 'up' : ''}`}>▾</span>
              </button>
              {showFilters && (
                <div className="filters">
                  {regulars.length + occasional.length > 0 && (
                    <div className="filter-group">
                      <span className="filter-label">👥 Joueur</span>
                      {/* Raccourcis : tout le monde (= aucun filtre) ou les réguliers. */}
                      <div className="chips" style={{ marginBottom: 8 }}>
                        <button
                          type="button"
                          className={`fchip ${filters.players.length === 0 ? 'on' : ''}`}
                          onClick={() => setFilters((f) => ({ ...f, players: [] }))}
                        >
                          Tout le monde
                        </button>
                        {regularNames.length > 1 && (
                          <button
                            type="button"
                            className={`fchip ${onlyRegulars ? 'on' : ''}`}
                            onClick={() => setFilters((f) => ({ ...f, players: onlyRegulars ? [] : [...regularNames] }))}
                          >
                            Joueurs réguliers
                          </button>
                        )}
                      </div>
                      <div className="chips">
                        {regulars.map((r) => (
                          <button key={r.name} type="button" className={`fchip ${filters.players.includes(r.name) ? 'on' : ''}`} onClick={() => toggleIn('players', r.name)}>{r.name}</button>
                        ))}
                      </div>
                      {occasional.length > 0 && (
                        <>
                          <button type="button" className="occ-toggle" onClick={() => setShowOccasional((s) => !s)} aria-expanded={showOccasional}>
                            Joueurs occasionnels ({occasional.length})
                            <span className={`filter-chev ${showOccasional ? 'up' : ''}`}>▾</span>
                          </button>
                          {showOccasional && (
                            <div className="chips" style={{ marginTop: 8 }}>
                              {occasional.map((r) => (
                                <button key={r.name} type="button" className={`fchip ${filters.players.includes(r.name) ? 'on' : ''}`} onClick={() => toggleIn('players', r.name)}>{r.name}</button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="filter-group">
                    <span className="filter-label">🗓️ Période</span>
                    <div className="chips">
                      {PERIODS.map((pd) => (
                        <button key={pd.value} type="button" className={`fchip ${filters.period === pd.value ? 'on' : ''}`} onClick={() => setFilters((f) => ({ ...f, period: pd.value }))}>{pd.label}</button>
                      ))}
                    </div>
                  </div>
                  {extChips.length > 0 && (
                    <div className="filter-group">
                      <span className="filter-label">🧩 Extension</span>
                      <div className="chips">
                        {extChips.map((e) => (
                          <button key={e} type="button" className={`fchip ${filters.extensions.includes(e) ? 'on' : ''}`} onClick={() => toggleIn('extensions', e)}>{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {allScenarios.length > 0 && (
                    <div className="filter-group">
                      <span className="filter-label">🎯 Scénario / niveau</span>
                      <div className="chips">
                        {allScenarios.map((s) => (
                          <button key={s} type="button" className={`fchip ${filters.scenarios.includes(s) ? 'on' : ''}`} onClick={() => toggleIn('scenarios', s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {allCounts.length > 1 && (
                    <div className="filter-group">
                      <span className="filter-label">👥 Nombre de joueurs</span>
                      <div className="chips">
                        {allCounts.map((n) => (
                          <button key={n} type="button" className={`fchip ${filters.counts.includes(n) ? 'on' : ''}`} onClick={() => toggleIn('counts', n)}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeFilters > 0 && (
                    <button type="button" className="filter-reset" onClick={resetFilters}>Réinitialiser les filtres</button>
                  )}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="empty" style={{ padding: 24 }}>Aucune partie ne correspond aux filtres.</p>
          ) : (
          <>
          <div className="stat-tiles">
            {/* Pas de tuile « parties jouées » : le bouton dépliant en bas l'indique déjà. */}
            {isCoop && (
              <Tile value={stats.winRate != null ? `${stats.winRate} %` : '—'} label="taux de victoire" />
            )}
            {!noPoints && stats.scores.length > 0 && (
              <>
                <Tile value={stats.maxScore} label="meilleur score" holder={stats.bestScoreBy.join(' · ') || null} />
                {!isCoop && <Tile value={stats.avgScore ?? '—'} label="score moyen" />}
              </>
            )}
          </div>

          {/* Joueurs : tout au même endroit — classement par taux de victoire et, si le jeu
              a des points, moyenne & record. Les joueurs occasionnels sont repliés (sinon
              une seule partie gagnée = 100 % = 1er en permanence). Tableau → colonnes
              alignées + scroll latéral sur petit écran (aucune info coupée). */}
          {stats.byPlayer.length > 0 && (
            <section className="stat-block">
              <h3 className="stat-block-title">🏆 Joueurs</h3>
              <div className="table-scroll">
                <table className="stat-table podium-table">
                  <thead>
                    <tr>
                      <th />
                      <th className="name">Joueur</th>
                      <th className="num" title="Taux de victoire">%</th>
                      <th className="num" title="Victoires">🏆</th>
                      <th className="num" title="Parties jouées">🎮</th>
                      {showScores && <th className="num">Moyenne</th>}
                      {showScores && <th className="num">Record</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {regularPlayers.map(playerRow)}
                    {occPlayers.length > 0 && (
                      <tr>
                        <td className="occ-cell" colSpan={showScores ? 7 : 5}>
                          <button
                            type="button"
                            className="occ-toggle"
                            onClick={() => setShowOccStats((v) => !v)}
                            aria-expanded={showOccStats}
                          >
                            Joueurs occasionnels ({occPlayers.length})
                            <span className={`hist-toggle-chev ${showOccStats ? 'up' : ''}`}>▾</span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {showOccStats && occPlayers.map(playerRow)}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Taux de victoire par scénario (jeux coopératifs à scénarios/niveaux). */}
          {isCoop && stats.byScenario.length > 0 && (
            <section className="stat-block">
              <h3 className="stat-block-title">🎯 Victoires par scénario</h3>
              <div className="scenario-bars">
                {stats.byScenario.map((s) => (
                  <div key={s.scenario} className="scenario-row">
                    <div className="scenario-head">
                      <span className="scenario-name">{s.scenario}</span>
                      <span className="scenario-val">{s.winRate} % <span className="scenario-sub">({s.wins}/{s.games})</span></span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${s.winRate}%`, background: '#16a34a' }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Répartition des victoires par déclencheur (jeux à victoire directe). */}
          {stats.byTrigger.length > 0 && (
            <section className="stat-block">
              <h3 className="stat-block-title">🏁 Fins de partie</h3>
              <div className="scenario-bars">
                {stats.byTrigger.map((t) => {
                  const maxC = stats.byTrigger[0].count || 1
                  return (
                    <div key={t.trigger} className="scenario-row">
                      <div className="scenario-head">
                        <span className="scenario-name">{t.trigger}</span>
                        <span className="scenario-val">{t.count} <span className="scenario-sub">partie{t.count > 1 ? 's' : ''}</span></span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.round((t.count / maxC) * 100)}%`, background: '#8b5cf6' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Comparatif : deux entités au choix (un joueur, les réguliers, tout le monde).
              Absorbe les stats par catégorie (moyenne en gros, min–max en dessous). */}
          {allPlayerNames.length > 0 && (
            <section className="stat-block">
              <h3 className="stat-block-title">⚖️ Comparaison</h3>
              <div className="cmp-heads">
                <SortMenu
                  value={cmpLeft}
                  options={entityOptions.filter((o) => o.value !== cmpRight)}
                  onChange={(v) => setCmp((c) => ({ ...c, left: v }))}
                  arrows={false}
                />
                <span className="cmp-vs">vs</span>
                <SortMenu
                  value={cmpRight}
                  options={entityOptions.filter((o) => o.value !== cmpLeft)}
                  onChange={(v) => setCmp((c) => ({ ...c, right: v }))}
                  arrows={false}
                />
              </div>
              <table className="stat-table cmp-table">
                <tbody>
                  {cmpRow('Taux de victoire', cmpA.winRate, cmpB.winRate, { fmt: (v) => `${v} %` })}
                  {cmpRow('Victoires', cmpA.wins, cmpB.wins, { colored: false })}
                  {cmpRow('Parties', cmpA.games, cmpB.games, { colored: false })}
                  {/* Une seule catégorie → sa moyenne EST le score moyen : ligne redondante, masquée. */}
                  {showCmpScores && cmpCats.length !== 1 && cmpRow('Score moyen', cmpA.avg, cmpB.avg, { dir: scoreDir })}
                  {showCmpScores && cmpRow('Meilleur score', cmpA.best, cmpB.best, { dir: scoreDir })}
                  {showCmpScores &&
                    cmpCats.map((cat) => {
                      const a = cmpA.byCategory[cat]
                      const b = cmpB.byCategory[cat]
                      return cmpRow(cat, a?.avg ?? null, b?.avg ?? null, {
                        dir: scoreDir,
                        subA: a ? `${a.min}–${a.max}` : null,
                        subB: b ? `${b.min}–${b.max}` : null,
                      })
                    })}
                </tbody>
              </table>
            </section>
          )}

          <section className="stat-block">
            <button type="button" className="hist-toggle" onClick={() => setShowPlays((v) => !v)} aria-expanded={showPlays}>
              <span>🗓️ {showPlays ? 'Masquer' : 'Voir'} les {stats.total} partie{stats.total > 1 ? 's' : ''}</span>
              <span className={`hist-toggle-chev ${showPlays ? 'up' : ''}`}>▾</span>
            </button>
            {showPlays && (
            <div className="hist-list">
              {filtered.map((pl) => {
                const coop = !!pl.outcome
                const teamPlay = !coop && (pl.players || []).some((p) => p && p.team)
                const ranked = [...(pl.players || [])].sort((a, b) =>
                  scoring === 'low' ? (a.total ?? 0) - (b.total ?? 0) : (b.total ?? 0) - (a.total ?? 0)
                )
                const winners = new Set(playWinners(pl)) // gère l'égalité, le coop, les équipes, « pas de points »
                // Regroupe les joueurs par équipe (en conservant l'ordre d'apparition).
                const teamGroups = teamPlay
                  ? (pl.players || []).reduce((acc, p) => {
                      const key = p.team || '—'
                      let g = acc.find((x) => x.name === key)
                      if (!g) { g = { name: key, score: p.total, members: [] }; acc.push(g) }
                      g.members.push(p.name)
                      return acc
                    }, [])
                  : []
                if (teamPlay) {
                  teamGroups.sort((a, b) =>
                    a.score == null || b.score == null
                      ? 0
                      : scoring === 'low'
                        ? (a.score ?? 0) - (b.score ?? 0)
                        : (b.score ?? 0) - (a.score ?? 0)
                  )
                }
                return (
                  <div
                    key={pl.id}
                    className={`hist-row ${onEditPlay ? 'clickable' : ''}`}
                    onClick={onEditPlay ? () => onEditPlay(pl) : undefined}
                    title={onEditPlay ? 'Modifier cette partie' : undefined}
                  >
                    <div className="hist-row-head">
                      <span className="hist-date">{playDate(pl.played_at)}</span>
                      {coop && (
                        <span className={`coop-badge ${pl.outcome === 'win' ? 'win' : 'loss'}`}>
                          {pl.outcome === 'win' ? '🏆 Gagné' : '💀 Perdu'}
                        </span>
                      )}
                      {onDeletePlay && (
                        <button type="button" className="hist-del" onClick={(e) => { e.stopPropagation(); onDeletePlay(pl) }} disabled={!online} title={online ? 'Supprimer cette partie' : 'Indisponible hors ligne'} aria-label="Supprimer cette partie">🗑️</button>
                      )}
                    </div>
                    {coop ? (
                      <>
                        {(pl.scenario || pl.trigger || pl.score != null) && (
                          <div className="hist-coop-meta">
                            {pl.scenario ? <span>🎯 {pl.scenario}</span> : null}
                            {pl.trigger ? <span>🏁 {pl.trigger}</span> : null}
                            {pl.score != null ? <span>🔢 {pl.score} pts</span> : null}
                          </div>
                        )}
                        {pl.extensions && pl.extensions.length > 0 && (
                          <div className="hist-ext">🧩 {pl.extensions.join(', ')}</div>
                        )}
                        <div className="hist-coop-players">
                          👥 {(pl.players || []).map((p) => p.name).join(', ')}
                        </div>
                      </>
                    ) : teamPlay ? (
                      <>
                        {(pl.scenario || pl.trigger) && (
                          <div className="hist-coop-meta">
                            {pl.scenario ? <span>🎯 {pl.scenario}</span> : null}
                            {pl.trigger ? <span>🏁 {pl.trigger}</span> : null}
                          </div>
                        )}
                        {pl.extensions && pl.extensions.length > 0 && (
                          <div className="hist-ext">🧩 {pl.extensions.join(', ')}</div>
                        )}
                        <div className="hist-players">
                          {teamGroups.map((g, i) => {
                            const isWin = g.members.some((m) => winners.has((m || '').trim()))
                            return (
                              <div key={i} className={`hist-team ${isWin ? 'hist-winner' : ''}`}>
                                <div className="hist-team-head">
                                  <span className="hist-player-name">{isWin ? '🏆 ' : ''}{g.name}</span>
                                  {!noPoints && g.score != null && <span className="hist-player-score">{g.score}</span>}
                                </div>
                                <div className="hist-team-members">{g.members.join(', ')}</div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        {(pl.scenario || pl.trigger) && (
                          <div className="hist-coop-meta">
                            {pl.scenario ? <span>🎯 {pl.scenario}</span> : null}
                            {pl.trigger ? <span>🏁 {pl.trigger}</span> : null}
                          </div>
                        )}
                        {pl.extensions && pl.extensions.length > 0 && (
                          <div className="hist-ext">🧩 {pl.extensions.join(', ')}</div>
                        )}
                        <div className="hist-players">
                          {ranked.map((p, i) => (
                            <div key={i} className={`hist-player ${winners.has((p.name || '').trim()) ? 'hist-winner' : ''}`}>
                              <span className="hist-player-name">{winners.has((p.name || '').trim()) ? '🏆 ' : ''}{p.name}</span>
                              {!noPoints && <span className="hist-player-score">{p.total}</span>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {pl.notes && <div className="hist-note">{pl.notes}</div>}
                  </div>
                )
              })}
            </div>
            )}
          </section>
          </>
          )}
        </>
      )}
    </div>
  )
}
