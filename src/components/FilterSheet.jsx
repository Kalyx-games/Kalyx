import { useEffect } from 'react'
import Filters from './Filters'

// Menu FLOTTANT des filtres (bottom sheet), ouvert par le bouton flottant. Partagé par la
// liste/les stats ET les tierlists. Pas d'en-tête (on gagne de la place) ; les actions
// « Réinitialiser » / « Voir les N jeux » sont collées EN BAS (près du pouce). Tant qu'il est
// ouvert, l'arrière-plan ne défile plus (verrouillage du scroll de la page).
export default function FilterSheet({
  owners, tags, filters, setFilters, showPrice, showTags,
  resetCount = 0, visibleCount, onReset, onClose,
}) {
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

  return (
    <div className="modal-backdrop filter-backdrop" onClick={onClose}>
      <div className="filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-body">
          <Filters owners={owners} tags={tags} filters={filters} setFilters={setFilters} showPrice={showPrice} showTags={showTags} />
        </div>
        <div className="filter-sheet-actions">
          <button type="button" className="filters-reset-top" onClick={onReset} disabled={!resetCount}>
            ↺ Réinitialiser{resetCount ? ` (${resetCount})` : ''}
          </button>
          <button type="button" className="filters-see" onClick={onClose}>
            {typeof visibleCount === 'number'
              ? `Voir les ${visibleCount} jeu${visibleCount > 1 ? 'x' : ''}`
              : 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  )
}
