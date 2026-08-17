import { useEffect, useRef, useState } from 'react'

// Menu FLOTTANT des filtres (bottom sheet), ouvert par le bouton flottant. CHROME générique
// partagé par la collection/les stats, les tierlists ET l'historique/stats d'un jeu : il
// n'impose PAS le contenu — on lui passe les groupes de filtres en `children`. Pas d'en-tête
// (gain de place) ; POIGNÉE en haut + glissé vers le bas pour fermer (comme l'ajout d'un jeu) ;
// actions « Réinitialiser » / « Voir les N … » collées EN BAS ; arrière-plan figé quand ouvert.
export default function FilterSheet({ children, resetCount = 0, visibleLabel, onReset, onClose, closeRef }) {
  const [dragY, setDragY] = useState(0)
  const [closing, setClosing] = useState(false)
  const draggingRef = useRef(false)
  const sheetRef = useRef(null)
  const scrollRef = useRef(null)

  // Fermeture animée (la feuille glisse vers le bas), sauf si l'utilisateur préfère moins
  // d'animations.
  const requestCloseRef = useRef(null)
  requestCloseRef.current = () => {
    if (closing) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onClose()
      return
    }
    setClosing(true)
    setTimeout(() => onClose(), 260)
  }
  const requestClose = () => requestCloseRef.current()
  // Le bouton RETOUR d'Android (géré par App) doit fermer AVEC l'animation (glissé vers le bas).
  // Effet sans deps = ré-exposé à chaque rendu, remis à null au démontage (robuste StrictMode).
  useEffect(() => {
    if (!closeRef) return
    closeRef.current = requestCloseRef.current
    return () => { closeRef.current = null }
  })

  // Verrouille le défilement de la page tant que le menu est ouvert.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevH = html.style.overflow
    const prevB = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevH
      body.style.overflow = prevB
    }
  }, [])

  // Glissé-pour-fermer depuis N'IMPORTE OÙ sur la feuille (écouteurs tactiles NATIFS
  // non-passifs, seuls capables de bloquer le défilement). On n'engage le glissé que si on
  // part de la poignée, OU si la zone de filtres est déjà tout en haut ; un geste parti d'un
  // curseur de prix (.rs) ne ferme pas (il ajuste le curseur).
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    let startY = 0
    let decided = false
    let fromGrip = false
    let fromNested = false
    let curDy = 0
    const onTS = (e) => {
      if (e.touches.length !== 1) return
      startY = e.touches[0].clientY
      draggingRef.current = false
      decided = false
      curDy = 0
      fromGrip = Boolean(e.target.closest && e.target.closest('.modal-grip'))
      fromNested = Boolean(e.target.closest && e.target.closest('.rs'))
    }
    const onTM = (e) => {
      if (e.touches.length !== 1) return
      const dy = e.touches[0].clientY - startY
      if (!decided) {
        if (Math.abs(dy) < 6) return
        const atTop = (scrollRef.current ? scrollRef.current.scrollTop : 0) <= 0
        decided = true
        draggingRef.current = dy > 0 && !fromNested && (fromGrip || atTop)
      }
      if (draggingRef.current) {
        e.preventDefault() // bloque le défilement natif pendant le glissé de fermeture
        curDy = dy > 0 ? dy : 0
        setDragY(curDy)
      }
    }
    const onTE = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        if (curDy > 110) requestCloseRef.current()
        else setDragY(0)
      }
      decided = false
    }
    el.addEventListener('touchstart', onTS, { passive: true })
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE)
    el.addEventListener('touchcancel', onTE)
    return () => {
      el.removeEventListener('touchstart', onTS)
      el.removeEventListener('touchmove', onTM)
      el.removeEventListener('touchend', onTE)
      el.removeEventListener('touchcancel', onTE)
    }
  }, [])

  return (
    <div
      className="modal-backdrop filter-backdrop"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 0.26s ease' }}
      onClick={requestClose}
    >
      <div
        ref={sheetRef}
        className={`filter-sheet ${closing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: closing
            ? `translateY(${typeof window !== 'undefined' ? window.innerHeight : 800}px)`
            : dragY
            ? `translateY(${dragY}px)`
            : undefined,
          transition: draggingRef.current ? 'none' : 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="modal-grip" aria-hidden="true" />
        <div className="filter-sheet-body" ref={scrollRef}>
          {children}
        </div>
        <div className="filter-sheet-actions">
          <button type="button" className="filters-reset-top" onClick={onReset} disabled={!resetCount}>
            ↺ Réinitialiser{resetCount ? ` (${resetCount})` : ''}
          </button>
          <button type="button" className="filters-see" onClick={requestClose}>
            {visibleLabel || 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  )
}
