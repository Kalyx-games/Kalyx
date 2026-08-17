import { useState, useRef, useEffect } from 'react'

// Anime la FERMETURE d'un écran plein écran : quand `value` passe à null/false, on garde l'écran
// monté (avec `closing=true`) le temps de l'animation de sortie, puis on le démonte. On mémorise la
// dernière valeur non nulle (`value`) pour que le composant garde ses données pendant la sortie.
// Respecte prefers-reduced-motion (démontage immédiat, sans animation).
//
// ⚠️ `closing` est calculé PENDANT le rendu (pattern React « ajuster l'état quand une prop change »),
// PAS dans un effet passif : sinon, au rendu où `value` devient null, `mounted` vaudrait false une
// frame → l'écran serait démonté puis REMONTÉ (flash possible + réinitialisation de l'état interne de
// l'enfant). Ici `mounted` reste true en continu : l'écran n'est jamais démonté avant la fin de l'anim.
//
// Renvoie { mounted, closing, value } :
//   - mounted : rendre le composant ou non (true pendant l'ouverture ET la fermeture animée)
//   - closing : appliquer la classe .closing (déclenche l'anim de sortie)
//   - value   : la valeur courante, ou la dernière connue pendant la fermeture
export function useExitLayer(value, ms = 240) {
  const [closing, setClosing] = useState(false)
  const [prev, setPrev] = useState(value)
  const last = useRef(value)
  if (value) last.current = value

  if (prev !== value) {
    setPrev(value)
    if (value) {
      if (closing) setClosing(false) // (ré)ouverture pendant une fermeture → on annule la sortie
    } else if (prev) {
      // Fermeture (valeur non nulle → null). En reduced-motion : pas d'anim → démontage immédiat.
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduce) setClosing(true)
    }
  }

  // Fin de l'animation de sortie → démontage réel.
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => setClosing(false), ms)
    return () => clearTimeout(t)
  }, [closing, ms])

  return { mounted: !!value || closing, closing, value: value || last.current }
}
