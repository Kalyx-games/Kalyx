import { useEffect, useMemo, useRef, useState } from 'react'
import { TIERS } from '../lib/tierlists'
import { passesFilters } from '../lib/filtering'
import FilterSheet from './FilterSheet'
import { FilterIcon } from './icons'
import NameField from './NameField'

// Miniature optimisée (même image que les cartes, via l'optimiseur Vercel).
const thumbSrc = (url, w = 128) => `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=72`

// Une vignette de jeu (image seule). Tap = infobulle avec le nom (géré par le parent via
// data-game). En cas d'image cassée : repli sur l'image brute, puis sur le dé 🎲.
function Chip({ game }) {
  const [broken, setBroken] = useState(false)
  const url = game.image_url
  return (
    <div className="tl-chip" data-game={game.id} data-name={game.name}>
      {url && !broken ? (
        <img
          src={thumbSrc(url)}
          alt=""
          loading="lazy"
          draggable={false}
          onError={(e) => {
            if (url && e.currentTarget.src !== url) e.currentTarget.src = url
            else setBroken(true)
          }}
        />
      ) : (
        <span className="tl-chip-fallback">🎲</span>
      )}
    </div>
  )
}

// Affiche / édite une tierlist. `mode` : 'view' (lecture seule) | 'edit' (glisser-déposer +
// auto-save) | 'global' (moyenne, lecture seule, avec zone « Non classés »).
export default function TierlistView({
  mode,
  title,
  initialRanking,
  unranked = [],
  games,
  allOwners,
  allTags,
  playerNames,
  online,
  initialPlayer = '',
  filters,
  setFilters,
  onResetFilters,
  savedId = null,
  onClose,
  onSave,
  onDelete,
}) {
  const isGlobal = mode === 'global'
  // Le mode édition est LOCAL (on peut y entrer/sortir sans quitter la tierlist). `mode`
  // ne fait que donner l'état de départ (édition à la création, lecture sinon).
  const [editing, setEditing] = useState(mode === 'edit')
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const [ranking, setRanking] = useState(initialRanking)
  const [player, setPlayer] = useState(initialPlayer)
  // `filters`/`setFilters` viennent de l'App → le menu de filtres est PARTAGÉ et persistant
  // entre toutes les vues (Collection/Wishlist/Stats/Tierlists).
  const [showFilters, setShowFilters] = useState(false)
  const [tip, setTip] = useState(null) // { name, x, y } — infobulle au tap
  const [focusedName, setFocusedName] = useState(null)
  const [needName, setNeedName] = useState(false) // on a tenté « Terminé » sans nom alors que des jeux sont classés
  const [az, setAz] = useState(false) // tri A→Z de TOUTES les lignes (lecture seule)
  const idRef = useRef(savedId)
  const rootRef = useRef(null)

  // Jeux déjà placés (dans n'importe quelle ligne).
  const placed = useMemo(() => {
    const s = new Set()
    Object.values(ranking).forEach((ids) => ids.forEach((id) => s.add(id)))
    return s
  }, [ranking])

  // Le « bac » du bas : les jeux de la collection PAS encore placés, filtrés + triés.
  // Même système de filtre que la Collection (les jeux tagués sont masqués par défaut,
  // tant qu'aucun de leurs tags n'est coché).
  const tray = useMemo(
    () =>
      games
        .filter((g) => !placed.has(g.id) && passesFilters(g, filters, '', false))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [games, placed, filters]
  )

  // Jeux non classés à montrer EN BAS (dans le défilement) hors édition :
  //  • global → la liste `unranked` fournie (jeux que personne n'a notés) ;
  //  • consultation d'un joueur → les jeux de la collection qu'il n'a pas classés.
  const readUnranked = useMemo(() => {
    if (editing) return []
    if (isGlobal) return unranked
    return games.filter((g) => !placed.has(g.id)).map((g) => g.id)
  }, [editing, isGlobal, unranked, games, placed])

  // Compté par GROUPE (comme la collection) → le badge du bouton flottant est cohérent
  // entre les deux vues, et le compteur de « Réinitialiser » (qui exclut le propriétaire,
  // conservé au reset) peut bien redescendre à 0.
  const activeFilterCount =
    (filters.owners.length ? 1 : 0) +
    (filters.tags.length ? 1 : 0) +
    (filters.players.length ? 1 : 0) +
    (filters.duration != null ? 1 : 0) +
    (filters.complexity.length ? 1 : 0)

  // Déplace un jeu vers une ligne (ou le retire si tier === null → retour au bac).
  // Déplace un jeu vers une ligne, INSÉRÉ juste avant `beforeId` (pour trier librement dans
  // la ligne) ; `beforeId` null = à la fin. tier null = retour au bac (retiré de tout).
  // On repère la position par l'ID (pas par un index numérique) → reste correct même quand
  // un filtre masque certaines vignettes déjà classées.
  // `latest` garde toujours le dernier {player, ranking}, même sans re-render (cas où un
  // déplacement et la fermeture arrivent dans le même tick) → l'auto-save à la sortie est fiable.
  const latest = useRef({ player: initialPlayer, ranking: initialRanking })
  latest.current.player = player
  const moveGame = (id, tier, beforeId) =>
    setRanking((r) => {
      const next = {}
      TIERS.forEach((t) => {
        next[t.key] = (r[t.key] || []).filter((x) => x !== id)
      })
      if (tier && next[tier]) {
        const arr = next[tier]
        const at = beforeId && arr.indexOf(beforeId) !== -1 ? arr.indexOf(beforeId) : arr.length
        arr.splice(at, 0, id)
      }
      latest.current = { player: latest.current.player, ranking: next }
      return next
    })

  // ---- Auto-save (édition) : sauvegarde peu après le dernier changement, ET on FORCE la
  // sauvegarde à la sortie du mode édition / à la fermeture (sinon un déplacement fait juste
  // avant de sortir, dans la fenêtre des 800 ms, serait perdu). On compare des SNAPSHOTS
  // (pas un flag `dirty`) : robuste même si React groupe le déplacement et la sortie. ----
  const snapOf = (p, r) => JSON.stringify({ p: (p || '').trim(), r })
  const savedSnap = useRef(snapOf(initialPlayer, initialRanking))
  const doSave = async () => {
    const { player: p, ranking: r } = latest.current
    const snap = snapOf(p, r)
    if (snap === savedSnap.current) return // rien de neuf
    if (!online || !p.trim()) return // hors ligne ou pas encore de nom → on réessaiera
    const prev = savedSnap.current
    savedSnap.current = snap
    try {
      const row = await onSave({ id: idRef.current, player: p.trim(), ranking: r })
      if (row && row.id) idRef.current = row.id
    } catch {
      savedSnap.current = prev // échec réseau → on pourra réessayer
    }
  }
  const flushRef = useRef(doSave)
  flushRef.current = doSave
  // Débounce pendant l'édition.
  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => flushRef.current(), 800)
    return () => clearTimeout(t)
  }, [ranking, player, editing])
  // Sortie du mode édition → sauvegarde immédiate de ce qui est en attente.
  useEffect(() => {
    if (!editing) flushRef.current()
  }, [editing])
  // Fermeture de la tierlist (démontage) → idem.
  useEffect(() => () => flushRef.current(), [])

  // ---- Glisser-déposer tactile + souris (édition seulement) ----
  useEffect(() => {
    if (!editing) return
    const root = rootRef.current
    if (!root) return
    let drag = null // { id, active, clone, startX, startY, hold, isTouch }

    const point = (e) => {
      const t = e.touches?.[0] || e.changedTouches?.[0]
      return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY }
    }
    const clearHighlight = () => root.querySelectorAll('.tl-over').forEach((el) => el.classList.remove('tl-over'))
    const zoneAt = (x, y) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const tierEl = el.closest('[data-tier]')
      if (tierEl) return { kind: 'tier', key: tierEl.dataset.tier, el: tierEl }
      const trayEl = el.closest('[data-tray]')
      if (trayEl) return { kind: 'tray', el: trayEl }
      return null
    }
    const begin = (x, y) => {
      if (!drag) return
      drag.active = true
      try { navigator.vibrate?.(40) } catch { /* ignore */ } // retour haptique à la prise (Android ; iOS n'a pas l'API)
      const src = root.querySelector(`[data-game="${CSS.escape(drag.id)}"]`)
      const clone = document.createElement('div')
      clone.className = 'tl-drag'
      const img = src?.querySelector('img')
      if (img) {
        const c = img.cloneNode(true)
        clone.appendChild(c)
      } else {
        clone.textContent = '🎲'
      }
      document.body.appendChild(clone)
      drag.clone = clone
      src?.classList.add('tl-dragging')
      moveClone(x, y)
    }
    const moveClone = (x, y) => {
      if (drag?.clone) {
        drag.clone.style.left = `${x}px`
        drag.clone.style.top = `${y}px`
      }
    }
    const onDown = (e) => {
      const chip = e.target.closest?.('[data-game]')
      if (!chip) return
      const isTouch = e.type === 'touchstart'
      const { x, y } = point(e)
      drag = { id: chip.dataset.game, active: false, clone: null, startX: x, startY: y, hold: null, isTouch }
      if (isTouch) {
        // Appui maintenu ~160 ms → on saisit (sinon un swipe = défilement).
        drag.hold = setTimeout(() => begin(x, y), 160)
      }
    }
    const onMove = (e) => {
      if (!drag) return
      const { x, y } = point(e)
      const dist = Math.hypot(x - drag.startX, y - drag.startY)
      if (!drag.active) {
        if (drag.isTouch) {
          if (dist > 10) {
            clearTimeout(drag.hold) // le doigt bouge avant l'appui long → c'est un défilement
            drag = null
          }
        } else if (dist > 4) {
          begin(x, y) // souris : on saisit dès un petit mouvement
        }
        return
      }
      e.preventDefault() // empêche le défilement pendant le glissé
      moveClone(x, y)
      clearHighlight()
      const z = zoneAt(x, y)
      if (z) (z.kind === 'tier' ? z.el.querySelector('.tl-slots') || z.el : z.el).classList.add('tl-over')
    }
    const finish = (e) => {
      if (!drag) return
      const d = drag
      drag = null
      if (d.hold) clearTimeout(d.hold)
      if (d.active) {
        const { x, y } = point(e)
        const z = zoneAt(x, y)
        clearHighlight()
        if (d.clone) d.clone.remove()
        root.querySelector(`[data-game="${CSS.escape(d.id)}"]`)?.classList.remove('tl-dragging')
        if (z && z.kind === 'tier') {
          // Insertion AVANT la 1re vignette « après » le point de dépôt (ordre de lecture) →
          // tri libre dans la ligne. On repère par l'ID (robuste même si un filtre masque des
          // vignettes déjà classées).
          const slots = z.el.querySelector('.tl-slots') || z.el
          const chips = [...slots.querySelectorAll('[data-game]')].filter((c) => c.dataset.game !== d.id)
          let beforeId = null
          for (let i = 0; i < chips.length; i++) {
            const r = chips[i].getBoundingClientRect()
            if (y < r.top - 2 || (y <= r.bottom + 2 && x < r.left + r.width / 2)) {
              beforeId = chips[i].dataset.game
              break
            }
          }
          moveGame(d.id, z.key, beforeId)
        } else if (z) {
          moveGame(d.id, null) // lâché sur le bac → retour aux non-classés
        }
      } else {
        // Pas de glissé = un tap → infobulle avec le nom du jeu.
        const chip = root.querySelector(`[data-game="${CSS.escape(d.id)}"]`)
        if (chip) showTip(chip)
      }
    }

    root.addEventListener('touchstart', onDown, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: false })
    root.addEventListener('touchend', finish, { passive: true })
    root.addEventListener('touchcancel', finish, { passive: true })
    root.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finish)
    return () => {
      root.removeEventListener('touchstart', onDown)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', finish)
      root.removeEventListener('touchcancel', finish)
      root.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', finish)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Infobulle du nom (tap sur une vignette), aussi en lecture seule.
  const tipTimer = useRef(null)
  const showTip = (chip) => {
    const r = chip.getBoundingClientRect()
    setTip({ name: chip.dataset.name, x: r.left + r.width / 2, y: r.top })
    clearTimeout(tipTimer.current)
    tipTimer.current = setTimeout(() => setTip(null), 1800)
  }
  // En lecture seule (view/global), un simple clic suffit pour l'infobulle.
  const onRootClick = (e) => {
    if (editing) return
    const chip = e.target.closest?.('[data-game]')
    if (chip) showTip(chip)
  }

  // Filtre d'AFFICHAGE (consultation) = MÊME système que la Collection / le bac d'édition :
  // les jeux tagués sont masqués par défaut, et réapparaissent quand un de leurs tags est coché.
  const displayMatch = (g) => passesFilters(g, filters, '', false)
  const gamesOf = (ids, filtered) => {
    const gs = ids.map((id) => gameById.get(id)).filter(Boolean)
    return filtered ? gs.filter(displayMatch) : gs
  }

  return (
    <div className="sheet tl-sheet" ref={rootRef} onClick={onRootClick}>
      <div className="settings-head tl-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">‹</button>
        {editing ? (
          <div className="tl-name-edit">
            <NameField
              id="tl-player"
              className="input"
              value={player}
              onChange={(v) => {
                setPlayer(v)
                if (v.trim()) setNeedName(false)
              }}
              onPick={(v) => {
                setPlayer(v)
                if (v.trim()) setNeedName(false)
              }}
              placeholder="Ton nom"
              playerNames={playerNames}
              focused={focusedName}
              setFocused={setFocusedName}
            />
          </div>
        ) : (
          <h2>{isGlobal ? title : player.trim() || title}</h2>
        )}
        {/* Actions à droite : édition (entrer/sortir), supprimer (existant). Le filtre est
            désormais un bouton flottant (comme la collection) → il ne mange plus l'en-tête. */}
        <div className="tl-head-actions">
          {!isGlobal &&
            (editing ? (
              // En édition : bouton pour EN SORTIR (feedback clair : vert « Terminé »). Si des
              // jeux sont classés sans nom saisi, on refuse de sortir (sinon rien n'est sauvé).
              <button
                type="button"
                className="tl-done-btn"
                onClick={() => {
                  if (!player.trim() && placed.size > 0) {
                    setNeedName(true)
                    setFocusedName(true)
                    return
                  }
                  setEditing(false)
                }}
              >
                ✓ Terminé
              </button>
            ) : (
              <button type="button" className="tl-edit-btn" onClick={() => setEditing(true)} disabled={!online} title={online ? 'Modifier' : 'Indisponible hors ligne'}>✏️</button>
            ))}
          {savedId && onDelete && (
            <button type="button" className="tl-del-btn" onClick={onDelete} disabled={!online} title={online ? 'Supprimer' : 'Indisponible hors ligne'} aria-label="Supprimer la tierlist">🗑️</button>
          )}
        </div>
      </div>
      {editing && (
        <div className="tl-editing-banner">
          {needName ? '📝 Donne un nom à ta tierlist pour l’enregistrer, puis « Terminé ».' : '✏️ Mode édition — glisse les jeux pour les classer'}
        </div>
      )}

      {/* Les lignes (drop-zones en édition). La ligne « Pas d'avis » (score null) est
          masquée dans la tierlist GLOBALE (elle n'entre pas dans la moyenne). */}
      <div className="tl-rows">
        {TIERS.filter((t) => !isGlobal || t.score != null).map((t) => {
          const list = gamesOf(ranking[t.key] || [], true)
          const shown = az ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr')) : list
          // En lecture, toute la case-lettre bascule le tri A→Z de TOUTES les lignes (zone
          // de clic large, une seule action pour tout trier).
          const labelClick = !editing ? () => setAz((v) => !v) : undefined
          return (
            <div key={t.key} className="tl-row" data-tier={t.key}>
              <div
                className={`tl-label ${!editing ? 'tl-label-btn' : ''}`}
                style={{ background: t.color }}
                onClick={labelClick}
                title={t.title || (editing ? t.label : az ? 'Ordre du créateur' : 'Trier de A à Z')}
              >
                <span className="tl-label-letter">{t.label}</span>
                {!editing && <span className={`tl-sort-ind ${az ? 'on' : ''}`}>A↓Z</span>}
              </div>
              <div className="tl-slots">
                {shown.map((g) => (
                  <Chip key={g.id} game={g} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Zone « Non classés » EN LECTURE (consultation + global) : à la suite des lignes,
            dans le défilement (pas épinglée). En édition c'est le bac épinglé qui gère ça. */}
        {!editing && (
          <div className="tl-unranked">
            {readUnranked.length > 0 ? (
              <>
                <div className="tl-tray-title">Non classés <span className="muted">({readUnranked.length})</span></div>
                <div className="tl-tray tl-tray-inline">
                  {gamesOf(readUnranked, true).map((g) => (
                    <Chip key={g.id} game={g} />
                  ))}
                </div>
              </>
            ) : (
              <p className="muted" style={{ padding: '8px 2px' }}>Tous les jeux sont classés 🎉</p>
            )}
          </div>
        )}

      </div>

      {/* Bac des jeux à classer (édition) : panneau épinglé en bas (pour glisser vers le haut). */}
      {editing && (
        <div className="tl-tray-wrap">
          <div className="tl-tray" data-tray>
            {tray.length ? (
              tray.map((g) => <Chip key={g.id} game={g} />)
            ) : (
              <p className="muted" style={{ padding: 12 }}>Tous les jeux sont classés 🎉</p>
            )}
          </div>
        </div>
      )}

      {tip && (
        <div className="tl-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.name}
        </div>
      )}

      {/* Bouton flottant des filtres : TOUJOURS en bas à droite (même en édition, pour une
          position stable). Le bac réserve un espace en bas (`.tl-tray` padding) pour que ses
          vignettes ne passent jamais sous le bouton. Masqué quand le menu de filtre est ouvert. */}
      {!showFilters && (
        <button
          type="button"
          className="fab fab-filter tl-fab-filter"
          onClick={() => setShowFilters(true)}
          aria-label="Filtres"
        >
          <FilterIcon size={22} color="currentColor" />
          {activeFilterCount > 0 && <span className="fab-badge">{activeFilterCount}</span>}
        </button>
      )}

      {showFilters && (
        <FilterSheet
          owners={allOwners}
          tags={allTags}
          filters={filters}
          setFilters={setFilters}
          showPrice={false}
          showTags
          resetCount={activeFilterCount - (filters.owners.length ? 1 : 0)}
          onReset={onResetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  )
}
