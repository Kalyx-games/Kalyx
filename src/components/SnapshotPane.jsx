import { useLayoutEffect, useRef } from 'react'

// Rend un INSTANTANÉ figé (nœud DOM cloné) dans un conteneur — sert aux transitions « plein écran »
// où l'ancien écran glisse dehors pendant que le nouveau glisse dedans. Le clone est inerte
// (cloneNode ne copie pas les écouteurs JS) ; le figeage des animations internes se fait en CSS.
export default function SnapshotPane({ node, className, style, onAnimationEnd }) {
  const hostRef = useRef(null)
  // ⚠️ useLayoutEffect, PAS useEffect : l'insertion doit précéder la PEINTURE. En useEffect,
  // l'hôte (plein écran, fond opaque) était peint VIDE une frame entière avant de recevoir
  // le clone — un flash blanc sur tout l'écran à chaque engagement de glissé (retour user).
  useLayoutEffect(() => {
    const host = hostRef.current
    if (host && node) host.appendChild(node)
    return () => {
      if (host && node && node.parentNode === host) host.removeChild(node)
    }
  }, [node])
  return <div ref={hostRef} className={className} aria-hidden="true" style={style} onAnimationEnd={onAnimationEnd} />
}
