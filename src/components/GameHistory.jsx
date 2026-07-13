import { useMemo } from 'react'
import { computePlayStats } from '../lib/plays'

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

export default function GameHistory({ game, plays, online, onNewPlay, onEditSheet, onDeletePlay, onClose }) {
  const stats = useMemo(() => computePlayStats(plays || []), [plays])
  const loading = plays == null

  return (
    <div className="sheet">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2 className="sheet-title">📚 {game?.name}</h2>
        {onEditSheet && (
          <button type="button" className="back-btn sheet-edit-btn" onClick={onEditSheet} title="Modifier la fiche" aria-label="Modifier la fiche">✏️</button>
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
          Aucune partie enregistrée pour l'instant. Lance une « Nouvelle partie » pour commencer l'historique.
        </p>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile value={stats.total} label={stats.total > 1 ? 'parties jouées' : 'partie jouée'} />
            <Tile value={stats.maxScore} label="meilleur score" />
            <Tile value={stats.avgScore ?? '—'} label="score moyen" />
          </div>

          <BarBlock title="🏆 Victoires par joueur" rows={stats.byPlayer.filter((p) => p.wins > 0)} valueKey="wins" color="#eab308" />
          <BarBlock title="🎮 Parties par joueur" rows={stats.byPlayer} valueKey="games" color="#2f6df6" />

          <section className="stat-block">
            <h3 className="stat-block-title">🗓️ Parties</h3>
            <div className="hist-list">
              {plays.map((pl) => {
                const ranked = [...(pl.players || [])].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
                return (
                  <div key={pl.id} className="hist-row">
                    <div className="hist-row-head">
                      <span className="hist-date">{playDate(pl.played_at)}</span>
                      {onDeletePlay && (
                        <button type="button" className="hist-del" onClick={() => onDeletePlay(pl)} aria-label="Supprimer cette partie">🗑️</button>
                      )}
                    </div>
                    {pl.extensions && pl.extensions.length > 0 && (
                      <div className="hist-ext">🧩 {pl.extensions.join(', ')}</div>
                    )}
                    <div className="hist-players">
                      {ranked.map((p, i) => (
                        <div key={i} className={`hist-player ${pl.winner && p.name === pl.winner ? 'hist-winner' : ''}`}>
                          <span className="hist-player-name">{pl.winner && p.name === pl.winner ? '🏆 ' : ''}{p.name}</span>
                          <span className="hist-player-score">{p.total}</span>
                        </div>
                      ))}
                    </div>
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
