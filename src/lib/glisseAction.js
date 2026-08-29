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
// ⚠️ LE FOND SURVIT AU RELÂCHÉ, le temps que l'élément rentre. Sans ça, lâcher un glissé non
// armé démontait le décor INSTANTANÉMENT alors que la carte glissait encore (sa transition
// dure 0,2 s en liste, 0,22 en grille) : on voyait le fond de page derrière elle, et la
// couleur disparaissait d'un coup. Généreux exprès — une fois l'élément rentré il RECOUVRE le
// fond (`.glisse-fond` est en `inset: 0`), donc attendre trop ne se voit pas, alors
// qu'attendre trop peu se voit.
const RETOUR_FOND = 300

// LE RAPPEL DU GESTE — une DÉMONSTRATION jouée par le CHEMIN DU DOIGT.
// Calendrier, en millisecondes depuis la pose de `demo` :
//   0     · on laisse la ligne finir son apparition (`kx-card-in` dure 0,34 s)
//   340   · départ à DROITE — l'action « positive » de l'écran
//   700   · TRAVERSÉE d'un seul tenant jusqu'à GAUCHE (BoardGameGeek)
//   1060  · retour au repos
//   1280  · fin : `sens` retombe à 0, le fond se démonte
// Le premier pixel bouge donc à 340 ms au lieu de ~950 mesurées (l'ancienne animation CSS
// cumulait 500 ms de délai et un palier mort), et le tout dure 1,28 s au lieu de 3.
//
// ⚠️ LA TRAVERSÉE EST UN SEUL MOUVEMENT, sans halte au milieu (demande de l'user : « swipe à
// droite / swipe à gauche / revient au milieu », et non un aller-retour par le centre). Une
// halte, même sans pause programmée, se VOIT : la transition décélère en arrivant à zéro puis
// réaccélère, ce qui se lit comme une hésitation. En écrivant directement −A, la transition
// balaie les deux côtés d'un trait.
// ⚠️ AUCUNE transition n'est posée ici, et c'est volontaire : `.game` (0,2 s) et `.gtile`
// (0,22 s) en portent DÉJÀ une sur `transform`, et pendant un vrai glissé elles la coupent
// elles-mêmes. En poser une de plus la ferait survivre au glissé — exactement le genre de
// conflit qu'on vient de retirer.
const DEMO_ATTENTE = 340 // la ligne finit d'arriver avant qu'on ne bouge (kx-card-in = 0,34 s)
const DEMO_COURSE = 220 // un déplacement : la plus longue des deux transitions existantes
const DEMO_TENUE = 140 // on TIENT la position : le temps de lire la couleur et l'icône
// ⚠️ LE MOMENT OÙ LE FOND CHANGE DE CÔTÉ, pendant la traversée. C'est possible sans le moindre
// trou parce que `.glisse-fond` est en `inset: 0` : la COULEUR couvre toute la rangée, seule
// l'ICÔNE change de bord (`justify-content`). Il suffit donc de basculer quand la carte est au
// milieu — l'instant précis où elle recouvre le fond en entier, donc où rien ne se voit.
// Les deux transitions n'ont pas la même courbe (`.game` ease/0,2 s, `.gtile` 0,22 s), leurs
// passages par zéro tombent à ~73 et ~37 ms : 55 est le compromis, et l'écart restant est
// caché par la carte.
const DEMO_BASCULE = 55
const DEMO_PART = 0.32 // amplitude en fraction de la largeur…
const DEMO_MIN = 30 // …avec un PLANCHER (cf. le commentaire de l'effet) et un plafond
const DEMO_MAX = 64
// Durée totale, EXPORTÉE : App s'en sert pour retirer la démonstration plutôt que d'entretenir
// un second nombre qui dériverait de celui-ci. Une seule source de vérité.
export const DEMO_TOTAL = DEMO_ATTENTE + 3 * DEMO_COURSE + 2 * DEMO_TENUE // 1280

