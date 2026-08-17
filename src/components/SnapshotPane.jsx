import { useEffect, useRef } from 'react'

// Rend un INSTANTANÉ figé (nœud DOM cloné) dans un conteneur — sert aux transitions « plein écran »
// où l'ancien écran glisse dehors pendant que le nouveau glisse dedans. Le clone est inerte
// (cloneNode ne copie pas les écouteurs JS) ; le figeage des animations internes se fait en CSS.
export default function SnapshotPane({ node, className, style, onAnimationEnd }) {
  const hostRef = useRef(null)
  useEffect(() => {
    const host = hostRef.current
    if (host && node) host.appendChild(node)
    return () => {
      if (host && node && node.parentNode === host) host.removeChild(node)
    }
  }, [node])
  return <div ref={hostRef} className={className} aria-hidden="true" style={style} onAnimationEnd={onAnimationEnd} />
}
