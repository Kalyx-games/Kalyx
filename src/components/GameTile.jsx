import { memo, useEffect, useState } from 'react'
import { parseOwners, parseTags, ownerDisplay, ownerColor } from '../lib/games'
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

function GameTile({ game, online, onCardClick, metaLine, ownerMap, tagMap, index = 0 }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const fullImg = game.image_url
  // L'image du jeu peut changer sans que la tuile soit remontée (correction d'une URL
  // cassée depuis la fiche) : sans ce reset, elle resterait bloquée sur le monogramme.
  useEffect(() => {
    setBroken(false)
    setLoaded(false)
  }, [fullImg])
  const showImg = Boolean(fullImg) && !broken

  const owners = parseOwners(game.owner)
  const tags = parseTags(game.tags)
  const bubbles = [
    ...owners.map((n) => ({ key: 'o:' + n, ...ownerDisplay(n, ownerMap) })),
    ...tags.map((n) => ({ key: 't:' + n, ...ownerDisplay(n, tagMap) })),
  ]

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
            src={thumbSrc(fullImg, 384)}
            alt=""
            loading="lazy"
            className={`gtile-img${loaded ? ' loaded' : ''}`}
            onLoad={(e) => { if (e.currentTarget.complete) setLoaded(true) }}
            onError={(e) => {
              // Optimiseur indisponible → image brute ; image brute cassée → monogramme.
              if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg
              else setBroken(true)
            }}
          />
        ) : (
          <span className="gtile-fallback" style={{ background: ownerColor(game.name) }}>{monogram(game.name)}</span>
        )}
        {bubbles.length > 0 && (
          <span className="gtile-bubbles" aria-hidden="true">
            {bubbles.slice(0, 3).map((b) => (
              <span key={b.key} className="owner-bubble" style={{ background: b.color }}>{b.initials}</span>
            ))}
          </span>
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
    prev.ownerMap === next.ownerMap &&
    prev.tagMap === next.tagMap &&
    prev.metaLine === next.metaLine
)
