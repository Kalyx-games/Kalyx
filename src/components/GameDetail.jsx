import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BackIcon, ExtIcon, PencilIcon, DieIcon, CrownIcon } from './icons'
import { BGG_LOGO } from '../lib/logos'
import { vibre } from '../lib/haptique'
import { mou } from '../lib/geste'
import SnapshotPane from './SnapshotPane'
import { backdropSrc, heroSrc } from '../lib/img'
import {
  parseOwners, parseTags, ownerDisplay, parseExtensions,
  basePlayersSet, effectivePlayersSet, baseBestSet, effectiveBestSet, countsToText,
} from '../lib/games'


// Durée : identique à la carte ("30 min", "1 h", "1h30").
function durationLabel(g) {
  const d = g.duration_max ?? g.duration_min
  if (!d) return '—'
  if (d < 60) return `${d} min`
  const h = Math.floor(d / 60)
  const m = d % 60
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
}
const complexityWord = (n) => (n == null ? '' : n < 2 ? 'Simple' : n < 3 ? 'Moyen' : 'Corsé')

// Page détaillée d'un jeu (« fiche jeu ») — le point d'ancrage : depuis ici on lance une
// partie, on ouvre l'historique + les stats, on modifie le jeu, on va sur BGG, on zoome
// l'image. TOUTES les actions renvoient vers les écrans existants (rien n'est perdu).
export default function GameDetail({
  game, online, hasSheet, playCount = 0, lastPlayedLabel,
  fait, ownerMap, tagMap, siblings = [], onNavigate, closing = false,
  onClose, onNewPlay, onStats, onHistory, onCreateSheet, onEdit, onBgg,
}) {
  const basePlayers = basePlayersSet(game)
  const extraPlayers = effectivePlayersSet(game).filter((n) => !basePlayers.includes(n))
  const playersText = (countsToText(basePlayers) || '—') + (extraPlayers.length ? ` (${countsToText(extraPlayers)})` : '')

  const baseBest = baseBestSet(game)
  const extraBest = effectiveBestSet(game).filter((n) => !baseBest.includes(n))
  const bestBaseText = countsToText(baseBest)
  const bestText = bestBaseText
    ? bestBaseText + (extraBest.length ? ` (${countsToText(extraBest)})` : '')
    : extraBest.length
    ? `(${countsToText(extraBest)})`
    : ''

  const complexity = game.complexity ? Number(game.complexity) : null
  const extensions = parseExtensions(game.extensions).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'fr'))
  const owners = parseOwners(game.owner)
  const tags = parseTags(game.tags)
  const fullImg = game.image_url

  // Sondage BGG « nombre de joueurs » : { total, rows:[{n,best,rec,notRec}] }.
  // pollSearched = on a bien interrogé BGG (objet avec un tableau rows, même vide) → distingue
  // « sondage cherché mais vide » (petite phrase) de « non cherché » (rien, bgg_poll absent/null).
  const pollSearched = game.bgg_poll && Array.isArray(game.bgg_poll.rows) ? game.bgg_poll : null
  const poll = pollSearched && pollSearched.rows.length ? pollSearched : null

  // Repli si l'image ne charge pas (optimiseur ET image brute en échec) → on montre le dé
  // au lieu d'une icône d'image cassée (cohérent avec la carte).
  const [imgBroken, setImgBroken] = useState(false)
  const [heroActions, setHeroActions] = useState(false) // la boîte est-elle retournée ?
  // ⚠️ La remise à l'endroit se fait PENDANT LE RENDU (motif « ajuster l'état quand une prop
  // change »), surtout PAS dans un effet : `.detail-body` porte key={game.id}, donc le corps du
  // jeu suivant est un nœud NEUF créé avec la classe `flipped`, et le useLayoutEffect voisin
  // appelle getBoundingClientRect → la boîte est RÉSOLUE à rotateY(180deg) avant que la classe
  // ne tombe → la transition de 0,55 s se joue et le jeu suivant arrive DOS À L'ÉCRAN.
  // Mesuré avant correctif : 180° à 37 ms, 87° à 202 ms, 0° seulement à 653 ms.
  // ⚠️ un useLayoutEffect à la place NE SUFFIT PAS (mesuré aussi) : il passe après ce reflow.
  const [idPrec, setIdPrec] = useState(game.id)
  if (idPrec !== game.id) {
    setIdPrec(game.id)
    setHeroActions(false)
  }
  useEffect(() => setImgBroken(false), [fullImg])
  const showImg = Boolean(fullImg) && !imgBroken

  // Glissé horizontal sur la fiche → jeu précédent/suivant de la liste filtrée (siblings).
  // Écouteurs tactiles natifs non-passifs (comme ailleurs). navRef reste frais à chaque rendu.
  const idx = siblings.findIndex((g) => g.id === game.id)
  const sheetRef = useRef(null)
  const headRef = useRef(null)
  const swipeRef = useRef({ id: null, x: 0, y: 0, dragging: false })
  // Transition PLEIN ÉCRAN (pager) : on fige un instantané du corps ACTUEL qui glisse dehors PENDANT
  // que le corps du NOUVEAU jeu glisse dedans → on voit vraiment une fiche remplacer l'autre.
  const bodyRef = useRef(null)
  const [bodyLeaving, setBodyLeaving] = useState(null) // { node, dir, top, left, width } | null
  // La tête change de hauteur avec le nombre de lignes du titre, donc le corps entrant peut
  // ne pas être à la même ordonnée que l'instantané sortant (mesuré : 20px d'écart entre un
  // titre d’une ligne et un titre de deux). On réaligne, sinon les deux panneaux se croisent
  // en escalier — et le fond d’ambiance du sortant paraîtrait sauter.
  // ⚠️ Le recalage ne vaut que pour une fiche NON défilée : là, l'écart est un pur delta de
  // hauteur de tête (titre d'une ligne contre deux) et recaler évite l'escalier. Fiche
  // défilée, chaque panneau garde son ordonnée (comportement normal d'un pager) — recaler
  // ferait sauter l'instantané de tout le défilement. Le critère est le défilement relevé à
  // l'engagement, pas la taille de l'écart (un petit scroll ressemble à un delta de tête).
  useLayoutEffect(() => {
    if (!bodyLeaving || !bodyRef.current) return
    if ((pagerRef.current?.scrollAvant ?? 0) > 0.5) return
    const top = bodyRef.current.getBoundingClientRect().top
    setBodyLeaving((b) => (b && Math.abs(b.top - top) > 0.5 ? { ...b, top } : b))
  }, [bodyLeaving])
  // ⚠️ Le glissé entre fiches passe SOUS le doigt sur la jaquette : sans ce drapeau, un
  // glissé trop court pour changer de jeu (< 60 px) laisse passer son clic de fin de geste
  // et retourne la boîte par accident. Même motif que NavBar et que le parcours de saisie —
  // c'est la troisième fois qu'il est nécessaire dans ce projet.
  const swipedRef = useRef(false)
  const retourner = () => {
    if (swipedRef.current) return
    vibre('cran')
    setHeroActions((v) => !v)
  }
  // Les deux actions du dos remettent la boîte À L'ENDROIT en partant : sans ça, on revient du
  // formulaire (ou de BGG) sur une plaque vide — la jaquette du jeu a purement disparu, et
  // rien à l'écran ne dit qu'il faut retoucher la plaque pour la faire revenir.
  const actionDuDos = (fn) => () => {
    if (swipedRef.current) return
    setHeroActions(false)
    fn()
  }
  // ⚠️ Les deux faces échangent `aria-hidden` : sans déplacer le focus, on le laisse DANS la
  // face qu'on vient de masquer. Chrome refuse alors d'appliquer l'aria-hidden (« Blocked
  // aria-hidden on an element because its descendant retained focus »), le lecteur d'écran
  // n'annonce rien, et un second Entrée sur le bouton toujours focalisé retourne encore la
  // boîte — `pointer-events: none` ne bloque pas le clavier.
  // On ne déplace le focus QUE s'il se trouvait dans la face qui part : sinon on le volerait
  // à quelqu'un qui a simplement tapé du doigt ailleurs.
  // Le dos ne porte BGG que si le jeu a une fiche BoardGameGeek et qu'on est en ligne.
  const etiquetteRecto = onBgg
    ? 'Retourner la boîte : éditer le jeu, ouvrir BoardGameGeek'
    : 'Retourner la boîte : éditer le jeu'
  const flipRef = useRef(null)
  const premierRendu = useRef(true)
  useLayoutEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return }
    const boite = flipRef.current
    const actif = document.activeElement
    if (!boite || !actif) return
    const recto = boite.querySelector('.detail-hero')
    const dos = boite.querySelector('.hero-back')
    if (heroActions && recto && recto.contains(actif)) boite.querySelector('.hero-back-return')?.focus()
    else if (!heroActions && dos && dos.contains(actif)) recto?.focus()
  }, [heroActions])
  // Le fond d'ambiance remonte DERRIÈRE la tête : son décalage était la somme codée en dur
  // 8+6+44+14, calée sur une tête d'une seule ligne. Depuis que le titre y revient et peut
  // passer sur deux lignes, on mesure la tête pour de bon.
  useEffect(() => {
    const head = headRef.current
    const sheet = sheetRef.current
    if (!head || !sheet) return
    const mesurer = () => sheet.style.setProperty('--kx-head-h', head.offsetHeight + 'px')
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])
  // ══ LE GLISSÉ QUI SUIT LE DOIGT ══ La fiche est un vrai pager : dès l'engagement, l'instantané
  // du jeu courant suit le doigt 1:1 pendant que le CORPS RÉEL du voisin arrive à côté (la bascule
  // d'état se fait à l'engagement — un aller-retour setDetailGame ne coûte que deux re-rendus,
  // aucun réseau, aucune entrée d'historique : vérifié dans App). Le geste écrit UNE variable CSS
  // (--kx-page) sur la feuille, les DEUX panneaux en dérivent leur position — React ne touche
  // jamais cette variable (le patron de la pastille du bac). Au relâché, la classe kx-pose rend
  // une transition et la cible est écrite dans la même variable : l'aperçu et l'arrivée ne font
  // qu'un seul mouvement. Au bord de la collection : l'élastique (mou) — on SENT qu'il n'y a
  // plus rien après, au lieu d'un geste qui tombe dans le vide.
  const [glisse, setGlisse] = useState(null) // null | { mode: 'pager', dir } | { mode: 'bord' }
  const pagerRef = useRef(null) // l'état du geste en cours (jamais lu par le rendu)
  const poseRef = useRef(null) // l'atterrissage en vol { commit, mode, timer }
  const scrollRestaureRef = useRef(null) // défilement à rendre au jeu d'origine après une annulation
  const scrollRetryRef = useRef(null) // la 2e écriture du scroll restauré (annulable)
  // Miroir de `closing` pour le minuteur d'atterrissage : une fiche en train de se fermer
  // ne doit plus JAMAIS naviguer — sinon le onNavigate différé de 340 ms la ROUVRE tout seul.
  const closingRef = useRef(closing)
  closingRef.current = closing
  // Au démontage : le minuteur d'atterrissage et le filet de scroll meurent avec le composant.
  useEffect(() => () => {
    clearTimeout(poseRef.current?.timer)
    poseRef.current = null
    pagerRef.current = null
    clearTimeout(scrollRetryRef.current)
  }, [])
  const finirPose = () => {
    const s = poseRef.current
    if (!s) return
    poseRef.current = null
    clearTimeout(s.timer)
    // kx-pose se retire en DIRECT, symétriquement à pose() qui l'ajoute : deux glissés
    // enchaînés font passer `glisse` d'objet à objet sans jamais commettre null (React
    // groupe les deux setGlisse du même handler) → l'effet de nettoyage ne viendrait pas,
    // et la transition de 0,3 s resterait collée au suivi du geste suivant.
    sheetRef.current?.classList.remove('kx-pose')
    const p = pagerRef.current
    pagerRef.current = null
    if (p?.mode === 'pager' && !s.commit && !closingRef.current) {
      // Annulé : le jeu d'origine revient, avec son défilement — l'aller-retour est invisible,
      // l'instantané couvre l'écran jusqu'au commit React qui le retire (même peinture).
      scrollRestaureRef.current = p.scrollAvant
      onNavigate(p.original)
    }
    setBodyLeaving(null)
    setGlisse(null)
  }
  const engage = (dir) => {
    if (closing) return // la feuille est en train de sortir : aucun pager ne doit naître
    clearTimeout(scrollRetryRef.current) // le filet de scroll n'écrit pas en plein geste
    // Un atterrissage encore en vol : on le termine net (fast-forward). S'il s'agissait d'une
    // ANNULATION, le jeu d'origine est en train de revenir → ce geste-ci reste sans pager.
    if (poseRef.current) {
      const bloque = poseRef.current.mode === 'pager' && !poseRef.current.commit
      finirPose()
      if (bloque) return
    }
    const sheet = sheetRef.current
    if (!sheet) return
    const next = idx + dir
    const versVoisin = Boolean(onNavigate) && idx >= 0 && next >= 0 && next < siblings.length
    sheet.style.setProperty('--kx-page', '0px')
    if (!versVoisin) {
      // Le bord de la collection : pas de voisin, la fiche résiste à l'élastique.
      pagerRef.current = { mode: 'bord', pos: 0 }
      sheet.style.setProperty('--kx-cote', '0')
      setGlisse({ mode: 'bord' })
      return
    }
    const el = bodyRef.current
    const rect = el.getBoundingClientRect()
    const clone = el.cloneNode(true)
    // Sur un enchaînement (fast-forward), le corps cloné porte encore corps-glisse et
    // data-cote : le clone matcherait la règle de transform et partirait d'un écran.
    clone.classList.remove('corps-glisse')
    clone.removeAttribute('data-cote')
    pagerRef.current = {
      mode: 'pager', dir, original: game, scrollAvant: sheet.scrollTop,
      largeur: window.innerWidth, pos: 0, vx: 0, dernierX: null, dernierT: 0,
    }
    sheet.style.setProperty('--kx-cote', String(dir))
    setBodyLeaving({ node: clone, manuel: true, top: rect.top, left: rect.left, width: rect.width })
    setGlisse({ mode: 'pager', dir })
    sheet.scrollTop = 0 // le voisin arrive en haut de SA fiche
    onNavigate(siblings[next])
  }
  const suit = (dx, x) => {
    const p = pagerRef.current
    const sheet = sheetRef.current
    if (!p || !sheet) return
    let pos
    if (p.mode === 'bord') pos = mou(dx)
    else if (p.dir === 1) pos = dx > 0 ? mou(dx) : Math.max(dx, -p.largeur)
    else pos = dx < 0 ? mou(dx) : Math.min(dx, p.largeur)
    p.pos = pos
    if (p.mode === 'pager') {
      const t = performance.now()
      if (p.dernierX != null && t > p.dernierT) p.vx = (x - p.dernierX) / (t - p.dernierT)
      p.dernierX = x
      p.dernierT = t
    }
    sheet.style.setProperty('--kx-page', pos + 'px')
  }
  const pose = (annule) => {
    const p = pagerRef.current
    const sheet = sheetRef.current
    if (!p || !sheet) return
    let commit = false
    let cible = 0
    if (p.mode === 'pager' && !annule) {
      // On bascule au TIERS de l'écran, ou d'une pichenette. La vitesse ne vaut que si le
      // dernier mouvement est récent (un doigt qui a marqué une pause a changé d'avis), et
      // une pichenette FINALE vers l'origine annule même au-delà du tiers — le dernier
      // geste dit l'intention.
      const v = performance.now() - p.dernierT < 90 ? p.vx : 0
      const versVoisin = p.dir === 1 ? v < -0.45 : v > 0.45
      const versOrigine = p.dir === 1 ? v > 0.45 : v < -0.45
      const passeTiers = p.dir === 1 ? p.pos <= -p.largeur * 0.33 : p.pos >= p.largeur * 0.33
      commit = versVoisin || (passeTiers && !versOrigine)
      cible = commit ? -p.dir * p.largeur : 0
    }
    sheet.classList.add('kx-pose')
    void sheet.getBoundingClientRect() // la classe doit être résolue AVANT la nouvelle valeur
    sheet.style.setProperty('--kx-page', cible + 'px')
    // Pas de transitionend : les transitions internes du corps remonteraient jusqu'ici, et une
    // valeur déjà à la cible n'en émet aucun. Le minuteur calé sur la durée (0,3 s) suffit.
    poseRef.current = { commit, mode: p.mode, timer: setTimeout(finirPose, 340) }
  }
  // Le nettoyage APRÈS le commit (avant la peinture) : retirer les variables plus tôt ferait
  // sauter le corps encore classé à sa position de repos, une frame avant le retrait des classes.
  useLayoutEffect(() => {
    if (glisse) return
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.classList.remove('kx-pose')
    sheet.style.removeProperty('--kx-page')
    sheet.style.removeProperty('--kx-cote')
    if (scrollRestaureRef.current != null) {
      const vise = scrollRestaureRef.current
      scrollRestaureRef.current = null
      sheet.scrollTop = vise
      // Au commit, la jaquette du corps remonté n'a pas encore sa hauteur (image en cours de
      // chargement) → le scroll peut être CLAMPÉ trop haut. Une seconde écriture, une fois
      // l'image arrivée (cache), rend sa vraie position ; si la page est réellement plus
      // courte, elle clampe pareil — inoffensif.
      if (Math.abs(sheet.scrollTop - vise) > 1) {
        clearTimeout(scrollRetryRef.current)
        scrollRetryRef.current = setTimeout(() => {
          scrollRetryRef.current = null
          // jamais en plein geste : un pager engagé a remis le scroll à 0 exprès
          if (sheetRef.current && !pagerRef.current) sheetRef.current.scrollTop = vise
        }, 150)
      }
    }
  }, [glisse])
  const navRef = useRef({})
  navRef.current = { engage, suit, pose }
  // ⚠️ POINTER EVENTS + CAPTURE, et pas des touch events — c'est le cœur : l'engagement
  // REMONTE le corps (key={game.id}), donc la cible du toucher initial est DÉTACHÉE du DOM,
  // et les touchmove d'un nœud détaché ne remontent plus (le gel de la fente des tierlists,
  // reproduit ici au premier essai). `setPointerCapture` sur la feuille redirige tout le
  // geste vers elle, détachement ou pas. Le défilement vertical reste au navigateur via
  // `touch-action: pan-y` sur la feuille (un preventDefault n'y ferait rien en pointer).
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const st = swipeRef.current
    const onDown = (e) => {
      // Tactile (et stylet) seulement, comme l'ancien mécanisme : à la souris, un glissé
      // horizontal est une sélection de texte, pas une navigation.
      if (!e.isPrimary || e.pointerType === 'mouse') return
      st.id = e.pointerId; st.x = e.clientX; st.y = e.clientY; st.dragging = false
    }
    const onMove = (e) => {
      if (e.pointerId !== st.id) return
      const dx = e.clientX - st.x
      const dy = e.clientY - st.y
      if (!st.dragging && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) + 6) {
        st.dragging = true
        // posé dès l'ENGAGEMENT : l'écran bouge sous le doigt, le clic de fin de geste ne
        // doit rien déclencher (il retournerait la boîte 3D)
        swipedRef.current = true
        try { el.setPointerCapture(e.pointerId) } catch { /* pointeur synthétique (banc) */ }
        navRef.current.engage(dx < 0 ? 1 : -1) // glissé vers la gauche → jeu suivant
      }
      if (st.dragging) navRef.current.suit(dx, e.clientX)
    }
    const onUp = (e) => {
      if (e.pointerId !== st.id) return
      st.id = null
      if (!st.dragging) return
      st.dragging = false
      setTimeout(() => { swipedRef.current = false }, 220)
      navRef.current.pose(false)
    }
    const onCancel = (e) => {
      if (e.pointerId !== st.id) return
      st.id = null
      if (!st.dragging) return
      st.dragging = false
      setTimeout(() => { swipedRef.current = false }, 220)
      navRef.current.pose(true) // le système a repris le geste → jamais de bascule
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  return (
    <div className={`sheet detail-sheet${closing ? ' closing' : ''}`} ref={sheetRef}>
      <div className="settings-head" ref={headRef}>
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        {/* Le titre partage la rangée avec le seul bouton retour, et il REVIENT À LA LIGNE :
            avec une troncature, 11 jeux sur 146 étaient encore coupés à 375px. La tête peut
            donc grandir → le fond d'ambiance se recale dessus (voir --kx-head-h). */}
        <h2 className="detail-title">{game.name}</h2>
      </div>

      {/* Corps du nouveau jeu qui GLISSE en entrée (plein écran). L'ancien corps (instantané figé)
          glisse dehors en même temps → cf. SnapshotPane plus bas. key={game.id} → re-montage. */}
      {bodyLeaving && (
        <SnapshotPane
          node={bodyLeaving.node}
          className="detail-body-leaving manuel"
          style={{ top: bodyLeaving.top, left: bodyLeaving.left, width: bodyLeaving.width }}
        />
      )}
      <div
        className={`detail-body${glisse ? ' corps-glisse' : ''}`}
        key={game.id}
        data-cote={glisse?.mode === 'pager' ? glisse.dir : undefined}
        ref={bodyRef}
      >
      {/* Fond d'ambiance : la jaquette, floutée, teinte le haut de la fiche puis se fond
          dans le fond de page. L'image est demandée en 128 px de large — un flou de 30 px
          n'a que faire de la définition, et ça ne coûte que quelques kilo-octets. */}
      {showImg && (
        <div className="detail-backdrop" aria-hidden="true">
          <img
            src={backdropSrc(fullImg)}
            alt=""
            // Repli sur l'image brute si l'optimiseur ne répond pas (domaine non listé, dev).
            onError={(e) => { if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg }}
          />
        </div>
      )}
      {/* La boîte du jeu se RETOURNE : au dos, les deux actions de service. Elles ne pèsent
          sur rien tant qu'on consulte, et le geste dit de lui-même comment revenir.
          ⚠️ le RECTO reste dans le flux — c'est lui qui donne sa taille au retourneur ; le
          verso l'épouse en absolu. Sans ça il faudrait une hauteur de rattrapage, comme la
          tuile « meilleur score » a dû en poser une. */}
      <div className="detail-hero-wrap">
        <div className={`hero-flip${heroActions ? ' flipped' : ''}`} ref={flipRef}>
          {showImg ? (
            <button
              type="button"
              className="detail-hero"
              onClick={retourner}
              aria-hidden={heroActions || undefined}
              tabIndex={heroActions ? -1 : 0}
              aria-label={etiquetteRecto}
            >
              <img
                src={heroSrc(fullImg)}
                alt=""
                onError={(e) => {
                  // 1er échec (optimiseur) → tente l'image brute ; 2e échec → repli sur le dé.
                  if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg
                  else setImgBroken(true)
                }}
              />
            </button>
          ) : (
            <button
              type="button"
              className="detail-hero detail-hero-empty"
              onClick={retourner}
              aria-hidden={heroActions || undefined}
              tabIndex={heroActions ? -1 : 0}
              aria-label={etiquetteRecto}
            >
              <span aria-hidden="true">🎲</span>
            </button>
          )}
          {/* Le dos. Rendu même sans jaquette : sinon un jeu sans image n'aurait plus AUCUN
              accès à Modifier ni à BGG. */}
          <div className="hero-back" aria-hidden={!heroActions}>
            {/* Le fond du dos, c'est la jaquette elle-même, floutée : le dos d'une boîte
                appartient au même monde de couleurs que sa face. MÊME URL que le fond
                d'ambiance de la page (128 px), donc déjà en cache : zéro requête de plus. */}
            {showImg && (
              <span className="hero-back-fond" aria-hidden="true">
                <img
                  src={backdropSrc(fullImg)}
                  alt=""
                  // Repli sur l'image brute si l'optimiseur ne répond pas (comme le fond d'ambiance).
                  onError={(e) => { if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg }}
                />
              </span>
            )}
            {/* Toute la plaque hors boutons ramène au recto : le geste de retour est le geste
                d'aller. Pas de croix, pas de phrase. */}
            <button
              type="button"
              className="hero-back-return"
              onClick={retourner}
              tabIndex={heroActions ? 0 : -1}
              aria-label="Revenir à la jaquette"
            />
            <div className="hero-back-acts">
              <button type="button" className="hero-act-tile hero-act-edit" onClick={actionDuDos(onEdit)} disabled={!online} tabIndex={heroActions ? 0 : -1}>
                <PencilIcon size={18} /> Éditer
              </button>
              {onBgg && (
                <button type="button" className="hero-act-tile hero-act-bgg" onClick={actionDuDos(onBgg)} tabIndex={heroActions ? 0 : -1}>
                  <img className="bgg-mark" src={BGG_LOGO} alt="" width="18" height="18" /> BGG
                </button>
              )}
              {/* Sans elle, on retourne la boîte pour tomber sur un bouton mort et un bouton
                  absent, sans un mot. */}
              {!online && <p className="hero-back-offline">Hors ligne : lecture seule.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-infos">
        <div className="detail-info"><span className="detail-info-k">Joueurs</span><span className="detail-info-v">{playersText}</span></div>
        {bestText && <div className="detail-info"><span className="detail-info-k">Idéal</span><span className="detail-info-v">{bestText}</span></div>}
        <div className="detail-info"><span className="detail-info-k">Durée</span><span className="detail-info-v">{durationLabel(game)}</span></div>
        <div className="detail-info" title={complexity ? `${complexity} sur 5 (BoardGameGeek)` : undefined}>
          <span className="detail-info-k">Complexité</span>
          {/* le mot parle de lui-même ; le chiffre BGG reste en infobulle */}
          <span className="detail-info-v">{complexity ? complexityWord(complexity) : '—'}</span>
        </div>
      </div>


      {extensions.length > 0 && (
        <p className="detail-ext"><span className="detail-info-k"><ExtIcon size={13} /></span> {extensions.join(', ')}</p>
      )}

      {/* Le fait notable de la dernière partie enregistrée sur CE jeu. Encart éditorial, même
          grammaire que l'anecdote du jour — pas un bouton : ni fond, ni contour, ni ombre.
          Il ne vit que le temps de la session : une nouvelle qu'on relit une semaine plus tard
          n'en est plus une.
          ⚠️ PLACÉ ICI, et pas plus haut : la boîte qui se retourne déborde de son gabarit et
          porte z-index 2 — un bloc inséré avant la bande d'infos serait tranché en plein tour. */}
      {fait && (
        <div className="detail-fait">
          <span className="detail-fait-label"><CrownIcon size={13} /> Fait notable</span>
          <p className="detail-fait-titre">{fait.titre}</p>
          {fait.sous && <p className="detail-fait-sous">{fait.sous}</p>}
        </div>
      )}

      {/* La donnée vivante du jeu, traitée comme telle : le nombre en grand, et toute la
          rangée mène à la liste des parties — on tape le compte, on obtient ce qu'il compte. */}
      {hasSheet && (
        <button type="button" className="detail-plays" onClick={onHistory} disabled={!online} title="Voir l’historique des parties">
          <span className="detail-plays-n">{playCount}</span>
          <span className="detail-plays-txt">
            {playCount > 1 ? 'parties jouées' : 'partie jouée'}
            {lastPlayedLabel && <span className="detail-plays-last">dernière le {lastPlayedLabel}</span>}
          </span>
          <span className="detail-plays-go" aria-hidden="true">›</span>
        </button>
      )}

      <div className="detail-actions">
        {hasSheet ? (
          <>
            {/* Une seule action primaire. Les statistiques restent à un tap, au second rang
                (la liste des parties, elle, est sous le compte juste au-dessus). */}
            <button type="button" className="btn-primary detail-primary" onClick={onNewPlay} disabled={!online}>
              <DieIcon size={18} /> Nouvelle partie
            </button>
            <button type="button" className="btn-ghost detail-secondary" onClick={onStats} disabled={!online}>
              Statistiques
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary detail-primary" onClick={onCreateSheet} disabled={!online}>
            Créer la fiche de score
          </button>
        )}
      </div>
      {poll && (
        <div className="detail-poll">
          <div className="detail-poll-head">
            Nombre de joueurs
            {poll.total ? <span className="detail-poll-total"> · {poll.total} votes</span> : null}
          </div>
          {/* Légende en toutes lettres (pas d'abréviation ambiguë), puis le tableau :
              une ligne par nombre de joueurs, barre visuelle + 3 colonnes de % alignées. */}
          <div className="poll-legend">
            <span className="poll-key"><span className="poll-dot poll-best" />Idéal</span>
            <span className="poll-key"><span className="poll-dot poll-rec" />Recommandé</span>
            <span className="poll-key"><span className="poll-dot poll-not" />Déconseillé</span>
          </div>
          <div className="poll-grid">
            {poll.rows.map((r) => {
              const best = r.best || 0
              const rec = r.rec || 0
              const notRec = r.notRec || 0
              const sum = best + rec + notRec
              const p = (v) => (sum > 0 ? Math.round((v / sum) * 100) : 0)
              const pb = p(best)
              const pr = p(rec)
              const pn = p(notRec)
              return (
                <Fragment key={r.n}>
                  <span className="poll-n">{r.n}</span>
                  <span className="poll-bar">
                    <span className="poll-seg poll-best" style={{ width: `${pb}%` }} />
                    <span className="poll-seg poll-rec" style={{ width: `${pr}%` }} />
                    <span className="poll-seg poll-not" style={{ width: `${pn}%` }} />
                  </span>
                  <span className="poll-pct poll-pct-best">{pb}%</span>
                  <span className="poll-pct poll-pct-rec">{pr}%</span>
                  <span className="poll-pct poll-pct-not">{pn}%</span>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Sondage cherché mais sans aucun vote sur BGG → on l'indique (uniquement dans ce cas). */}
      {!poll && pollSearched && (
        <div className="detail-poll">
          <div className="detail-poll-head">Nombre de joueurs</div>
          <p className="detail-poll-none">Aucun sondage sur BoardGameGeek pour ce jeu.</p>
        </div>
      )}
      {/* Qui possède le jeu : la dernière chose qu'on cherche sur une fiche, donc la dernière
          de la page. Les noms en entier (la fiche a la place que la carte n'a pas), avec la
          pastille de couleur des bulles pour garder le lien avec la liste. */}
      {(owners.length > 0 || tags.length > 0) && (
        <p className="detail-owners">
          {owners.map((o) => (
            <span key={`o-${o}`} className="detail-owner">
              <i style={{ background: ownerDisplay(o, ownerMap).color }} aria-hidden="true" />{o}
            </span>
          ))}
          {tags.map((t) => (
            <span key={`t-${t}`} className="detail-owner">
              <i style={{ background: ownerDisplay(t, tagMap).color }} aria-hidden="true" />{t}
            </span>
          ))}
        </p>
      )}
      </div>
    </div>
  )
}
