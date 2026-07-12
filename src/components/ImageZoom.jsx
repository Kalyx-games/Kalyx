import { useState } from 'react'

// Affiche une image en grand par-dessus toute l'app (lightbox). Un clic n'importe où
// la ferme, avec une animation d'ouverture et de fermeture douce.
export default function ImageZoom({ src, onClose }) {
  const [closing, setClosing] = useState(false)

  const close = () => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onClose()
      return
    }
    setClosing(true)
    setTimeout(onClose, 200) // laisse jouer l'animation de fermeture
  }

  return (
    <div className={`lightbox ${closing ? 'closing' : ''}`} onClick={close} role="dialog" aria-label="Image agrandie">
      <img className="lightbox-img" src={src} alt="" onClick={close} />
    </div>
  )
}
