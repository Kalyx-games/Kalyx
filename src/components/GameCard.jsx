import { memo, useEffect, useRef, useState } from 'react'
import { parseOwners, parseTags, ownerDisplay, ownerColor, parseExtensions, basePlayersSet, effectivePlayersSet, baseBestSet, effectiveBestSet, countsToText } from '../lib/games'
import { CollectionIcon, PlayersIcon, StarIcon, ClockIcon, ExtIcon, BarsIcon, PencilIcon, DieIcon, IndispoIcon } from './icons'
import { thumbSrc } from '../lib/img'
import { useGlisseAction } from '../lib/glisseAction'
import FondGlisse from './FondGlisse'
import { BGG_LOGO } from '../lib/logos'

// Une carte compacte représentant un jeu dans la liste.
// Toutes les infos (joueurs, idéal, complexité, durée, propriétaire) sont dans
// un seul flux qui passe à la ligne tout seul quand c'est long (responsive).

// Monogramme d'un jeu sans image : initiales des 2 premiers mots (sinon 2 lettres).
function monogram(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (name || '?').trim().slice(0, 2).toUpperCase()
}

function formatPrice(p) {
  const n = Number(p)
  if (Number.isNaN(n)) return ''
  return `${n.toFixed(2).replace('.', ',')} €`
}

// Hauteur de la vignette — DOIT rester synchro avec .game-thumb / .game (index.css).
const THUMB_H = 88

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

// Au-delà d'une butée, la carte SUIT toujours le doigt, de moins en moins : elle résiste
// au lieu de buter. La courbe est asymptotique — on peut tirer aussi fort qu'on veut, on
// n'ira jamais bien loin — et elle démarre à 0,42 pour que le premier millimètre au-delà
// de la butée reste franchement perceptible (mesuré : à 400 px de doigt, 28 px de carte).
// ⚠️ le débord vers la DROITE est plafonné plus court : `.swipe-row` est en overflow:hidden
// et porte l'ombre de la carte, donc au-delà la carte glisserait dans un cadre immobile.
const DEBORD_DROITE = 14
// `fond` : la butée profonde quand une action de bout existe (BGG). La carte SUIT alors le
// doigt au-delà du menu — c'est le chemin du « glissé jusqu'au bout » — au lieu de résister.
// Sans action de bout (hors ligne, jeu sans fiche BGG), l'élastique reste.
function retenue(x, ouvert, fond) {
  if (x > 0) return Math.min(DEBORD_DROITE, mou(x))
  if (x < ouvert) {
    if (fond != null) return Math.max(x, fond)
    return ouvert + mou(x - ouvert)
  }
  return x
}

