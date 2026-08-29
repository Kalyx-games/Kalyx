import { memo, useEffect, useRef, useState } from 'react'
import { ownerColor } from '../lib/games'
import { thumbSrc } from '../lib/img'
import { mou } from '../lib/geste'
import { vibre } from '../lib/haptique'
import { BGG_LOGO } from '../lib/logos'

// Une TUILE de la vue grille : la jaquette d'abord, le nom dessous. Le tap mène au même
// endroit que depuis la liste ; le GLISSÉ (dans les deux sens) ouvre BoardGameGeek, comme
// le glissé complet d'une carte en vue liste.

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

// Proportions du geste, en fraction de la LARGEUR de la tuile (elle fait ~112 px sur un
// téléphone, ~180 sur grand écran) : un seuil en pixels fixes serait trop dur ici et trop
// facile là. L'hystérésis évite qu'un doigt posé sur le seuil fasse clignoter l'état.
const SEUIL = 0.38
const HYST = 0.1
const LIBRE = 0.55 // au-delà, la tuile résiste au lieu de suivre le doigt

function GameTile({ game, online, onCardClick, onBgg, metaLine, index = 0 }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [offset, setOffset] = useState(0)
  const [arme, setArme] = useState(false)
  const [dragging, setDragging] = useState(false)
  const imgRef = useRef(null)
  const rowRef = useRef(null)
  const gRef = useRef({ dir: null, startX: 0, startY: 0, width: 0, arme: false, justSwiped: false })
  // Le callback est recréé à chaque rendu de App : on le lit par ref pour ne pas avoir à
  // l'inclure dans le comparateur du memo (qui ne retiendrait alors plus rien).
  const bggRef = useRef(onBgg)
  bggRef.current = onBgg
  const fullImg = game.image_url
  // L'image du jeu peut changer sans que la tuile soit remontée (correction d'une URL
  // cassée depuis la fiche) : sans ce reset, elle resterait bloquée sur le monogramme.
  // ⚠️ Et si l'image est DÉJÀ en cache (actualisation !), `onLoad` ne se déclenche jamais :
  // sans ce test de `complete`, la tuile resterait vide — c'est ce qu'on voyait au reload.
  useEffect(() => {
    setBroken(false)
    setLoaded(false)
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true)
  }, [fullImg])
  const showImg = Boolean(fullImg) && !broken

  // Le GLISSÉ, dans les deux sens. Écouteurs NATIFS non passifs : ceux de React sont
  // passifs et ne peuvent pas `preventDefault`, donc le navigateur garderait le geste
  // pour son défilement (même raison qu'en vue liste).
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const g = gRef.current
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
        else if (Math.abs(dy) > 8) g.dir = 'v' // vertical → on laisse défiler la grille
      }
      if (g.dir !== 'h') return
      e.preventDefault() // le geste est à nous
      const libre = g.width * LIBRE
      // Suivi 1:1 jusqu'à `libre`, puis résistance : on peut tirer autant qu'on veut sans
      // que la tuile quitte sa case.
      const sens = dx < 0 ? -1 : 1
      const a = Math.abs(dx)
      const suivi = a <= libre ? a : libre + mou(a - libre)
      setOffset(sens * suivi)
      // Pas de BoardGameGeek pour ce jeu (hors ligne, ou pas de fiche BGG) → élastique seul :
      // la tuile bouge, mais rien ne s'arme et rien ne se lancera.
      if (!bggRef.current) return
      const seuil = g.width * SEUIL
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
    // `annule` : le système a repris le geste (appel entrant, notification…). On range la
    // tuile SANS lancer l'action — un glissé interrompu n'est pas un glissé validé.
    const onEnd = (annule) => {
      if (g.dir === 'h') {
        setDragging(false)
        setOffset(0)
        if (g.arme) {
          g.arme = false
          setArme(false)
          if (annule !== true) bggRef.current?.()
        }
        // Le clic de fin de geste arrive APRÈS le touchend : sans ce drapeau, lâcher la
        // tuile ouvrirait aussi sa fiche.
        g.justSwiped = true
        setTimeout(() => { g.justSwiped = false }, 130)
      }
      g.dir = null
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
  }, [])

  // Sous le nom : la valeur du tri en cours si elle n'est pas déjà visible (prix en
  // wishlist, parties jouées…), sinon les deux repères de base.
  const price = game.status === 'wishlist' && game.price != null ? formatPrice(game.price) : null

  return (
    <div className={`gtile-row${arme ? ' arme' : ''}`} ref={rowRef} style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}>
      {/* Révélé de part et d'autre quand la tuile glisse. `aria-hidden` : l'action est déjà
          annoncée par le bouton BGG du menu de la vue liste, et ce fond n'est pas focalisable. */}
      {onBgg && (
        <span className="gtile-bgg" aria-hidden="true">
          <img src={BGG_LOGO} alt="" width="26" height="26" />
          <span>BGG</span>
        </span>
      )}
      <button
        type="button"
        className="gtile"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        onClick={() => {
          if (gRef.current.justSwiped) return
          onCardClick?.()
        }}
        disabled={!onCardClick}
        title={game.name}
      >
        <div className="gtile-art">
          {showImg ? (
            <img
              ref={imgRef}
              src={thumbSrc(fullImg, 384)}
              alt=""
              loading="lazy"
              className={`gtile-img${loaded ? ' loaded' : ''}`}
              onLoad={() => setLoaded(true)}
              onError={(e) => {
                // Optimiseur indisponible → image brute ; image brute cassée → monogramme.
                if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg
                else setBroken(true)
              }}
            />
          ) : (
            <span className="gtile-fallback" style={{ background: ownerColor(game.name) }}>{monogram(game.name)}</span>
          )}
        </div>
        <span className="gtile-name">{game.name}</span>
        {(price || metaLine) && <span className="gtile-sub">{price || metaLine}</span>}
      </button>
    </div>
  )
}

// Même comparateur que la carte liste : sans lui, taper dans la recherche redessinerait
// les ~100 tuiles (les callbacks sont recréés à chaque rendu de App). `onBgg` n'y figure
// pas : sa PRÉSENCE ne dépend que de `game` et `online`, tous deux comparés.
export default memo(
  GameTile,
  (prev, next) =>
    prev.game === next.game &&
    prev.online === next.online &&
    prev.metaLine === next.metaLine
)
