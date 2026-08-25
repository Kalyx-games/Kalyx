import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * LES COURONNES DU MENEUR, DÉCANTÉES ET MOBILES.
 *
 * ⚠️⚠️ CE HOOK DÉCANTE L'ENSEMBLE DES MENEURS, PAS « LE » MENEUR — et c'est tout le sujet.
 * Une première version ne différait que le cas à UN meneur et laissait l'égalité s'afficher
 * en direct. Résultat, sur 4-5 → +1 → 5-5 → +1 → 6-5 (mesuré, et signalé par l'utilisateur) :
 * les deux couronnes surgissaient d'un coup à l'égalité, puis l'une s'éteignait net, puis la
 * bonne clignotait — parce que l'affichage sautait d'une source instantanée à une source
 * différée. **Il ne peut y avoir qu'UNE source de vérité pour ce qui est peint.**
 *
 * Le mécanisme, donc : l'ensemble entier des meneurs est retardé de `delai`, et le minuteur
 * est RÉARMÉ à chaque changement. Une égalité traversée en chemin n'est jamais peinte ; une
 * égalité sur laquelle on s'arrête l'est, une fois, sans rien qui saute.
 *
 * La décantation n'est pas un confort : le meneur change à chaque caractère tapé, et la tenue
 * du bouton « + » ajoute un point toutes les 45 ms — saisir 141 ferait battre la couronne une
 * centaine de fois.
 *
 * Le VOYAGE (un FLIP, la technique du réordonnancement des catégories) ne se déclenche que
 * dans le seul cas où il veut dire quelque chose : **une couronne, qui devient une autre
 * couronne**. Quand une couronne s'ajoute ou disparaît, rien ne se déplace — elle s'allume
 * ou s'éteint en fondu, ce que le CSS fait déjà.
 *
 * @param meneurs   les ids des meneurs (tableau, éventuellement vide)
 * @param conteneur ref du conteneur où chercher les couronnes (`[data-joueur]`)
 * @param immediat  vrai quand la désignation vient d'un TAP (victoire directe, départage) :
 *                  la différer se lirait comme de la latence
 */
export function useCouronnes(meneurs, { conteneur, delai = 450, immediat = false } = {}) {
  // Une clé de chaîne : l'ensemble se compare et se mémorise sans piège d'identité.
  // ⚠️ les identifiants de joueurs sont des NOMBRES : `join`/`split` les rendraient en
  // chaînes, et l'ensemble renvoyé ne reconnaîtrait plus personne. On normalise ici, et le
  // consommateur interroge avec `String(p.id)`.
  const cle = meneurs.map(String).join('|')
  const [affiche, setAffiche] = useState(cle)
  const minuteur = useRef(null)
  const vol = useRef(null)

  useLayoutEffect(() => {
    if (cle === affiche) return
    if (minuteur.current) clearTimeout(minuteur.current)
    const avant = affiche ? affiche.split('|') : []
    const apres = cle ? cle.split('|') : []
    // Le seul cas qui se DÉPLACE : une couronne qui devient une autre. Une couronne qui
    // s'ajoute (l'égalité s'installe) ou qui part (elle se dénoue) ne bouge de nulle part —
    // et la faire « voler » depuis la couronne voisine serait un mensonge visuel.
    const voyage = avant.length === 1 && apres.length === 1 && avant[0] !== apres[0]
    const el = voyage ? conteneur?.current?.querySelector(`[data-joueur="${avant[0]}"]`) : null
    // On fige la position de départ AVANT le changement d'état : le nœud est encore là.
    vol.current = el ? { vers: apres[0], de: el.getBoundingClientRect() } : null
    // Rien d'allumé d'un côté ou de l'autre ? Il n'y a rien à décanter, et attendre se
    // lirait comme de la latence — la toute première couronne doit paraître tout de suite.
    const attente = immediat || !avant.length || !apres.length ? 0 : delai
    minuteur.current = setTimeout(() => setAffiche(cle), attente)
    return () => { if (minuteur.current) clearTimeout(minuteur.current) }
  }, [cle, affiche, conteneur, delai, immediat])

  // Le voyage : après le rendu, avant la peinture.
  useLayoutEffect(() => {
    const v = vol.current
    vol.current = null // un rendu sans changement de meneur ne doit pas rejouer le vol
    if (!v) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const el = conteneur?.current?.querySelector(`[data-joueur="${v.vers}"]`)
    if (!el) return
    const a = el.getBoundingClientRect()
    const dx = v.de.left - a.left
    const dy = v.de.top - a.top
    if (!dx && !dy) return
    // Garde de distance : un ancrage hors écran (liste défilée entre-temps) produirait un vol
    // absurde à travers la page.
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
    // ⚠️ On force le calcul de la mise en page ICI, au lieu d'attendre la frame suivante.
    // `requestAnimationFrame` ne s'exécute PAS quand la page est cachée (onglet en arrière-plan,
    // écran verrouillé) : la couronne resterait alors figée à son décalage de départ, pour
    // toujours. Mesuré. Une lecture de `getBoundingClientRect` suffit, et tout reste synchrone.
    el.getBoundingClientRect()
    el.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transform = ''
  }, [affiche, conteneur])

  return useMemo(() => new Set(affiche ? affiche.split('|') : []), [affiche])
}
