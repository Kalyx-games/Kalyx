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

  // --- Glisser-pour-éditer : l'édition n'est plus un bouton ; on glisse la carte vers
  // la gauche pour révéler « Éditer ». touch-action: pan-y → le défilement vertical
  // marche normalement, seul l'horizontal nous revient. ---
  const EDIT_W = 78
  const [swipeX, setSwipeX] = useState(0)
  const dragRef = useRef({ startX: 0, base: 0, active: false, moved: false })

  const onPointerDownCard = (e) => {
    if (!onEdit || (e.pointerType === 'mouse' && e.button !== 0)) return
    // Capture : tous les événements restent routés vers la carte même quand elle
    // coulisse sous le doigt (sinon onPointerMove cesse dès qu'elle bouge).
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    dragRef.current = { startX: e.clientX, base: swipeX, active: true, moved: false }
  }
  const onPointerMoveCard = (e) => {
    const d = dragRef.current
    if (!d.active) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 4) d.moved = true
    setSwipeX(Math.max(-EDIT_W, Math.min(0, d.base + dx)))
  }
  const endDrag = () => {
    const d = dragRef.current
    if (!d.active) return
    d.active = false
    setSwipeX((x) => (x < -EDIT_W / 2 ? -EDIT_W : 0))
  }
  const onCardTap = (e) => {
    // Après un glissé, ou si la carte est ouverte → on ne déclenche pas le clic (on ferme).
    if (dragRef.current.moved) { e.stopPropagation(); return }
    if (swipeX !== 0) { e.stopPropagation(); setSwipeX(0); return }
    if (onCardClick) onCardClick()
  }

  // Indice au tout premier lancement : la 1re carte s'entrouvre une fois pour montrer
  // qu'on peut glisser (puis se referme). Mémorisé pour ne le faire qu'une seule fois.
  useEffect(() => {
    if (index !== 0 || !onEdit) return
    let ok = false
    try {
      if (!localStorage.getItem('kalyx-swipe-hint')) { localStorage.setItem('kalyx-swipe-hint', '1'); ok = true }
    } catch { ok = false }
    if (!ok) return
    const t1 = setTimeout(() => setSwipeX(-EDIT_W * 0.72), 700)
    const t2 = setTimeout(() => setSwipeX(0), 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="swipe-row">
      {onEdit && (
        <button
          type="button"
          className="swipe-edit"
          style={{ width: EDIT_W }}
          onClick={() => { setSwipeX(0); onEdit() }}
          disabled={!online}
          aria-label="Modifier"
        >
          <span className="swipe-edit-ico">✏️</span>
          <span>Éditer</span>
        </button>
      )}
    <article
      className={`game ${onCardClick ? 'clickable' : ''}`}
      onClick={onCardTap}
      onPointerDown={onPointerDownCard}
      onPointerMove={onPointerMoveCard}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ animationDelay: delay, transform: `translateX(${swipeX}px)`, transition: dragRef.current.active ? 'none' : 'transform 0.22s ease', touchAction: 'pan-y' }}
    >
      <div className="game-thumb-col">
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
              onClick={onImageClick ? (e) => { e.stopPropagation(); if (dragRef.current.moved) return; onImageClick(fullImg) } : undefined}
            />
          ) : (
            <span className="game-thumb-fallback">🎲</span>
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

      <div className="game-actions" onClick={(e) => e.stopPropagation()}>
        <div className="game-btns">
          {onMove && (
            <button onClick={onMove} disabled={!online} title="Déplacer vers la collection" aria-label="Déplacer vers la collection">
              <CollectionIcon size={16} />
            </button>
          )}
          {onBgg && (
            <button onClick={onBgg} title="Voir sur BoardGameGeek" aria-label="Voir sur BoardGameGeek">
              <img className="bgg-logo" src="https://www.google.com/s2/favicons?domain=boardgamegeek.com&sz=64" alt="" width="18" height="18" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            </button>
          )}
        </div>
        {(parseOwners(game.owner).length > 0 || parseTags(game.tags).length > 0) && (
          <div className="owner-bubbles">
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
