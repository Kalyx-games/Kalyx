import { useEffect, useRef } from 'react'
import { StatsIcon, CollectionIcon, WishlistIcon } from './icons'
import { mou } from '../lib/geste'

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
  const pastilleRef = useRef(null)

  // La pastille PENCHE vers l'onglet où l'on va, pendant que le doigt glisse.
  // ⚠️ elle penche donc à CONTRE-SENS du doigt : glisser vers la gauche mène à l'onglet de
  // DROITE (mécanique du carrousel, déjà en place). Elle annonce la destination, elle ne
  // singe pas le doigt — sinon elle partirait du côté opposé à celui où elle va se poser.
  // Elle ne franchit jamais la moitié du pas : c'est un aperçu, pas une arrivée anticipée.
  const penche = (px) => {
    const el = pastilleRef.current
    if (!el) return
    // pendant le geste la pastille colle au doigt (transition coupée) ; au relâché on rend
    // la main à la transition, qui emmène l'aperçu ET le changement d'onglet d'un seul trait.
    el.style.transition = px === null ? '' : 'none'
    el.style.setProperty('--kx-glisse', (px === null ? 0 : px) + 'px')
  }

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
      if (dragging) {
        e.preventDefault()
        const el = pastilleRef.current
        const pas = el ? el.getBoundingClientRect().width + 12 : 0
        const i = idxRef.current
        // vers où l'on irait si on lâchait maintenant — et s'il y a quelqu'un là-bas
        const vers = dx < 0 ? 1 : -1
        const voisin = i >= 0 && i + vers >= 0 && i + vers < TABS.length
        const plafond = voisin ? pas * 0.5 : 0
        const d = Math.abs(dx)
        const glisse = d <= plafond ? d : plafond + mou(d - plafond, 0.4, 70)
        penche(vers * glisse)
      }
    }
    const onEnd = (e) => {
      if (!dragging) return
      dragging = false
      penche(null) // la pastille se pose
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
        <span
          className="navbar-pill"
          ref={pastilleRef}
          style={{ transform: `translateX(calc(${activeIndex} * (100% + 12px) + var(--kx-glisse, 0px)))` }}
        />
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
