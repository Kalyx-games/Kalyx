import { useEffect, useRef } from 'react'
import { StatsIcon, CollectionIcon, WishlistIcon } from './icons'

// Barre d'onglets fixée en bas : Stats · Collection · Wishlist (tailles égales).
// L'onglet actif est mis en avant dynamiquement (pastille glissante + zoom via le CSS).
// On peut aussi GLISSER horizontalement sur la barre pour changer d'onglet.
const TABS = [
  { key: 'stats', label: 'Stats', Icon: StatsIcon },
  { key: 'collection', label: 'Collection', Icon: CollectionIcon },
  { key: 'wishlist', label: 'Wishlist', Icon: WishlistIcon },
]

export default function NavBar({ view, onChange }) {
  const activeIndex = TABS.findIndex((t) => t.key === view)
  const navRef = useRef(null)
  const idxRef = useRef(activeIndex)
  idxRef.current = activeIndex
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const swipedRef = useRef(false) // vrai juste après un glissé → neutralise le clic de fin de geste

  // Glissé horizontal sur la barre → onglet voisin. Écouteurs tactiles natifs non-passifs.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    let x = 0, y = 0, dragging = false
    const onStart = (e) => { const t = e.touches[0]; x = t.clientX; y = t.clientY; dragging = false }
    const onMove = (e) => {
      const t = e.touches[0]
      const dx = t.clientX - x
      const dy = t.clientY - y
      if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 4) dragging = true
      if (dragging) e.preventDefault()
    }
    const onEnd = (e) => {
      if (!dragging) return
      dragging = false
      // Le drapeau se pose AVANT le seuil : un glissé trop court ne doit pas se transformer
      // en tap, sinon il ouvrirait Chwazi par accident.
      swipedRef.current = true
      setTimeout(() => { swipedRef.current = false }, 220)
      const dx = e.changedTouches[0].clientX - x
      if (Math.abs(dx) < 45) return
      const i = idxRef.current
      if (i < 0) return // aucun onglet actif (ex. Réglages ouverts) → on ne fait rien
      const next = dx < 0 ? Math.min(TABS.length - 1, i + 1) : Math.max(0, i - 1)
      if (next !== i) {
        onChangeRef.current(TABS[next].key)
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  return (
    <nav className="navbar" ref={navRef}>
      {activeIndex >= 0 && (
        <span className="navbar-pill" style={{ transform: `translateX(calc(${activeIndex} * (100% + 12px)))` }} />
      )}
      {TABS.map(({ key, label, Icon }) => (
        <button
          type="button"
          key={key}
          className={`navtab navtab-${key} ${view === key ? 'active' : ''}`}
          onClick={() => { if (swipedRef.current) return; onChange(key) }}
          aria-current={view === key ? 'page' : undefined}
        >
          <Icon size={24} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
