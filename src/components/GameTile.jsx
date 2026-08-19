import { memo, useEffect, useRef, useState } from 'react'
import { ownerColor } from '../lib/games'
import { thumbSrc } from '../lib/img'

// Une TUILE de la vue grille : la jaquette d'abord, le nom dessous. Pas de gestes ici
// (le menu de glissement reste à la vue liste) — la tuile sert à retrouver un jeu de
// mémoire visuelle, et le tap mène au même endroit que depuis la liste.

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

function GameTile({ game, online, onCardClick, metaLine, index = 0 }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)
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

  // Sous le nom : la valeur du tri en cours si elle n'est pas déjà visible (prix en
  // wishlist, parties jouées…), sinon les deux repères de base.
  const price = game.status === 'wishlist' && game.price != null ? formatPrice(game.price) : null

  return (
    <button
      type="button"
      className="gtile"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      onClick={onCardClick}
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
  )
}

// Même comparateur que la carte liste : sans lui, taper dans la recherche redessinerait
// les ~100 tuiles (les callbacks sont recréés à chaque rendu de App).
export default memo(
  GameTile,
  (prev, next) =>
    prev.game === next.game &&
    prev.online === next.online &&
    prev.metaLine === next.metaLine
)
