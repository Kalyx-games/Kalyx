import { useEffect, useRef, useState } from 'react'

// Menu de tri "maison" : un bouton propre qui ouvre une petite liste d'options
// (le menu déroulant natif <select> était peu esthétique).
export default function SortMenu({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  // Fermer si on clique en dehors, ou avec la touche Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="sortmenu" ref={ref}>
      <button type="button" className="sortmenu-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="sortmenu-arrows">↕</span>
        <span>{current.label}</span>
        <span className={`sortmenu-chev ${open ? 'up' : ''}`}>▾</span>
      </button>
      {open && (
        <ul className="sortmenu-list" role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={o.value === value ? 'active' : ''}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
                {o.value === value ? <span className="check">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
