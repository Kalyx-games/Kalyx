import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * L'ASCENSEUR DU DÉFILEMENT : une poignée sur le bord droit, qui porte la lettre du groupe
 * qu'on traverse, et qu'on peut SAISIR au pouce pour sauter n'importe où dans la liste —
 * le patron des Contacts d'Android. Pendant la saisie, une bulle plus grande répète la
 * lettre à gauche du pouce (qui masque la poignée).
 *
 * Il n'existe que pendant le défilement, et disparaît 1,2 s après le dernier geste.
 *
 * ⚠️⚠️ CE COMPOSANT POSSÈDE TOUT SON ÉTAT — `App` ne rend JAMAIS pendant le défilement.
 * Le hook de suivi (src/lib/lettre.js) l'appelle par sa ref : `montre('C')` réveille,
 * `prepare('C')` pose la valeur sans réveiller. La position de la poignée est écrite
 * DIRECTEMENT en style (aucun setState par frame : un `setVue(true)` déjà vrai est ignoré
 * par React). Remonter quoi que ce soit dans App re-rendrait les 100 cartes à chaque pixel —
 * exactement le coût que l'audit d'énergie a fait retirer.
 *
 * La position de la poignée ne demande AUCUNE mesure par carte : elle est la fraction
 * `scrollY / (scrollHeight − innerHeight)` — deux scalaires que le navigateur connaît déjà.
 * Et la saisie fait l'inverse : la fraction du doigt sur le rail devient un `scrollTo`.
 */
const Ascenseur = forwardRef(function Ascenseur({ cle = null }, ref) {
  const [lettre, setLettre] = useState(null)
  const [vue, setVue] = useState(false)
  const [saisi, setSaisi] = useState(false)
  const zone = useRef(null)
  const poignee = useRef(null)
  const minuteur = useRef(null)
  const saisiRef = useRef(false)

  const reveille = () => {
    setVue(true)
    clearTimeout(minuteur.current)
    if (!saisiRef.current) minuteur.current = setTimeout(() => setVue(false), 1200)
  }
  const reveilleRef = useRef(reveille)
  reveilleRef.current = reveille

  useImperativeHandle(ref, () => ({
    montre(l) {
      setLettre(l)
      reveilleRef.current()
    },
    // Pose l'étiquette SANS réveiller : la poignée doit être juste dès qu'elle apparaît,
    // mais poser la valeur courante au montage ne doit pas la faire surgir.
    prepare(l) {
      setLettre(l)
    },
    // La géométrie du rail, pour le hook de suivi : l'étiquette désigne le jeu EN FACE de
    // la poignée à l'écran, la ligne de lecture est donc la position de la poignée — et
    // seule cette ref sait où vit le rail. Lu au recalage (≤ 1×/s), jamais par événement.
    metriques() {
      const z = zone.current
      const el = poignee.current
      if (!z || !el) return null
      const r = z.getBoundingClientRect()
      return { top: r.top, hauteur: r.height, poignee: el.offsetHeight }
    },
  }), [])

  // Changer de tri change le SENS de l'étiquette : l'ancienne (une lettre, une durée…)
  // mentirait jusqu'au prochain franchissement. `cle` vaut null quand le tri n'a pas
  // d'étiquette affichable (aléatoire) → poignée nue.
  useEffect(() => { setLettre(null) }, [cle])

  useEffect(() => {
    const place = () => {
      const el = poignee.current
      const z = zone.current
      if (!el || !z) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max <= 0) return
      const f = Math.min(1, Math.max(0, window.scrollY / max))
      el.style.top = `${f * (z.clientHeight - el.offsetHeight)}px`
    }
    const onScroll = () => {
      place()
      // La poignée n'apparaît au simple défilement QUE si on a déjà quitté le sommet :
      // en haut de liste il n'y a rien à situer ni nulle part où remonter.
      if (window.scrollY > 48 || saisiRef.current) reveilleRef.current()
    }
    place()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', place)
      clearTimeout(minuteur.current)
    }
  }, [])

  // La saisie au pouce : la fraction du doigt sur le rail devient la position de la liste.
  const surRail = (e) => {
    const z = zone.current
    const el = poignee.current
    if (!z || !el) return
    const r = z.getBoundingClientRect()
    const h = el.offsetHeight
    const f = Math.min(1, Math.max(0, (e.clientY - r.top - h / 2) / (r.height - h)))
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, f * max)
  }
  const prend = (e) => {
    saisiRef.current = true
    setSaisi(true)
    setVue(true)
    clearTimeout(minuteur.current)
    zone.current?.setPointerCapture?.(e.pointerId)
    surRail(e)
  }
  const bouge = (e) => {
    if (saisiRef.current) surRail(e)
  }
  const lache = () => {
    saisiRef.current = false
    setSaisi(false)
    reveilleRef.current()
  }

  return (
    <div
      ref={zone}
      className={`kx-asc${vue ? ' on' : ''}`}
      aria-hidden="true"
      onPointerDown={prend}
      onPointerMove={bouge}
      onPointerUp={lache}
      onPointerCancel={lache}
    >
      <div ref={poignee} className={`kx-asc-poignee${lettre ? '' : ' nue'}${lettre && lettre.length > 2 ? ' longue' : ''}`}>
        {lettre}
        {saisi && lettre && <span className="kx-asc-bulle">{lettre}</span>}
      </div>
    </div>
  )
})

export default Ascenseur