export function useGlisseAction(ref, { gauche, droite, demo = false } = {}) {
  const [offset, setOffset] = useState(0)
  const [arme, setArme] = useState(false)
  const [sens, setSens] = useState(0) // -1 vers la gauche, +1 vers la droite, 0 au repos
  const [dragging, setDragging] = useState(false)
  // Les callbacks sont recréés à chaque rendu du parent : on les lit par ref, sinon il
  // faudrait les comparer dans les memo des cartes — qui ne retiendraient alors plus rien.
  const actionsRef = useRef({ gauche, droite })
  actionsRef.current = { gauche, droite }
  const gRef = useRef({ dir: null, startX: 0, startY: 0, width: 0, arme: false, sens: 0, justSwiped: false })
  // ⚠️ Ref SÉPARÉE, et pas un champ de `gRef` : la démonstration s'en sert aussi, et
  // l'invariant « elle n'écrit jamais dans `gRef` » doit rester vérifiable d'un seul grep.
  const finFondRef = useRef(0)
  // Range le fond une fois l'élément rentré — jamais avant. Annulé dès qu'un geste reprend.
  const rangeLeFond = () => {
    clearTimeout(finFondRef.current)
    finFondRef.current = setTimeout(() => setSens(0), RETOUR_FOND)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const g = gRef.current
    const actionDe = (s) => (s < 0 ? actionsRef.current.gauche : actionsRef.current.droite)

    const onStart = (e) => {
      // Un nouveau geste reprend la main : le fond du précédent ne doit pas se ranger en plein
      // milieu.
      clearTimeout(finFondRef.current)
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
      // ⚠️ `g.sens` (le geste) retombe TOUT DE SUITE, l'affichage attend : le fond accompagne
      // l'élément jusqu'à ce qu'il soit rentré, sinon la couleur disparaît d'un coup sous une
      // carte encore en mouvement.
      rangeLeFond()
    }
    const onCancel = () => onEnd(true)
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      clearTimeout(finFondRef.current)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [ref])

  // --- LE RAPPEL DU GESTE : une DÉMONSTRATION qui emprunte le CHEMIN DU DOIGT ---
  //
  // ⚠️ Avant, le rappel mensuel était une animation CSS posée sur la carte. Deux défauts, et
  // c'est tout ce que l'utilisateur voyait : (a) une ANIMATION l'emporte sur le `transform`
  // en ligne du geste, donc tant qu'elle jouait la carte ne suivait plus le doigt ; (b) elle
  // ne parlait pas à React, donc `sens` restait à 0, donc `FondGlisse` ne se montait jamais —
  // une carte qui glissait sur du fond de page, sans couleur ni icône.
  // En écrivant `offset` et `sens` par les MÊMES setters que le doigt, le décor révélé est le
  // VRAI décor (mêmes couleurs, mêmes icônes, état « indisponible » compris) — et il l'est
  // dans les deux vues sans une seule ligne spécifique, puisque la grille appelle ce hook.
  //
  // ⚠️⚠️ LA GARANTIE, et c'est elle qui rend le procédé sûr : on n'écrit QUE des états React.
  // `gRef.current` n'est JAMAIS touché — donc ni `g.arme`, la seule condition qui lance une
  // action au relâché, ni `g.dir`, la seule qui fait entrer dans `onEnd`. Et aucun `touchend`
  // n'est fabriqué : `onEnd` ne part que d'un vrai événement du navigateur.
  useEffect(() => {
    if (!demo) return
    const el = ref.current
    if (!el) return
    const g = gRef.current
    if (g.dir) return // un vrai geste est déjà en cours : il a la priorité, toujours
    // Garde VIVANTE : App a vérifié au déclenchement, mais le réglage a pu changer depuis.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const w = el.offsetWidth
    if (!w) return
    // Amplitude en fraction de la largeur (une carte fait ~343 px, une tuile ~120 : une valeur
    // en pixels serait timide ici et démesurée là).
    // ⚠️ Le PLANCHER n'est pas décoratif : il faut dégager le retrait de `.glisse-fond-act`
    // PLUS la largeur de son icône, sinon on découvre une bande de couleur sans l'icône qui
    // dit l'action — 12 + 22 = 34 px en liste, 6 + 24 = 30 px en grille. Sur un écran étroit
    // une tuile tombe à ~89 px, où 32 % ne feraient que 28.
    // ⚠️ L'amplitude reste SOUS le seuil d'armement dans tous les cas : la démonstration montre
    // le mouvement, jamais le point où lâcher déclencherait — ce qu'elle enseigne est exact.
    const ampl = Math.round(Math.min(DEMO_MAX, Math.max(DEMO_MIN, w * DEMO_PART)))

    const minuteurs = []
    const ECOUTE = { capture: true, passive: true }
    // Même règle que pour un vrai geste : on ramène l'élément, et le fond ne se range qu'une
    // fois qu'il est rentré — y compris quand un contact vient interrompre la démonstration.
    const repos = () => { setOffset(0); rangeLeFond() }
    const coupe = () => {
      minuteurs.forEach(clearTimeout)
      minuteurs.length = 0
      document.removeEventListener('pointerdown', coupe, ECOUTE)
      document.removeEventListener('touchstart', coupe, ECOUTE)
      repos()
    }
    const etape = (t, fn) => minuteurs.push(setTimeout(fn, DEMO_ATTENTE + t))

    // DROITE d'abord (l'action « positive » de l'écran : nouvelle partie, ou passage en
    // collection), GAUCHE ensuite (BoardGameGeek). Ce qu'on oublie du geste, ce n'est pas
    // qu'il existe — c'est qu'il marche des DEUX côtés.
    etape(0, () => { setSens(1); setOffset(ampl) })
    // La TRAVERSÉE : un seul déplacement de +A à −A. Le fond change de côté en cours de route,
    // au moment où la carte est au milieu et le cache entièrement.
    etape(DEMO_COURSE + DEMO_TENUE, () => setOffset(-ampl))
    etape(DEMO_COURSE + DEMO_TENUE + DEMO_BASCULE, () => setSens(-1))
    etape(2 * DEMO_COURSE + 2 * DEMO_TENUE, () => setOffset(0))
    etape(3 * DEMO_COURSE + 2 * DEMO_TENUE, repos)

    // ⚠️ LE CONTACT REND LA MAIN, d'où qu'il vienne — en CAPTURE sur le document, donc AVANT
    // que l'événement n'atteigne `onStart` (phase cible). C'est indispensable : en vue liste
    // le geste écoute `.game`, alors que la bande dégagée appartient à `.swipe-row` ; un doigt
    // posé là n'atteindrait jamais `onStart`. Ces écouteurs ne vivent que le temps de la
    // démonstration : zéro écouteur au repos. Une démonstration cède toujours à l'utilisateur.
    document.addEventListener('pointerdown', coupe, ECOUTE)
    document.addEventListener('touchstart', coupe, ECOUTE)
    return coupe
  }, [demo, ref])

  return { offset, arme, sens, dragging, gRef }
}
