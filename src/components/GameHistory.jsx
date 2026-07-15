import { useMemo } from 'react'
import { computePlayStats, playWinners } from '../lib/plays'

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

function BarBlock({ title, rows, valueKey, color }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]))
  if (!rows.length) return null
  return (
    <section className="stat-block">
      <h3 className="stat-block-title">{title}</h3>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.name} className="bar-row">
            <div className="bar-label">{r.name}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(r[valueKey] / max) * 100}%`, background: color }} />
            </div>
            <div className="bar-val">{r[valueKey]}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function GameHistory({ game, plays, template, online, onNewPlay, onEditSheet, onDeletePlay, onClose }) {
  const win = template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive')
  const scoring = template?.scoring || 'high'
  const isCoop = win === 'coop'
  const noPoints = scoring === 'none'
  const stats = useMemo(() => computePlayStats(plays || [], scoring), [plays, scoring])
  const loading = plays == null

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
      ) : stats.total === 0 ? (
        <p className="empty" style={{ padding: 24 }}>
          Aucune partie enregistrée pour l'instant.
        </p>
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

          <BarBlock title="🏆 Victoires par joueur" rows={stats.byPlayer.filter((p) => p.wins > 0)} valueKey="wins" color="#eab308" />
          <BarBlock title="🎮 Parties par joueur" rows={stats.byPlayer} valueKey="games" color="#2f6df6" />

          <section className="stat-block">
            <h3 className="stat-block-title">🗓️ Parties</h3>
            <div className="hist-list">
              {plays.map((pl) => {
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
                  <div key={pl.id} className="hist-row">
                    <div className="hist-row-head">
                      <span className="hist-date">{playDate(pl.played_at)}</span>
                      {coop && (
                        <span className={`coop-badge ${pl.outcome === 'win' ? 'win' : 'loss'}`}>
                          {pl.outcome === 'win' ? '🏆 Gagné' : '💀 Perdu'}
                        </span>
                      )}
                      {onDeletePlay && (
                        <button type="button" className="hist-del" onClick={() => onDeletePlay(pl)} disabled={!online} title={online ? 'Supprimer cette partie' : 'Indisponible hors ligne'} aria-label="Supprimer cette partie">🗑️</button>
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
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
