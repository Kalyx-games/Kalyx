import { lazy, Suspense, useMemo, useState } from 'react'
import { computePlayStats, playWinners } from '../lib/plays'

const ScoreTrend = lazy(() => import('./ScoreTrend'))

// Filtres des stats des parties (vide = tout).
const EMPTY_HFILTERS = { players: [], period: 'all', extensions: [], scenarios: [] }
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

function Tile({ value, label }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
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
  const [filters, setFilters] = useState(EMPTY_HFILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const allList = plays || []

  // Choix disponibles, dérivés des parties.
  const { allPlayers, allExts, allScenarios } = useMemo(() => {
    const pl = new Set()
    const ex = new Set()
    const sc = new Set()
    allList.forEach((p) => {
      ;(p.players || []).forEach((x) => { const n = (x?.name || '').trim(); if (n) pl.add(n) })
      ;(p.extensions || []).forEach((e) => e && ex.add(e))
      if (p.scenario && p.scenario.trim()) sc.add(p.scenario.trim())
    })
    const s = (a) => [...a].sort((x, y) => x.localeCompare(y, 'fr'))
    return { allPlayers: s(pl), allExts: s(ex), allScenarios: s(sc) }
  }, [allList])

  // Borne de période (début du mois / de l'année en cours).
  const periodStart = useMemo(() => {
    if (filters.period === 'all') return null
    const now = new Date()
    return filters.period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      : new Date(now.getFullYear(), 0, 1).getTime()
  }, [filters.period])

  const filtered = useMemo(
    () =>
      allList.filter((p) => {
        if (filters.players.length && !(p.players || []).some((x) => filters.players.includes((x?.name || '').trim()))) return false
        if (periodStart != null && !(Date.parse(p.played_at) >= periodStart)) return false
        if (filters.extensions.length && !(p.extensions || []).some((e) => filters.extensions.includes(e))) return false
        if (filters.scenarios.length && !(p.scenario && filters.scenarios.includes(p.scenario.trim()))) return false
        return true
      }),
    [allList, filters, periodStart]
  )

  const stats = useMemo(() => computePlayStats(filtered, scoring), [filtered, scoring])
  const activeFilters =
    filters.players.length + filters.extensions.length + filters.scenarios.length + (filters.period !== 'all' ? 1 : 0)
  const toggleIn = (key, val) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }))

  return (
    <div className="sheet">
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
          {/* Bouton + panneau de filtres (masqués s'il n'y a rien à filtrer). */}
          {(allPlayers.length > 0 || allExts.length > 0 || allScenarios.length > 0 || allList.length > 1) && (
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
                  {allPlayers.length > 0 && (
                    <div className="filter-group">
                      <span className="filter-label">👥 Joueur</span>
                      <div className="chips">
                        {allPlayers.map((p) => (
                          <button key={p} type="button" className={`fchip ${filters.players.includes(p) ? 'on' : ''}`} onClick={() => toggleIn('players', p)}>{p}</button>
                        ))}
                      </div>
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
                  {allExts.length > 0 && (
                    <div className="filter-group">
                      <span className="filter-label">🧩 Extension</span>
                      <div className="chips">
                        {allExts.map((e) => (
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
                  {activeFilters > 0 && (
                    <button type="button" className="filter-reset" onClick={() => setFilters(EMPTY_HFILTERS)}>Réinitialiser les filtres</button>
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
            <Tile value={stats.total} label={stats.total > 1 ? 'parties jouées' : 'partie jouée'} />
            {isCoop && (
              <Tile value={stats.winRate != null ? `${stats.winRate} %` : '—'} label="taux de victoire" />
            )}
            {!noPoints && stats.scores.length > 0 && (
              <>
                <Tile value={stats.maxScore} label="meilleur score" />
                {!isCoop && <Tile value={stats.avgScore ?? '—'} label="score moyen" />}
              </>
            )}
          </div>

          {/* Podium : joueurs classés par victoires + taux de victoire + nb de parties.
              Tableau → colonnes alignées (largeur = plus gros contenu) + scroll latéral
              si trop large sur un petit écran (aucune info coupée). */}
          {stats.byPlayer.length > 0 && (
            <section className="stat-block">
              <h3 className="stat-block-title">🏆 Podium</h3>
              <div className="table-scroll">
                <table className="stat-table podium-table">
                  <tbody>
                    {stats.byPlayer.map((p) => (
                      <tr key={p.name} className={p.rank <= 3 ? 'top' : ''}>
                        <td className="rank">{['🥇', '🥈', '🥉'][p.rank - 1] || `${p.rank}e`}</td>
                        <td className="name">{p.name}</td>
                        <td className="num">{p.wins} 🏆</td>
                        <td className="num rate">{p.winRate} %</td>
                        <td className="num">{p.games} 🎮</td>
                      </tr>
                    ))}
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

          {/* Moyenne & record par joueur (jeux à points). */}
          {!noPoints && stats.hasScores && stats.byPlayer.some((p) => p.avg != null) && (
            <section className="stat-block">
              <h3 className="stat-block-title">📊 Moyenne &amp; record</h3>
              <div className="table-scroll">
                <table className="stat-table">
                  <thead>
                    <tr>
                      <th className="name">Joueur</th>
                      <th className="num">Moyenne</th>
                      <th className="num">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byPlayer
                      .filter((p) => p.avg != null)
                      .map((p) => (
                        <tr key={p.name}>
                          <td className="name">{p.name}</td>
                          <td className="num">{p.avg}</td>
                          <td className="num best">{p.best}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Évolution des scores dans le temps (se masque tout seul si &lt; 2 parties). */}
          {!noPoints && (
            <Suspense fallback={null}>
              <ScoreTrend plays={filtered} scoring={scoring} />
            </Suspense>
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
                        {(pl.scenario || pl.score != null) && (
                          <div className="hist-coop-meta">
                            {pl.scenario ? <span>🎯 {pl.scenario}</span> : null}
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
                        {pl.scenario && <div className="hist-coop-meta"><span>🎯 {pl.scenario}</span></div>}
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
                        {pl.scenario && <div className="hist-coop-meta"><span>🎯 {pl.scenario}</span></div>}
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
