import { useRef } from 'react'

// Double slider (min–max) pensé pour le tactile :
// on touche/glisse n'importe où sur la barre → la poignée la plus proche suit.
// Pas besoin de viser précisément le petit rond.
export default function RangeSlider({ min, max, step = 1, value, onChange, format = (v) => String(v) }) {
  const [lo, hi] = value
  const barRef = useRef(null)
  const active = useRef(null) // 'lo' | 'hi' | null

  const clamp = (v) => Math.max(min, Math.min(max, v))
  const snap = (v) => clamp(Math.round(v / step) * step)
  const valueAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect()
    const ratio = r.width ? (clientX - r.left) / r.width : 0
    return snap(min + ratio * (max - min))
  }
  const apply = (which, v) => {
    if (which === 'lo') onChange([Math.min(v, hi), hi])
    else onChange([lo, Math.max(v, lo)])
  }
  // Choisit la poignée à bouger selon l'endroit touché.
  const pickThumb = (v) => {
    if (v <= lo) return 'lo'
    if (v >= hi) return 'hi'
    return v - lo <= hi - v ? 'lo' : 'hi'
  }

  const onPointerDown = (e) => {
    const v = valueAt(e.clientX)
    active.current = pickThumb(v)
    apply(active.current, v)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // rien
    }
    e.preventDefault()
  }
  const onPointerMove = (e) => {
    if (!active.current) return
    apply(active.current, valueAt(e.clientX))
  }
  const onPointerUp = (e) => {
    if (!active.current) return
    active.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // rien
    }
  }

  const loPct = ((lo - min) / (max - min)) * 100
  const hiPct = ((hi - min) / (max - min)) * 100

  return (
    <div className="rs">
      <div className="rs-value">{lo === hi ? format(lo) : `${format(lo)} – ${format(hi)}`}</div>
      <div
        className="rs-bar"
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="rs-track" />
        <div className="rs-fill" style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }} />
        <div className="rs-thumb" style={{ left: `${loPct}%` }} />
        <div className="rs-thumb" style={{ left: `${hiPct}%` }} />
      </div>
    </div>
  )
}
