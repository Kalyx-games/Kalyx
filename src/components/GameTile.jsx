import { memo, useEffect, useRef, useState } from 'react'
import { ownerColor, parseOwners, ownerDisplay } from '../lib/games'
import { tagsPourCompte } from '../lib/tagsJeux'
import { thumbSrc } from '../lib/img'
import { useGlisseAction } from '../lib/glisseAction'
import FondGlisse from './FondGlisse'
import { DieIcon, CollectionIcon, PencilIcon, IndispoIcon, PrixIcon } from './icons'
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

function GameTile({ game, online, onCardClick, onBgg, onNewPlay, onMove, onEdit, metaLine, ownerMap, tagMap, compte = null, index = 0, demo = false }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)
  const rowRef = useRef(null)
  // Le MÊME geste que la vue liste : à droite l'action « positive » de l'écran — « Nouvelle
  // partie » en collection, le passage en collection en wishlist (la grille y est ouverte
  // depuis qu'elle porte le glissé et son propre crayon) — à gauche BoardGameGeek.
  const { offset, arme, sens, dragging, gRef } = useGlisseAction(rowRef, {
    gauche: online ? onBgg || null : null,
    // Même inversion qu'en vue liste (voir GameCard) : en wishlist le glissé édite, et le
    // bouton de la tuile fait le transfert vers la collection.
    droite: online ? onNewPlay || onEdit || null : null,
    // Le MÊME rappel qu'en vue liste, par le MÊME hook : c'est ce qui garantit qu'il ne
    // pourra jamais diverger d'une vue à l'autre.
    demo,
  })
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
  // Les bulles, comme sur les cartes de la liste : celle du COMPTE ACTIF est retirée (sur ses
  // propres jeux elle est vraie partout, donc elle n'apprend rien et se répète sur cent tuiles).
  const ownerList = parseOwners(game.owner).filter((o) => o !== compte)
  const tagList = tagsPourCompte(game.tags, compte)

  return (
    <div className={`gtile-row${arme ? ' arme' : ''}`} ref={rowRef} style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}>
      <FondGlisse
        sens={sens}
        arme={arme}
        className="glisse-fond-tuile"
        gauche={
          onBgg
            ? { bg: '#566070', node: <img className="bgg-logo" src={BGG_LOGO} alt="" width="24" height="24" /> }
            : { indispo: true, label: !online ? 'Hors ligne' : 'Pas de fiche BGG', node: <IndispoIcon size={20} /> }
        }
        droite={
          onNewPlay
            ? { bg: '#4e7a5c', node: <DieIcon size={22} /> }
            : onEdit
            ? { bg: '#3e6c8e', node: <PencilIcon size={22} /> }
            : { indispo: true, label: 'Hors ligne', node: <IndispoIcon size={20} /> }
        }
      />
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
          {(ownerList.length > 0 || tagList.length > 0) && (
            <span className="gtile-bulles" onClick={(e) => e.stopPropagation()}>
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
            </span>
          )}
        </div>
        <span className="gtile-name">{game.name}</span>
        {/* Le prix prend ici la MÊME forme qu'en vue liste : petite icône + montant en vert.
            Il occupe la sous-ligne, que la valeur du tri lui cède (en wishlist, le prix est
            l'information qu'on cherche). */}
        {price ? (
          <span className="gtile-sub gtile-prix"><PrixIcon size={12} /> {price}</span>
        ) : (
          metaLine && <span className="gtile-sub">{metaLine}</span>
        )}
      </button>
      {/* ⚠️ LE TRANSFERT VERS LA COLLECTION, en wishlist seulement. C'est le geste qu'on cherche
          du regard sur cette liste — il a donc un bouton, tandis que l'édition, plus rare, est
          passée sur le glissé (demande user). Le tap sur la tuile mène toujours chez Philibert. */}
      {onMove && (
        <button
          type="button"
          className="gtile-edit"
          onClick={(e) => { e.stopPropagation(); if (gRef.current.justSwiped) return; onMove() }}
          disabled={!online}
          aria-label="Déplacer vers la collection"
          title="Déplacer vers la collection"
        >
          <CollectionIcon size={16} color="currentColor" />
        </button>
      )}
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
    prev.metaLine === next.metaLine &&
    // Comme sur les cartes : sans ces trois-là, changer de compte ou renommer une bulle ne
    // redessinerait pas les tuiles.
    prev.ownerMap === next.ownerMap &&
    prev.tagMap === next.tagMap &&
    prev.compte === next.compte &&
    // ⚠️ Même raison qu'en vue liste : sans ça, la tuile ne recevrait jamais l'ordre de jouer.
    prev.demo === next.demo
)
