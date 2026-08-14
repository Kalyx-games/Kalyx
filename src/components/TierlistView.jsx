import { useEffect, useMemo, useRef, useState } from 'react'
import { TIERS } from '../lib/tierlists'
import { EMPTY_FILTERS, passesFilters } from '../lib/filtering'
import Filters from './Filters'
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
  savedId = null,
  onClose,
  onEdit,
  onSave,
  onDelete,
}) {
  const editing = mode === 'edit'
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const [ranking, setRanking] = useState(initialRanking)
  const [player, setPlayer] = useState(initialPlayer)
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  const [showFilters, setShowFilters] = useState(false)
  const [tip, setTip] = useState(null) // { name, x, y } — infobulle au tap
  const [focusedName, setFocusedName] = useState(null)
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

  const activeFilterCount =
    filters.owners.length +
    (filters.tags.length ? 1 : 0) +
    (filters.players.length ? 1 : 0) +
    (filters.duration != null ? 1 : 0) +
    filters.complexity.length

  // Déplace un jeu vers une ligne (ou le retire si tier === null → retour au bac).
  // Déplace un jeu vers une ligne, INSÉRÉ juste avant `beforeId` (pour trier librement dans
  // la ligne) ; `beforeId` null = à la fin. tier null = retour au bac (retiré de tout).
  // On repère la position par l'ID (pas par un index numérique) → reste correct même quand
  // un filtre masque certaines vignettes déjà classées.
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
      return next
    })

  // ---- Auto-save (édition) : sauvegarde peu après le dernier changement ----
  const firstSave = useRef(true)
  useEffect(() => {
    if (!editing) return
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    if (!online || !player.trim()) return
    const t = setTimeout(async () => {
      try {
        const row = await onSave({ id: idRef.current, player: player.trim(), ranking })
        if (row && row.id) idRef.current = row.id
      } catch {
        /* échec réseau : on réessaiera au prochain changement */
      }
    }, 800)
    return () => clearTimeout(t)
  }, [ranking, player, editing, online]) // eslint-disable-line react-hooks/exhaustive-deps

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
      try { navigator.vibrate?.(12) } catch { /* ignore */ }
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
      drag = { id: chip.dataset.game, active: false, clone: null, startX: x, startY: y, hold: null, isTouch, moved: false }
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
              onChange={setPlayer}
              onPick={setPlayer}
              placeholder="Ton nom"
              playerNames={playerNames}
              focused={focusedName}
              setFocused={setFocusedName}
            />
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {/* Actions à droite : filtre (tous modes), modifier (consultation), supprimer (existant). */}
        <div className="tl-head-actions">
          <button type="button" className="filter-toggle tl-filter-btn" onClick={() => setShowFilters((s) => !s)} aria-label="Filtres">
            🔎
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            <span className={`filter-chev ${showFilters ? 'up' : ''}`}>▾</span>
          </button>
          {mode === 'view' && onEdit && (
            <button type="button" className="tl-edit-btn" onClick={onEdit} disabled={!online} title={online ? 'Modifier' : 'Indisponible hors ligne'}>✏️</button>
          )}
          {savedId && onDelete && (
            <button type="button" className="tl-del-btn" onClick={onDelete} disabled={!online} title={online ? 'Supprimer' : 'Indisponible hors ligne'} aria-label="Supprimer la tierlist">🗑️</button>
          )}
        </div>
      </div>

      {showFilters && (
        <Filters
          owners={allOwners}
          tags={allTags}
          filters={filters}
          setFilters={setFilters}
          showPrice={false}
          showTags
          onReset={() => setFilters({ ...EMPTY_FILTERS })}
        />
      )}

      {/* Les 7 lignes (drop-zones en édition). */}
      <div className="tl-rows">
        {TIERS.map((t) => (
          <div key={t.key} className="tl-row" data-tier={t.key}>
            <div className="tl-label" style={{ background: t.color }} title={t.title || t.label}>
              {t.label}
            </div>
            <div className="tl-slots">
              {gamesOf(ranking[t.key] || [], true).map((g) => (
                <Chip key={g.id} game={g} />
              ))}
            </div>
          </div>
        ))}

        {/* Zone « Non classés » (tierlist globale) : À LA SUITE des lignes, dans le défilement
            (pas un panneau épinglé) → on la voit en descendant, pas en permanence. */}
        {mode === 'global' && unranked.length > 0 && (
          <div className="tl-unranked">
            <div className="tl-tray-title">Non classés <span className="muted">({unranked.length})</span></div>
            <div className="tl-tray tl-tray-inline">
              {gamesOf(unranked, true).map((g) => (
                <Chip key={g.id} game={g} />
              ))}
            </div>
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
    </div>
  )
}
