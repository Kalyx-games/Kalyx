import { useEffect, useMemo, useRef, useState } from 'react'
import { TIERS } from '../lib/tierlists'
import { EMPTY_FILTERS, passesFilters } from '../lib/filtering'
import { parseTags } from '../lib/games'
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
  // Ici TOUS les jeux doivent être disponibles (pas de « tags masqués par défaut » comme
  // dans la Collection) → applyTags=false ; le filtre par tag reste possible mais purement
  // additif (rien coché = tous les jeux ; un tag coché = seulement ceux qui l'ont).
  const tray = useMemo(
    () =>
      games
        .filter((g) => {
          if (placed.has(g.id)) return false
          if (!passesFilters(g, filters, '', false, false)) return false
          if (filters.tags.length && !parseTags(g.tags).some((t) => filters.tags.includes(t))) return false
          return true
        })
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
  const moveGame = (id, tier) =>
    setRanking((r) => {
      const next = {}
      TIERS.forEach((t) => {
        next[t.key] = (r[t.key] || []).filter((x) => x !== id)
      })
      if (tier && next[tier]) next[tier] = [...next[tier], id]
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
        if (z) moveGame(d.id, z.kind === 'tier' ? z.key : null)
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

  const gamesOf = (ids) => ids.map((id) => gameById.get(id)).filter(Boolean)

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
        {mode === 'view' && onEdit && (
          <button type="button" className="tl-edit-btn" onClick={onEdit} disabled={!online} title={online ? 'Modifier' : 'Indisponible hors ligne'}>✏️</button>
        )}
      </div>

      {editing && (
        <div className="tl-toolbar">
          <button type="button" className="filter-toggle" onClick={() => setShowFilters((s) => !s)}>
            🔎 Filtres
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            <span className={`filter-chev ${showFilters ? 'up' : ''}`}>▾</span>
          </button>
          <span className="tl-save-hint">{online ? 'Enregistrement automatique' : 'Hors ligne : lecture seule'}</span>
        </div>
      )}
      {editing && showFilters && (
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
              {gamesOf(ranking[t.key] || []).map((g) => (
                <Chip key={g.id} game={g} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bac des jeux à classer (édition). */}
      {editing && (
        <div className="tl-tray-wrap">
          <div className="tl-tray-title">
            À classer <span className="muted">({tray.length})</span> — maintiens puis glisse
          </div>
          <div className="tl-tray" data-tray>
            {tray.length ? (
              tray.map((g) => <Chip key={g.id} game={g} />)
            ) : (
              <p className="muted" style={{ padding: 12 }}>Tous les jeux sont classés 🎉</p>
            )}
          </div>
        </div>
      )}

      {/* Zone « Non classés » (tierlist globale : jeux que personne n'a notés). */}
      {mode === 'global' && unranked.length > 0 && (
        <div className="tl-tray-wrap">
          <div className="tl-tray-title">Non classés <span className="muted">({unranked.length})</span></div>
          <div className="tl-tray">
            {gamesOf(unranked).map((g) => (
              <Chip key={g.id} game={g} />
            ))}
          </div>
        </div>
      )}

      {editing && onDelete && savedId && (
        <div className="tl-delete">
          <button type="button" className="btn-danger" onClick={onDelete} disabled={!online}>
            🗑️ Supprimer cette tierlist
          </button>
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
