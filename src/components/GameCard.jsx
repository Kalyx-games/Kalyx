import { memo, useEffect, useRef, useState } from 'react'
import { parseOwners, parseTags, ownerDisplay, parseExtensions, basePlayersSet, effectivePlayersSet, baseBestSet, effectiveBestSet, countsToText } from '../lib/games'
import { CollectionIcon } from './icons'

// Une carte compacte représentant un jeu dans la liste.
// Toutes les infos (joueurs, idéal, complexité, durée, propriétaire) sont dans
// un seul flux qui passe à la ligne tout seul quand c'est long (responsive).

function formatPrice(p) {
  const n = Number(p)
  if (Number.isNaN(n)) return ''
  return `${n.toFixed(2).replace('.', ',')} €`
}

// URL de la miniature = l'image du champ image, redimensionnée par l'optimiseur Vercel
// (/_vercel/image). Même image que le plein écran, juste plus petite et en webp.
// w=256 = net même sur écran retina (la vignette fait ~66px). q=72 = bon compromis.
function thumbSrc(url, w = 256) {
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=72`
}

// Une seule durée par jeu : on affiche le maximum (les jeux ont min = max).
// < 60 min → « 45 min » ; ≥ 60 min → format heures compact (« 1 h », « 1h30 », « 2 h »)
// — plus lisible pour les gros jeux et plus court (tient dans la colonne étroite).
function durationLabel(g) {
  const d = g.duration_max ?? g.duration_min
  if (!d) return '—'
  if (d < 60) return `${d} min`
  const h = Math.floor(d / 60)
  const m = d % 60
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
}

// Une seule carte « swipée » ouverte à la fois : on garde une référence vers la
// dernière ouverte pour la refermer quand une autre s'ouvre.
let openCard = null // { close: () => void }

function GameCard({ game, online, onEdit, onMove, onBgg, onCardClick, onImageClick, ownerMap, tagMap, index = 0 }) {
  const complexity = game.complexity ? Number(game.complexity) : null
  // Complexité sur 3 barres : plafonnée à 3, arrondie au demi près (remplissage partiel possible).
  const cx = complexity ? Math.min(3, complexity) : 0
  const cxRounded = Math.round(cx * 2) / 2
  const extensions = parseExtensions(game.extensions)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  // Joueurs : base, puis entre parenthèses ce que les extensions AJOUTENT.
  const basePlayers = basePlayersSet(game)
  const extraPlayers = effectivePlayersSet(game).filter((n) => !basePlayers.includes(n))
  const playersBaseText = countsToText(basePlayers)
  const playersDisplay = (playersBaseText || '—') + (extraPlayers.length ? ` (${countsToText(extraPlayers)})` : '')
  const playersTitle = extraPlayers.length ? `${playersBaseText} seul, +${countsToText(extraPlayers)} avec extensions` : 'Joueurs'

  // Nombre de joueurs idéal : idem (base + ajouts des extensions entre parenthèses).
  const baseBest = baseBestSet(game)
  const extraBest = effectiveBestSet(game).filter((n) => !baseBest.includes(n))
  const bestBaseText = countsToText(baseBest)
  const idealDisplay = bestBaseText
    ? bestBaseText + (extraBest.length ? ` (${countsToText(extraBest)})` : '')
    : extraBest.length
    ? `(${countsToText(extraBest)})`
    : ''

  // Sur la carte : la MÊME image que le plein écran (game.image_url), mais réduite par
  // l'optimiseur d'images de Vercel → légère (webp) et toujours corrélée au zoom.
  // Repli sur l'image brute si son domaine n'est pas géré par l'optimiseur (géré dans onError).
  const fullImg = game.image_url
  const cardImg = fullImg ? thumbSrc(fullImg) : ''

  // Si l'image ne charge pas (URL invalide, hors ligne…), on retombe sur le dé.
  const [imgBroken, setImgBroken] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const imgRef = useRef(null)
  useEffect(() => setImgBroken(false), [fullImg])
  // Réinitialise le fondu à chaque nouvelle image ; si déjà en cache, marque chargé.
  useEffect(() => {
    setImgLoaded(false)
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) setImgLoaded(true)
  }, [fullImg])
  const showImg = Boolean(fullImg) && !imgBroken

  // Titre trop long → il défile (aller-retour doux) au lieu d'être coupé.
  const nameRef = useRef(null)
  const [scroll, setScroll] = useState(null) // null | { dist, dur }
  useEffect(() => {
    const el = nameRef.current
    if (!el) return
    // « Animations réduites » : on ne fait pas défiler (on garde l'ellipsis « … »,
    // repère clair d'un nom tronqué, plutôt qu'un mot figé coupé net).
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const measure = () => {
      if (reduce) { setScroll(null); return }
      const over = el.scrollWidth - el.clientWidth
      setScroll((prev) => {
        if (over <= 6) return prev === null ? prev : null
        if (prev && prev.dist === over) return prev // même valeur → évite une boucle avec le ResizeObserver
        return { dist: over, dur: Math.max(5, over / 22 + 3) }
      })
    }
    measure()
    // Re-mesure quand la largeur du titre change (mise en page qui se stabilise après le
    // montage, rotation de l'écran, redimensionnement…) → fiable même si la 1re mesure
    // arrive trop tôt (cas mobile où le nom apparaissait tronqué sans défiler).
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Les polices peuvent changer la largeur du texte une fois chargées.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [game.name])

  // Apparition en cascade : petit décalage selon la position (plafonné pour rester vif).
  const delay = `${Math.min(index, 12) * 28}ms`

  // --- Glisser-pour-éditer, avec « peek » : un liseré de l'action « Éditer » reste
  // toujours visible au bord droit (affordance + zone cliquable de secours). On glisse
  // la carte vers la gauche pour la révéler entièrement. Écouteurs tactiles NATIFS non
  // passifs (les seuls capables de preventDefault sur iOS pour capter le geste). ---
  // Menu au dos de la carte, révélé en glissant vers la gauche (ou en tapant le chevron) :
  // Éditer, + « Déplacer vers la collection » en wishlist.
  // Ordre du menu (rendu de gauche à droite) : autres actions, puis Éditer, puis BGG
  // → depuis le bord droit (là où on commence à glisser) : BGG en 1er, Éditer en 2e.
  const ACTION_W = 76
  const actions = []
  if (onMove) actions.push({ key: 'move', label: 'Vers collection', node: <CollectionIcon size={20} color="#fff" />, bg: '#16a34a', run: onMove })
  if (onEdit) actions.push({ key: 'edit', label: 'Éditer', ico: '✏️', bg: 'var(--primary)', run: onEdit })
  if (onBgg)
    actions.push({
      key: 'bgg',
      label: 'BGG',
      node: (
        <img
          className="bgg-logo"
          src="https://www.google.com/s2/favicons?domain=boardgamegeek.com&sz=64"
          alt=""
          width="22"
          height="22"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ),
      bg: '#475569',
      run: onBgg,
    })
  const menuW = actions.length * ACTION_W
  const OPEN = -menuW
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const offsetRef = useRef(0)
  offsetRef.current = offset
  const openRef = useRef(OPEN)
  openRef.current = OPEN
  const cardRef = useRef(null)
  const gRef = useRef({ startX: 0, startY: 0, base: 0, dir: null, moved: false, justSwiped: false })

  // Une seule carte ouverte à la fois : à l'ouverture, on referme la précédente.
  const meRef = useRef(null)
  if (!meRef.current) meRef.current = { close: () => {} }
  meRef.current.close = () => setOffset(0)
  useEffect(() => {
    if (offset !== 0) {
      if (openCard && openCard !== meRef.current) openCard.close()
      openCard = meRef.current
    } else if (openCard === meRef.current) {
      openCard = null
    }
  }, [offset])

  useEffect(() => {
    const el = cardRef.current
    if (!el || !onEdit) return
    const g = gRef.current
    const onStart = (e) => {
      const t = e.touches[0]
      g.startX = t.clientX; g.startY = t.clientY; g.base = offsetRef.current; g.dir = null; g.moved = false
    }
    const onMove = (e) => {
      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY
      if (!g.dir) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) { g.dir = 'h'; setDragging(true) }
        else if (Math.abs(dy) > 8) g.dir = 'v' // vertical → on laisse défiler la liste
      }
      if (g.dir === 'h') {
        e.preventDefault() // on prend le geste (pas de scroll)
        g.moved = true
        setOffset(Math.max(openRef.current, Math.min(0, g.base + dx)))
      }
    }
    const onEnd = () => {
      if (g.dir === 'h') {
        setDragging(false)
        setOffset((o) => (o < openRef.current / 2 ? openRef.current : 0)) // aimante ouvert/fermé
        g.justSwiped = true
        setTimeout(() => { g.justSwiped = false }, 130)
      }
      g.dir = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEdit])

  const onCardTap = () => {
    if (gRef.current.justSwiped) return // on vient de glisser → pas de navigation
    if (offset !== 0) { setOffset(0); return } // ouverte → on referme
    if (onCardClick) onCardClick()
  }

  return (
    <div className="swipe-row" style={{ animationDelay: delay }}>
      {actions.length > 0 && (
        <div className="swipe-menu" style={{ width: menuW }}>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              className="swipe-act"
              style={{ width: ACTION_W, background: a.bg }}
              onClick={() => { setOffset(0); a.run() }}
              disabled={!online}
              aria-label={a.label}
            >
              <span className="swipe-act-ico">{a.node || a.ico}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    <article
      ref={cardRef}
      className={`game ${onCardClick ? 'clickable' : ''} ${dragging ? 'swiping' : ''}`}
      onClick={onCardTap}
      style={{ transform: `translateX(${offset}px)` }}
    >
      <div className="game-thumb-col">
        {/* Conteneur non-rogné : permet à la 1re bulle de déborder à gauche de l'image. */}
        <div className="game-thumb-wrap">
          <div className="game-thumb">
            {showImg ? (
              <img
                ref={imgRef}
                src={cardImg}
                alt=""
                loading="lazy"
                className={`game-img ${imgLoaded ? 'loaded' : ''} ${onImageClick ? 'zoomable' : ''}`}
                onLoad={() => setImgLoaded(true)}
                onError={(e) => {
                  // Si l'optimiseur échoue (domaine non géré…), on tente l'image brute avant le dé.
                  if (fullImg && e.currentTarget.src !== fullImg) {
                    e.currentTarget.src = fullImg
                  } else {
                    setImgBroken(true)
                  }
                }}
                onClick={onImageClick ? (e) => { e.stopPropagation(); if (gRef.current.justSwiped) return; onImageClick(fullImg) } : undefined}
              />
            ) : (
              <span className="game-thumb-fallback">🎲</span>
            )}
          </div>
          {/* Bulles propriétaires + tags en bas à gauche : la 1re est à cheval sur le bord. */}
          {(parseOwners(game.owner).length > 0 || parseTags(game.tags).length > 0) && (
            <div className="owner-bubbles" onClick={(e) => e.stopPropagation()}>
              {parseOwners(game.owner).map((o) => {
                const d = ownerDisplay(o, ownerMap)
                return (
                  <span key={`o-${o}`} className="owner-bubble" style={{ background: d.color }} title={o}>
                    {d.initials}
                  </span>
                )
              })}
              {parseTags(game.tags).map((t) => {
                const d = ownerDisplay(t, tagMap)
                return (
                  <span key={`t-${t}`} className="owner-bubble" style={{ background: d.color }} title={`Tag : ${t}`}>
                    {d.initials}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        {game.status === 'wishlist' && game.price != null && (
          <span className="game-price game-price-below">{formatPrice(game.price)}</span>
        )}
      </div>

      <div className="game-body">
        <div className="game-head">
          <h3
            className={`game-name ${scroll ? 'scroll' : ''}`}
            ref={nameRef}
            style={scroll ? { '--mq-dist': `-${scroll.dist}px`, '--mq-dur': `${scroll.dur}s` } : undefined}
          >
            {scroll ? <span className="game-name-inner">{game.name}</span> : game.name}
          </h3>
        </div>

        {/* Grille 2×2 à positions fixes, groupée par thème : colonne GAUCHE = joueurs
            (👥 puis ⭐), colonne DROITE = poids du jeu (🕑 puis 🧠). Chaque info toujours
            au même endroit → comparaison au coup d'œil en faisant défiler la liste.
            Ordre DOM = joueurs, durée, idéal, complexité (remplissage ligne par ligne). */}
        <div className="game-meta">
          <span className="m-players" title={playersTitle}>👥 {playersDisplay}</span>
          <span className="m-time" title="Durée">🕑 {durationLabel(game)}</span>
          <span className="m-ideal" title="Joueurs idéal">{idealDisplay ? `⭐ ${idealDisplay}` : ''}</span>
          <span className="cx" title={complexity ? `Complexité ${complexity.toFixed(1)} / 5` : 'Complexité inconnue'}>
            🧠
            <span className="cx-bars">
              {[0, 1, 2].map((i) => {
                const frac = Math.max(0, Math.min(1, cxRounded - i))
                return (
                  <span key={i} className="cx-bar">
                    <span className="cx-fill" style={{ width: `${frac * 100}%` }} />
                  </span>
                )
              })}
            </span>
          </span>
        </div>

        {extensions.length > 0 && (
          <div className="game-ext" title="Extensions">
            🧩 {extensions.join(', ')}
          </div>
        )}
      </div>

      {/* Chevron discret au bord droit : indique qu'on peut glisser la carte ; le taper
          ouvre (ou referme) le menu derrière la carte. */}
      {actions.length > 0 && (
        <button
          type="button"
          className={`swipe-hint ${offset !== 0 ? 'open' : ''}`}
          onClick={(e) => { e.stopPropagation(); setOffset(offsetRef.current === 0 ? OPEN : 0) }}
          aria-label={offset !== 0 ? 'Fermer le menu' : 'Ouvrir le menu'}
          title="Glisser ou toucher pour ouvrir le menu"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </article>
    </div>
  )
}

// On ne redessine une carte que si SES données changent (game, en-ligne, bulles).
// Les callbacks (onEdit, onCardClick…) sont ignorés : ils font toujours la même chose
// pour un jeu donné, donc taper dans la recherche ne redessine plus les ~100 cartes.
export default memo(
  GameCard,
  (prev, next) =>
    prev.game === next.game &&
    prev.online === next.online &&
    prev.ownerMap === next.ownerMap &&
    prev.tagMap === next.tagMap &&
    // Sans ça, créer une fiche ne redessinait pas la carte → elle gardait l'ancien
    // onCardClick (sans fiche) et recliquer rouvrait l'éditeur au lieu de l'historique.
    prev.hasSheet === next.hasSheet
)
