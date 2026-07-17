import { useMemo, useState } from 'react'
import { computeStats } from '../lib/stats'
import SortMenu from './SortMenu'

// Écran Statistiques : chiffres clés + répartitions en barres horizontales.
// Tout est calculé sur la COLLECTION (jeux possédés) déjà filtrée par les filtres
// partagés (les mêmes que l'onglet Collection) — d'où l'absence de filtre propre ici.

const PLAYERS_COLOR = '#2f6df6' // bleu (cohérent avec 👥 sur les cartes)
const OPTIMAL_COLOR = '#eab308' // or (cohérent avec ⭐ « idéal » sur les cartes)
const DURATION_COLOR = '#0d9488' // sarcelle
const COMPLEXITY_COLOR = '#6366f1' // indigo (cohérent avec 🧠 sur les cartes)

// Une ligne de barre horizontale : libellé · piste remplie · valeur.
function BarRow({ label, sub, count, max, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="bar-row">
      <div className="bar-label">
        {label}
        {sub ? <span className="bar-sub"> {sub}</span> : null}
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="bar-val">{count}</div>
    </div>
  )
}

// Un bloc « carte » contenant un titre et une liste de barres.
function BarBlock({ title, rows, color, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  const anyData = rows.some((r) => r.count > 0)
  return (
    <section className="stat-block">
      <h3 className="stat-block-title">{title}</h3>
      {anyData ? (
        <div className="bars">
          {rows.map((r) => (
            <BarRow key={r.key} label={r.label} sub={r.sub} count={r.count} max={max} color={r.color || color} />
          ))}
        </div>
      ) : (
        <p className="stat-empty-line">{empty}</p>
      )}
    </section>
  )
}

function Tile({ value, label, sub }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
      {sub ? <div className="stat-tile-sub">{sub}</div> : null}
    </div>
  )
}

// Section « Joueur » : choisir un joueur → son bilan global (toutes parties, tous jeux).
// `playerOverall` = [{name, games, wins, winRate}] trié par nb de parties (le + assidu 1er).
function PlayerSection({ playerOverall }) {
  const list = playerOverall || []
  const [selected, setSelected] = useState(null)
  if (list.length === 0) return null // pas encore de partie enregistrée → section masquée
  const current = list.find((p) => p.name === selected) || list[0] // défaut : le + de parties
  return (
    <section className="stat-block">
      <h3 className="stat-block-title">🏆 Bilan d'un joueur</h3>
      <SortMenu
        value={current.name}
        options={list.map((p) => ({ value: p.name, label: p.name }))}
        onChange={setSelected}
        arrows={false}
      />
      <div className="stat-tiles" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.winRate} %</div>
          <div className="stat-tile-label">taux de victoire</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.games}</div>
          <div className="stat-tile-label">{current.games > 1 ? 'parties jouées' : 'partie jouée'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.wins}</div>
          <div className="stat-tile-label">{current.wins > 1 ? 'parties gagnées' : 'partie gagnée'}</div>
        </div>
      </div>
    </section>
  )
}

export default function Stats({ games, ownerMap, hasCollection, playerOverall }) {
  const s = useMemo(() => computeStats(games, ownerMap), [games, ownerMap])

  // Aucun jeu de collection à afficher : soit la collection est vraiment vide,
  // soit les filtres actifs excluent tout (message différent pour ne pas induire en erreur).
  const noCollectionShown = (games ?? []).every((g) => g.status === 'wishlist')

  if (noCollectionShown) {
    return (
      <div className="empty stats-empty">
        <p className="empty-emoji">📊</p>
        {hasCollection ? (
          <>
            <p>Aucun jeu ne correspond à tes filtres.</p>
            <p className="muted">Modifie ou réinitialise les filtres pour voir les statistiques.</p>
          </>
        ) : (
          <>
            <p>Ta collection est vide pour l'instant.</p>
            <p className="muted">Ajoute des jeux : les statistiques apparaîtront ici.</p>
          </>
        )}
      </div>
    )
  }

  const fmt1 = (n) => (n != null ? n.toFixed(1) : '—')

  return (
    <div className="stats">
      <div className="stat-tiles">
        <Tile value={s.total} label={s.total > 1 ? 'jeux en collection' : 'jeu en collection'} />
        <Tile value={s.wishlistCount} label="en wishlist" />
        <Tile
          value={s.avgDuration != null ? `${s.avgDuration} min` : '—'}
          label="durée moyenne"
          sub={s.medDuration != null ? `médiane ${s.medDuration} min` : null}
        />
        <Tile
          value={fmt1(s.avgComplexity)}
          label="complexité moyenne"
          sub={s.medComplexity != null ? `médiane ${fmt1(s.medComplexity)}` : null}
        />
      </div>

      <PlayerSection playerOverall={playerOverall} />

      <BarBlock
        title="👥 Par nombre de joueurs"
        color={PLAYERS_COLOR}
        empty="Aucune donnée de joueurs."
        rows={s.byPlayers.map((r) => ({ key: r.n, label: r.label, count: r.count }))}
      />

      <BarBlock
        title="⭐ Par nombre de joueurs idéal"
        color={OPTIMAL_COLOR}
        empty="Aucun nombre idéal renseigné."
        rows={s.byOptimalPlayers.map((r) => ({ key: r.n, label: r.label, count: r.count }))}
      />

      <BarBlock
        title="🕑 Par durée"
        color={DURATION_COLOR}
        empty="Aucune durée renseignée."
        rows={s.byDuration.map((r) => ({ key: r.label, label: r.label, count: r.count }))}
      />

      <BarBlock
        title="🧠 Par complexité"
        color={COMPLEXITY_COLOR}
        empty="Aucune complexité renseignée."
        rows={s.byComplexity.map((r) => ({ key: r.label, label: r.label, sub: r.hint, count: r.count }))}
      />
    </div>
  )
}
