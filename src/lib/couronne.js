import { useLayoutEffect, useRef, useState } from 'react'

/**
 * LA COURONNE DU MENEUR VOYAGE d'un nom à l'autre au lieu de disparaître ici et de
 * réapparaître là. C'est le seul suspense qu'une soirée fabrique et que l'app cachait.
 *
 * Technique : le FLIP, la même que le réordonnancement des catégories dans
 * `ScoreSheetEditor` — on relève la position AVANT le changement, on repose l'élément
 * visuellement à son ancienne place une fois le DOM à jour, et une transition le ramène.
 * Deux différences avec l'original : on mesure les deux axes (l'éditeur ne bouge qu'en
 * hauteur) et on ne suit qu'un seul élément.
 *
 * ⚠️ LA DÉCANTATION EST LE CŒUR DU MÉCANISME, pas un détail de confort. Le meneur change à
 * chaque caractère tapé, et la tenue du bouton « + » ajoute un point toutes les 45 ms :
 * sans délai, saisir 141 à Abyss ferait battre la couronne une centaine de fois. Le minuteur
 * est RÉARMÉ à chaque changement — si la tête change deux fois en 300 ms, la couronne ne
 * bouge qu'une fois, et va directement de A à C : B n'est jamais affiché, donc jamais animé.
 *
 * @param cle        l'identité du meneur (id du joueur), ou null s'il n'y en a pas un seul
 * @param conteneur  ref du conteneur où chercher la couronne allumée
 * @param immediat   vrai quand la désignation vient d'un TAP (victoire directe, départage) :
 *                   la différer se lirait comme de la latence
 */
export function useCouronneQuiVoyage(cle, { conteneur, delai = 450, immediat = false } = {}) {
  const [affiche, setAffiche] = useState(cle)
  const minuteur = useRef(null)
  const depart = useRef(null)

  useLayoutEffect(() => {
    if (cle === affiche) return
    if (minuteur.current) clearTimeout(minuteur.current)
    // On fige la position de départ AVANT le changement d'état : le nœud est encore là.
    const el = conteneur?.current?.querySelector('[data-couronne="on"]')
    depart.current = el ? el.getBoundingClientRect() : null
    minuteur.current = setTimeout(() => setAffiche(cle), immediat ? 0 : delai)
    return () => { if (minuteur.current) clearTimeout(minuteur.current) }
  }, [cle, affiche, conteneur, delai, immediat])

  // Le voyage : après le rendu, avant la peinture.
  useLayoutEffect(() => {
    const de = depart.current
    depart.current = null // un rendu sans changement de meneur ne doit pas rejouer le vol
    if (!de) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const el = conteneur?.current?.querySelector('[data-couronne="on"]')
    if (!el) return
    const a = el.getBoundingClientRect()
    const dx = de.left - a.left
    const dy = de.top - a.top
    if (!dx && !dy) return
    // Garde de distance : un ancrage hors écran (liste défilée entre-temps) produirait un vol
    // absurde à travers la page.
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
    // ⚠️ On force le calcul de la mise en page ICI, au lieu d'attendre la frame suivante.
    // `requestAnimationFrame` ne s'exécute PAS quand la page est cachée (onglet en arrière-plan,
    // écran verrouillé) : la couronne resterait alors figée à son décalage de départ, pour
    // toujours. Mesuré. Une lecture de `getBoundingClientRect` suffit à faire voir au
    // navigateur l'état de départ, et tout redevient synchrone.
    el.getBoundingClientRect()
    el.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transform = ''
  }, [affiche, conteneur])

  return affiche
}
