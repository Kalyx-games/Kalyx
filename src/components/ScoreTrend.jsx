// Petite courbe d'évolution des scores partie après partie (SVG léger, pas de lib).
// Une ligne par joueur (jeux à points individuels/équipes), ou une ligne « groupe »
// (coop avec score). Palette catégorielle VALIDÉE (script dataviz, clair + sombre) :
// lisible pour les daltoniens, contraste OK sur les deux fonds.

const SERIES = ['#2f6df6', '#ea580c', '#16a34a', '#8b5cf6', '#db2777', '#0d9488']
const MAX_SERIES = 6

const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

export default function ScoreTrend({ plays, scoring = 'high' }) {
  const chron = [...(plays || [])].reverse() // plays = plus récent d'abord → on remet dans l'ordre
  const n = chron.length

  // Séries par joueur (ordre de première apparition = couleur stable).
  const order = []
  const pts = {}
  chron.forEach((p, i) => {
    ;(p.players || []).forEach((pl) => {
      const t = Number(pl?.total)
      if (!Number.isFinite(t) || pl?.total == null) return
      const nm = (pl?.name || '').trim() || '—'
      if (!pts[nm]) { pts[nm] = []; order.push(nm) }
      pts[nm].push({ x: i, y: t })
    })
  })

  let series
  let hiddenCount = 0
  if (order.length) {
    hiddenCount = Math.max(0, order.length - MAX_SERIES)
    series = order.slice(0, MAX_SERIES).map((nm, k) => ({ name: nm, color: SERIES[k], points: pts[nm] }))
  } else {
    // Repli : score du groupe (coop) → une seule ligne.
    const gp = []
    chron.forEach((p, i) => {
      const s = Number(p.score)
      if (Number.isFinite(s) && p.score != null) gp.push({ x: i, y: s })
    })
    series = gp.length ? [{ name: 'Score du groupe', color: SERIES[0], points: gp }] : []
  }

  // Il faut au moins 2 parties pour une tendance.
  if (!series.length || n < 2) return null

  const W = 320
  const H = 148
  const padL = 30
  const padR = 30 // place pour l'étiquette du dernier point
  const padT = 12
  const padB = 16
  const xAt = (i) => padL + (i / (n - 1)) * (W - padL - padR)
  const allY = series.flatMap((s) => s.points.map((pt) => pt.y))
  let minY = Math.min(...allY)
  let maxY = Math.max(...allY)
  if (minY === maxY) { minY -= 1; maxY += 1 }
  const yAt = (y) => padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB)

  const gridYs = [maxY, Math.round((maxY + minY) / 2), minY]
  const multi = series.length > 1

  return (
    <section className="stat-block">
      <h3 className="stat-block-title">📈 Évolution des scores</h3>
      <div className="trend-wrap">
        <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Courbe des scores au fil des parties">
          {/* Lignes de repère + graduations Y (discrètes) */}
          {gridYs.map((gy, k) => (
            <g key={k}>
              <line x1={padL} y1={yAt(gy)} x2={W - padR} y2={yAt(gy)} className="trend-grid" />
              <text x={padL - 6} y={yAt(gy) + 3} className="trend-axis" textAnchor="end">{gy}</text>
            </g>
          ))}
          {series.map((s) => (
            <g key={s.name}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={s.points.map((pt) => `${xAt(pt.x)},${yAt(pt.y)}`).join(' ')}
              />
              {s.points.map((pt, k) => (
                <circle key={k} cx={xAt(pt.x)} cy={yAt(pt.y)} r="4" fill={s.color} className="trend-dot">
                  <title>{`${s.name} · ${pt.y}`}</title>
                </circle>
              ))}
              {/* Étiquette directe au dernier point (identité sans dépendre de la seule couleur) */}
              {(() => {
                const last = s.points[s.points.length - 1]
                return (
                  <text x={xAt(last.x) + 7} y={yAt(last.y) + 3} className="trend-label" fill={s.color}>
                    {multi ? initials(s.name) : s.name}
                  </text>
                )
              })()}
            </g>
          ))}
        </svg>
      </div>
      {multi && (
        <div className="trend-legend">
          {series.map((s) => (
            <span key={s.name} className="trend-legend-item">
              <span className="trend-legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {hiddenCount > 0 && <p className="field-hint">+{hiddenCount} joueur{hiddenCount > 1 ? 's' : ''} non affiché{hiddenCount > 1 ? 's' : ''} (6 max).</p>}
    </section>
  )
}
