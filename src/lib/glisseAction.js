import { useEffect, useRef, useState } from 'react'
import { mou } from './geste'
import { vibre } from './haptique'

// LE GESTE DES JEUX, partagé par la vue liste et la vue grille.
//
// Deux actions directionnelles, jamais de menu : on tire le jeu vers la DROITE ou vers la
// GAUCHE, un fond se révèle derrière lui, et lâcher au-delà du seuil lance l'action de ce
// côté. Tant qu'on n'a pas lâché, l'état est visible ET réversible — c'est ce qui sépare un
// raccourci d'une roulette.
//
// ⚠️ Écouteurs tactiles NATIFS non passifs : ceux de React sont passifs et ne peuvent pas
// `preventDefault`, donc le navigateur garderait le geste pour son défilement.

// Seuil et course, en fraction de la largeur de l'élément — une carte de liste fait ~343 px
// et une tuile de grille ~120 : un seuil en pixels fixes serait trop dur ici et trop facile
// là. Le seuil est PLAFONNÉ pour qu'une carte large ne demande pas un geste démesuré.
const SEUIL = 0.38
const SEUIL_MAX = 96
const HYST = 0.1 // hystérésis : sans elle, un doigt posé sur le seuil ferait clignoter l'état
const LIBRE = 0.55 // au-delà, l'élément résiste au lieu de suivre le doigt

export function useGlisseAction(ref, { gauche, droite } = {}) {
  const [offset, setOffset] = useState(0)
  const [arme, setArme] = useState(false)
  const [sens, setSens] = useState(0) // -1 vers la gauche, +1 vers la droite, 0 au repos
  const [dragging, setDragging] = useState(false)
  // Les callbacks sont recréés à chaque rendu du parent : on les lit par ref, sinon il
  // faudrait les comparer dans les memo des cartes — qui ne retiendraient alors plus rien.
  const actionsRef = useRef({ gauche, droite })
  actionsRef.current = { gauche, droite }
  const gRef = useRef({ dir: null, startX: 0, startY: 0, width: 0, arme: false, sens: 0, justSwiped: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const g = gRef.current
    const actionDe = (s) => (s < 0 ? actionsRef.current.gauche : actionsRef.current.droite)

    const onStart = (e) => {
      const t = e.touches[0]
      g.startX = t.clientX
      g.startY = t.clientY
      g.dir = null
      g.width = el.offsetWidth || 1
    }
    const onMove = (e) => {
      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY
      if (!g.dir) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) { g.dir = 'h'; setDragging(true) }
        else if (Math.abs(dy) > 8) g.dir = 'v' // vertical → on laisse défiler la liste
      }
      if (g.dir !== 'h') return
      e.preventDefault() // le geste est à nous
      const s = dx < 0 ? -1 : 1
      const a = Math.abs(dx)
      if (s !== g.sens) { g.sens = s; setSens(s) }
      const libre = g.width * LIBRE
      // Suivi 1:1 jusqu'à `libre`, puis résistance : on peut tirer aussi fort qu'on veut,
      // l'élément ne quittera pas sa place.
      setOffset(s * (a <= libre ? a : libre + mou(a - libre)))
      // Pas d'action de ce côté (hors ligne, jeu sans fiche BGG…) → élastique seul : ça
      // bouge, mais rien ne s'arme et rien ne se lancera.
      if (!actionDe(s)) {
        if (g.arme) { g.arme = false; setArme(false) }
        return
      }
      const seuil = Math.min(g.width * SEUIL, SEUIL_MAX)
      if (!g.arme && a > seuil) {
        g.arme = true
        setArme(true)
        vibre('seuil')
      } else if (g.arme && a < seuil - g.width * HYST) {
        g.arme = false
        setArme(false)
        vibre('cran')
      }
    }
    // `annule` : le système a repris le geste (appel entrant, notification…). On range
    // l'élément SANS lancer l'action — un glissé interrompu n'est pas un glissé validé.
    const onEnd = (annule) => {
      if (g.dir === 'h') {
        setDragging(false)
        setOffset(0)
        if (g.arme) {
          g.arme = false
          setArme(false)
          if (annule !== true) actionDe(g.sens)?.()
        }
        // Le clic de fin de geste arrive APRÈS le touchend : sans ce drapeau, lâcher
        // l'élément déclencherait aussi son tap.
        g.justSwiped = true
        setTimeout(() => { g.justSwiped = false }, 130)
      }
      g.dir = null
      g.sens = 0
      setSens(0)
    }
    const onCancel = () => onEnd(true)
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [ref])

  return { offset, arme, sens, dragging, gRef }
}