function GameCard({ game, online, onEdit, onMove, onBgg, onNewPlay, onCardClick, onImageClick, metaLine, ownerMap, tagMap, compte = null, index = 0 }) {
  const complexity = game.complexity ? Number(game.complexity) : null
  // Complexité sur 3 barres : plafonnée à 3, arrondie au demi près (remplissage partiel possible).
  const cx = complexity ? Math.min(3, complexity) : 0
  const cxRounded = Math.round(cx * 2) / 2
  const extensions = parseExtensions(game.extensions)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  // Bulles propriétaires + tags : empilées en bas à gauche de l'image. Si la pile
  // dépasse la hauteur de l'image, la carte s'agrandit pour les contenir (min-height
  // sur la colonne image, image poussée en bas → la pile monte dans l'espace gagné).
  // ⚠️ La bulle du COMPTE ACTIF ne s affiche pas : sur ses propres jeux elle est vraie
  // partout, donc elle n apprend rien et se répète sur cent cartes. Elle ne reparaît que
  // sur les jeux d un AUTRE compte — là, elle dit enfin quelque chose.
  const ownerList = parseOwners(game.owner).filter((o) => o !== compte)
  const tagList = parseTags(game.tags)
  const bubbleCount = ownerList.length + tagList.length
  const BUBBLE_H = 20
  const BUBBLE_GAP = 3
  const stackH = bubbleCount ? bubbleCount * BUBBLE_H + (bubbleCount - 1) * BUBBLE_GAP : 0
  // La pile de bulles déborde sous l'image quand elle dépasse sa hauteur → on réserve la place.
  const thumbColStyle = stackH > THUMB_H + 10 ? { minHeight: stackH - 10 } : undefined

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

  // --- LE GESTE : deux actions directionnelles, plus de menu ---
  // Tirer vers la DROITE lance l'action « positive » de l'écran (nouvelle partie en
  // collection, passage en collection en wishlist) ; vers la GAUCHE, BoardGameGeek. Même
  // geste, mêmes côtés, en vue liste comme en vue grille.
  // ⚠️ L'édition n'est plus un geste : en collection elle vit sur la fiche (que le tap
  // ouvre), en wishlist sur un bouton de la carte — car là, le tap mène chez Philibert.
  const cardRef = useRef(null)
  const { offset, arme, sens, dragging, gRef } = useGlisseAction(cardRef, {
    gauche: online ? onBgg || null : null,
    droite: online ? onNewPlay || onMove || null : null,
  })
  // ⚠️ Quand l'action n'est pas disponible, on montre quand même quelque chose : un fond gris
  // qui dit POURQUOI. Sans cela, la carte glissait sur le vide et on pouvait croire à une panne.
  const raisonBgg = !online ? 'Hors ligne' : !game.bgg_id ? 'Pas de fiche BGG' : null
  const fondGauche = onBgg
    ? {
        bg: '#566070',
        node: (
          <img
            className="bgg-logo"
            src={BGG_LOGO}
            alt=""
            width="22"
            height="22"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ),
      }
    : { indispo: true, label: raisonBgg || 'Indisponible', node: <IndispoIcon size={20} /> }
  const fondDroite = onNewPlay
    ? { bg: '#4e7a5c', node: <DieIcon size={20} /> }
    : onMove
    ? { bg: '#4e7a5c', node: <CollectionIcon size={20} color="#fff" /> }
    : { indispo: true, label: 'Hors ligne', node: <IndispoIcon size={20} /> }


  const onCardTap = () => {
    if (gRef.current.justSwiped) return // on vient de glisser → pas de navigation
    if (onCardClick) onCardClick()
  }

  return (
    <div className="swipe-row" style={{ animationDelay: delay }}>
      <FondGlisse sens={sens} arme={arme} gauche={fondGauche} droite={fondDroite} />
    <article
      ref={cardRef}
      className={`game ${onCardClick ? 'clickable' : ''} ${dragging ? 'swiping' : ''}`}
      onClick={onCardTap}
      style={{ transform: `translateX(${offset}px)` }}
    >
      <div className="game-thumb-col" style={thumbColStyle}>
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
              // Pas d'image : monogramme coloré (initiales du jeu) plutôt qu'un dé générique.
              <span className="game-thumb-fallback" style={{ background: ownerColor(game.name || '?') }}>
                {monogram(game.name)}
              </span>
            )}
          </div>
          {/* Bulles empilées en bas à gauche : la 1re (propriétaire) est à cheval sur le
              coin bas-gauche, les suivantes montent. */}
          {bubbleCount > 0 && (
            <div className="owner-bubbles" onClick={(e) => e.stopPropagation()}>
              {ownerList.map((o) => {
                const d = ownerDisplay(o, ownerMap)
                return (
                  <span key={`o-${o}`} className="owner-bubble" style={{ background: d.color }} title={o}>
                    {d.initials}
                  </span>
                )
              })}
              {tagList.map((t) => {
                const d = ownerDisplay(t, tagMap)
                return (
                  <span key={`t-${t}`} className="owner-bubble" style={{ background: d.color }} title={`Tag : ${t}`}>
                    {d.initials}
                  </span>
                )
              })}
            </div>
          )}
          {/* Le PRIX en wishlist : une pastille sur la jaquette, coin bas-DROIT (les bulles de
              propriétaire occupent le bas-gauche). Exactement le même traitement qu en vue
              grille — le prix vit toujours au même endroit, sur l image, et il ne se mêle plus
              aux infos grises du jeu, où il détonnait. */}
          {game.status === 'wishlist' && game.price != null && (
            <span className="prix-pastille">{formatPrice(game.price)}</span>
          )}
        </div>
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
          <span className="m-players" title={playersTitle}><PlayersIcon size={13} /> {playersDisplay}</span>
          <span className="m-time" title="Durée"><ClockIcon size={13} /> {durationLabel(game)}</span>
          <span className="m-ideal" title="Joueurs idéal">{idealDisplay ? <><StarIcon size={13} /> {idealDisplay}</> : ''}</span>
          <span className="cx" title={complexity ? `Complexité ${complexity.toFixed(1)} / 5` : 'Complexité inconnue'}>
            <BarsIcon size={13} />
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
            <ExtIcon size={12} /> <span>{extensions.join(', ')}</span>
          </div>
        )}
        {/* Info liée au tri en cours (parties jouées, dernière partie…), sinon absente. */}
        {metaLine && <div className="game-playinfo">{metaLine}</div>}
      </div>

      {/* ⚠️ ÉDITER, uniquement en WISHLIST. En collection le tap ouvre la fiche, qui porte
          déjà « Éditer » ; en wishlist il mène chez Philibert — sans ce bouton, un jeu de la
          wishlist ne serait plus modifiable nulle part depuis la liste. */}
      {onEdit && (
        <button
          type="button"
          className="game-edit"
          onClick={(e) => { e.stopPropagation(); if (gRef.current.justSwiped) return; onEdit() }}
          disabled={!online}
          aria-label="Éditer"
          title="Éditer"
        >
          <PencilIcon size={17} />
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
    // Changer de compte change les bulles affichées → les cartes doivent se redessiner.
    prev.compte === next.compte &&
    // Sans ça, créer une fiche ne redessinait pas la carte → elle gardait l'ancien
    // onCardClick (sans fiche) et recliquer rouvrait l'éditeur au lieu de l'historique.
    prev.hasSheet === next.hasSheet &&
    // La ligne d'info dépend du tri : elle doit se redessiner quand le tri change.
    prev.metaLine === next.metaLine
)
