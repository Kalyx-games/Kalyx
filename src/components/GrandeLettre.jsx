import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * La lettre du groupe qu'on est en train de traverser, pendant le défilement de la collection.
 * Un repère de position dans cent cartes — et rien d'autre : au repos, elle n'existe pas.
 *
 * ⚠️⚠️ CE COMPOSANT POSSÈDE SON ÉTAT, ET C'EST TOUT L'INTÉRÊT. L'observateur l'appelle par sa
 * ref (`montre('C')`) : **`App` ne rend jamais pendant le défilement**. Un seul nœud se
 * redessine, vingt-six fois au pire dans une traversée complète — ni les cent cartes, ni les
 * mémos d'App, ni la liste triée.
 * Si un jour on remonte cet état dans `App`, on rend les cent cartes à chaque lettre, et sur
 * les tris « parties jouées » / « dernière partie » leur mémo ne retient plus rien (leur
 * ligne d'info est un JSX recréé à chaque rendu) : on aurait refait exactement ce que
 * l'audit d'énergie avait retiré, par une autre porte.
 */
const GrandeLettre = forwardRef(function GrandeLettre(_, ref) {
  const [lettre, setLettre] = useState(null)
  const [vue, setVue] = useState(false)
  const minuteur = useRef(null)

  useImperativeHandle(ref, () => ({
    montre(l) {
      setLettre(l)
      setVue(true)
      clearTimeout(minuteur.current)
      // 900 ms après le dernier changement : on s'est arrêté de traverser, l'écran redevient
      // propre. C'est ce qui rend la densité supportable — une lettre toutes les quatre cartes
      // en moyenne, mais on ne la voit QUE pendant la traversée rapide.
      minuteur.current = setTimeout(() => setVue(false), 900)
    },
  }), [])

  useEffect(() => () => clearTimeout(minuteur.current), [])

  if (!lettre) return null
  // aria-hidden : c'est une redite visuelle de ce que la liste dit déjà. L'annoncer vingt-six
  // fois pendant un défilement serait hostile.
  return <div className={`kx-lettre${vue ? ' on' : ''}`} aria-hidden="true">{lettre}</div>
})

export default GrandeLettre
