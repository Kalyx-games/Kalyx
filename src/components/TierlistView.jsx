import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { vibre } from '../lib/haptique'
import { TIERS } from '../lib/tierlists'
import { passesFilters } from '../lib/filtering'
import FilterSheet from './FilterSheet'
import Filters from './Filters'
import { FilterIcon, BackIcon, PencilIcon, TrashIcon } from './icons'
import NameField from './NameField'

// Miniature optimisée (même image que les cartes, via l'optimiseur Vercel).
const thumbSrc = (url, w = 128) => `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=72`

// Une vignette de jeu (image seule). Tap = infobulle avec le nom (géré par le parent via
// data-game). En cas d'image cassée : repli sur l'image brute, puis sur le dé 🎲.
const Chip = memo(function Chip({ game, cachee = false }) {
  const [broken, setBroken] = useState(false)
  const url = game.image_url
  return (
    // ⚠️ `cachee` = la vignette en cours de glissé : display:none, PAS un démontage. Les
    // événements tactiles sont livrés à l'élément du touchstart pendant TOUTE la vie du
    // doigt — un nœud retiré du DOM ne fait plus remonter les touchmove/touchend jusqu'à
    // l'écouteur, et le glissé se FIGE (vécu en prod : clone immobile, fente immobile,
    // lâcher jamais vu ; invisible aux tests synthétiques qui dispatchent sur le conteneur).
    <div className={`tl-chip${cachee ? ' tl-prise' : ''}`} data-game={game.id} data-name={game.name}>
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
}, (a, b) => a.game === b.game && a.cachee === b.cachee)
// ⚠️ Mémoïsée : la fente se déplace 10 à 25 fois par glissé, et sans ce comparateur chaque
// déplacement re-rendrait les 133 vignettes de l'écran. Le `broken` interne reste privé à
// chaque instance — rien ne casse.

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
  closing = false,
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
  // ── La fente qui s'ouvre sous le doigt ────────────────────────────────────────────────
  // ⚠️ `prise` et `fente` sont de la VUE PURE. Ils ne doivent JAMAIS entrer dans les
  // dépendances de l'enregistrement automatique : chaque millimètre de doigt programmerait
  // sinon une écriture réseau.
  const [prise, setPrise] = useState(null) // id en cours de glissé : sa vignette quitte le flux
  const [fente, setFente] = useState(null) // { tier, index } | { tray: true } | null
  // L'ordre AFFICHÉ de chaque ligne, filtre compris. Le calcul de la cible lit CE miroir,
  // jamais le DOM : savoir ce qu'il y a dans une ligne est une question de données.
  const vuesRef = useRef({})
  // Le bandeau d'édition ne disparaît pas à la sortie : il DEVIENT le bilan, au même endroit,
  // à la même hauteur — donc sans décaler quoi que ce soit. Il se replie tout seul au bout de
  // trois secondes, et c'est le seul décalage, animé.
  const [bilan, setBilan] = useState(null) // { classes, restants } | null
  const bilanRef = useRef(null)
  useEffect(() => () => clearTimeout(bilanRef.current), [])

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
    // ── LA GÉOMÉTRIE, CALCULÉE ET NON MESURÉE ────────────────────────────────────────
    // `.tl-slots` est un flex-wrap de boîtes RIGOUREUSEMENT identiques : la position de la
    // n-ième case est donc une formule. C'est ce qui permet d'ouvrir une fente sans mesurer
    // les 38 vignettes de la ligne la plus chargée à chaque frame (2 280 lectures/seconde).
    // ⚠️ CES TROIS NOMBRES SUIVENT LE CSS (.tl-chip 48, .tl-slots gap 4 / padding 4).
    // Si une vignette devient de largeur variable, tout ce calcul s'effondre.
    const CHIP = 48
    const GAP = 4
    const PAD = 4
    const HYST = 0.2 // zone morte d'un cinquième de case : sans elle, un doigt posé sur une
                     // médiane fait clignoter la fente entre deux positions.

    let bandes = []
    let sale = true
    const reconstruireBandes = () => {
      // La SEULE mesure du mécanisme : 7 lignes + le bac = 8 rectangles, relus uniquement
      // quand la fente a changé (elle peut faire gagner une rangée à une ligne).
      bandes = []
      root.querySelectorAll('[data-tier]').forEach((el) => {
        const slots = el.querySelector('.tl-slots') || el
        const r = slots.getBoundingClientRect()
        bandes.push({ tier: el.dataset.tier, top: r.top, left: r.left, w: r.width, h: r.height })
      })
      const bac = root.querySelector('[data-tray]')
      if (bac) {
        const r = bac.getBoundingClientRect()
        bandes.push({ tray: true, top: r.top, left: r.left, w: r.width, h: r.height })
      }
    }

    const cibleRef = { current: null }
    const cible = (x, y) => {
      const b = bandes.find((b) => y >= b.top && y < b.top + b.h && x >= b.left && x < b.left + b.w)
      if (!b) return null
      // Le bac est trié alphabétiquement : une fente y promettrait une place que le tri
      // écrase dans la même frame. Il n'a droit qu'au surlignage.
      if (b.tray) return { tray: true }
      const W = b.w - 2 * PAD
      const parLigne = Math.max(1, Math.floor((W + GAP) / (CHIP + GAP)))
      const fx = (x - b.left - PAD + GAP / 2) / (CHIP + GAP)
      const fy = (y - b.top - PAD + GAP / 2) / (CHIP + GAP)
      let col = Math.floor(fx)
      const lig = Math.max(0, Math.floor(fy))
      const prec = cibleRef.current
      if (prec && prec.tier === b.tier && prec.col != null && Math.abs(fx - (prec.col + 0.5)) < 0.5 + HYST) col = prec.col
      col = Math.min(Math.max(col, 0), parLigne - 1)
      const n = (vuesRef.current[b.tier] || []).filter((id) => id !== drag?.id).length
      return { tier: b.tier, col, index: Math.min(lig * parLigne + col, n) }
    }

    const memeCible = (a, b) =>
      a === b || (a && b && a.tray === b.tray && a.tier === b.tier && a.index === b.index)

    let boucle = null
    let dernier = { x: 0, y: 0 }
    const tourner = () => {
      if (!drag?.active) { boucle = null; return }
      boucle = requestAnimationFrame(tourner)
      if (sale) { reconstruireBandes(); sale = false }
      // Auto-défilement aux bords : sans lui, on ne peut pas amener une vignette du bac vers
      // la ligne S quand S est sorti de l'écran — c'est aujourd'hui simplement impossible.
      // ⚠️ SEULEMENT une fois que le doigt a réellement bougé : saisir une vignette près du
      // bord déclenchait sinon le défilement dès la prise, et la liste dérivait toute seule
      // sous un doigt immobile (mesuré : 84 px pendant les 280 premières millisecondes).
      const rows = drag?.aBouge ? root.querySelector('.tl-rows') : null
      if (rows) {
        const r = rows.getBoundingClientRect()
        let d = 0
        if (dernier.y < r.top + 60) d = -12
        else if (dernier.y > r.bottom - 60) d = 12
        if (d) {
          const avant = rows.scrollTop
          rows.scrollTop += d
          const vrai = rows.scrollTop - avant
          // Les bandes se décalent par soustraction : aucun rectangle n'est relu.
          if (vrai) bandes.forEach((b) => { if (!b.tray) b.top -= vrai })
        }
      }
      const c = cible(dernier.x, dernier.y)
      if (!memeCible(c, cibleRef.current)) {
        cibleRef.current = c
        setFente(c)
        sale = true // la fente peut faire gagner une rangée → les bandes du dessous bougent
      }
      moveClone(dernier.x, dernier.y)
    }

    // La couleur dominante de la jaquette saisie : elle teinte la fente (retour user — le
    // contour or « marron » ne plaisait pas). Moyenne des pixels sur un canvas de 10×10,
    // pondérée vers les tons saturés ni noirs ni blancs.
    // ⚠️ En prod les vignettes passent par /_vercel/image (MÊME origine) → le canvas est
    // propre. En dev, le repli sert l'image geekdo brute SANS CORS → canvas « tainted »,
    // getImageData JETTE → le try/catch retombe sur l'encre. C'est le piège déjà documenté
    // (« Canvas client IMPOSSIBLE » pour l'import d'images) — ici il ne coûte qu'un repli.
    const couleurDominante = (img) => {
      try {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 10
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, 10, 10)
        const d = ctx.getImageData(0, 0, 10, 10).data
        let R = 0, G = 0, B = 0, W = 0
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
          const lum = (mx + mn) / 2
          const w = 1 + ((mx - mn) * 2) / 255 + (lum > 40 && lum < 215 ? 1 : 0)
          R += r * w; G += g * w; B += b * w; W += w
        }
        if (!W) return null
        return `rgb(${Math.round(R / W)}, ${Math.round(G / W)}, ${Math.round(B / W)})`
      } catch {
        return null
      }
    }
    const begin = (x, y) => {
      if (!drag) return
      drag.active = true
      vibre('prise') // on saisit un objet
      const src = root.querySelector(`[data-game="${CSS.escape(drag.id)}"]`)
      drag.depart = src ? src.getBoundingClientRect() : null
      const image = src?.querySelector('img')
      const teinte = image && image.complete && image.naturalWidth > 0 ? couleurDominante(image) : null
      root.style.setProperty('--fente-c', teinte || 'var(--ink)')
      const clone = document.createElement('div')
      clone.className = 'tl-drag'
      const img = src?.querySelector('img')
      if (img) clone.appendChild(img.cloneNode(true))
      else clone.textContent = '🎲'
      document.body.appendChild(clone)
      drag.clone = clone
      // La vignette QUITTE le flux : la place se libère à l'instant de la prise, pas à la fin.
      setPrise(drag.id)
      dernier = { x, y }
      sale = true
      moveClone(x, y)
      if (!boucle) boucle = requestAnimationFrame(tourner)
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
      drag = { id: chip.dataset.game, active: false, clone: null, startX: x, startY: y, hold: null, isTouch, depart: null, aBouge: false }
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
      // Un touchmove ne fait QUE ça : tout le reste vit dans la boucle d'animation.
      if (dist > 24) drag.aBouge = true // arme l'auto-défilement des bords
      dernier = { x, y }
    }
    // Le clone VOLE jusqu'à la fente (ou revient à son point de départ si on lâche dans le
    // vide) : la vignette atterrit sur sa destination au lieu de disparaître.
    const poser = (clone, vers, ms) => {
      if (!clone) return
      if (!vers) { clone.remove(); return }
      clone.style.transition = `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ms}ms ease`
      clone.style.transform = `translate(-50%, -50%) translate(${vers.dx}px, ${vers.dy}px) scale(${vers.k})`
      clone.style.opacity = '1'
      setTimeout(() => clone.remove(), ms + 40)
    }
    const finish = (e) => {
      if (!drag) return
      const d = drag
      drag = null
      if (d.hold) clearTimeout(d.hold)
      if (boucle) { cancelAnimationFrame(boucle); boucle = null }
      if (d.active) {
        const c = cibleRef.current
        cibleRef.current = null
        setFente(null)
        setPrise(null)
        if (c && !c.tray) {
          // La fente occupait déjà exactement la case d'arrivée : le clone y vole, et la vraie
          // vignette apparaît au pixel près.
          const trou = root.querySelector('.tl-fente')
          const r = trou?.getBoundingClientRect()
          if (r && d.clone) {
            const cl = d.clone.getBoundingClientRect()
            poser(d.clone, { dx: r.left + r.width / 2 - (cl.left + cl.width / 2), dy: r.top + r.height / 2 - (cl.top + cl.height / 2), k: 48 / 56 }, 200)
          } else if (d.clone) d.clone.remove()
          const beforeId = (vuesRef.current[c.tier] || []).filter((id) => id !== d.id)[c.index] ?? null
          moveGame(d.id, c.tier, beforeId)
          vibre('prise')
        } else if (c && c.tray) {
          if (d.clone) { d.clone.style.transition = 'opacity 140ms ease'; d.clone.style.opacity = '0'; setTimeout(() => d.clone.remove(), 180) }
          moveGame(d.id, null) // lâché sur le bac → retour aux non-classés
          vibre('prise')
        } else if (d.clone) {
          // Lâché dans le vide : le clone RETOURNE à son point de départ. Rien ne bouge, et
          // l'annulation se lit.
          const cl = d.clone.getBoundingClientRect()
          const dep = d.depart
          poser(d.clone, dep ? { dx: dep.left + dep.width / 2 - (cl.left + cl.width / 2), dy: dep.top + dep.height / 2 - (cl.top + cl.height / 2), k: 48 / 56 } : null, 180)
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
      if (boucle) cancelAnimationFrame(boucle)
      // Démontage en plein vol : pas de clone orphelin dans le body.
      document.querySelectorAll('.tl-drag').forEach((el) => el.remove())
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
    <div className={`sheet tl-sheet${closing ? ' closing' : ''}`} ref={rootRef} onClick={onRootClick}>
      <div className="settings-head tl-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
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
              placeholder="Votre nom"
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
                  setBilan({ classes: placed.size, restants: games.length - placed.size })
                  clearTimeout(bilanRef.current)
                  bilanRef.current = setTimeout(() => setBilan(null), 3000)
                }}
              >
                Terminé
              </button>
            ) : (
              <button type="button" className="tl-edit-btn" onClick={() => setEditing(true)} disabled={!online} title={online ? 'Modifier' : 'Indisponible hors ligne'}><PencilIcon size={18} /></button>
            ))}
          {savedId && onDelete && (
            <button type="button" className="tl-del-btn" onClick={onDelete} disabled={!online} title={online ? 'Supprimer' : 'Indisponible hors ligne'} aria-label="Supprimer la tierlist"><TrashIcon size={18} /></button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="tl-editing-banner">
          {needName ? 'Donnez un nom à votre tierlist pour l’enregistrer, puis « Terminé ».' : 'Mode édition — glissez les jeux pour les classer'}
        </div>
      ) : bilan ? (
        <div className="tl-editing-banner tl-bilan">
          <b>{bilan.classes}</b> {bilan.classes > 1 ? 'jeux classés' : 'jeu classé'}
          {bilan.restants > 0 && <> · {bilan.restants} {bilan.restants > 1 ? 'restants' : 'restant'}</>}
        </div>
      ) : null}

      {/* Les lignes (drop-zones en édition). La ligne « Pas d'avis » (score null) est
          masquée dans la tierlist GLOBALE (elle n'entre pas dans la moyenne). */}
      <div className="tl-rows">
        {TIERS.filter((t) => !isGlobal || t.score != null).map((t, rang) => {
          const list = gamesOf(ranking[t.key] || [], true)
          // ⚠️ BUG PRÉEXISTANT, révélé par la fente : `az` n'était jamais remis à faux en
          // entrant en édition. On voyait alors l'ordre ALPHABÉTIQUE tout en manipulant le
          // tableau réel → `beforeId` visait le voisin alphabétique et la vignette « sautait »
          // après le lâcher. En édition on voit et on manipule toujours l'ordre réel.
          const shown = az && !editing ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr')) : list
          vuesRef.current[t.key] = shown.map((g) => g.id)
          // En lecture, toute la case-lettre bascule le tri A→Z de TOUTES les lignes (zone
          // de clic large, une seule action pour tout trier).
          const labelClick = !editing ? () => setAz((v) => !v) : undefined
          return (
            <div
              key={t.key}
              className={`tl-row${bilan ? ' tl-pose' : ''}`}
              data-tier={t.key}
              style={bilan ? { animationDelay: `${rang * 40}ms` } : undefined}
            >
              <div
                className={`tl-label ${!editing ? 'tl-label-btn' : ''}`}
                style={{ background: t.color }}
                onClick={labelClick}
                title={t.title || (editing ? t.label : az ? 'Ordre du créateur' : 'Trier de A à Z')}
              >
                <span className="tl-label-letter">{t.label}</span>
                {!editing && <span className={`tl-sort-ind ${az ? 'on' : ''}`}>A↓Z</span>}
              </div>
              <div className={`tl-slots${fente && fente.tier === t.key ? ' tl-over' : ''}`}>
                {(() => {
                  // L'index de la fente compte les vignettes VISIBLES ; la prise, elle, reste
                  // rendue (display:none) pour que le geste tactile ne se fige pas.
                  let vis = 0
                  const enFente = fente && fente.tier === t.key
                  const rendu = shown.map((g) => {
                    const cachee = g.id === prise
                    const avant = enFente && !cachee && fente.index === vis
                    if (!cachee) vis++
                    return (
                      <Fragment key={g.id}>
                        {avant && <div className="tl-fente" aria-hidden="true" />}
                        <Chip game={g} cachee={cachee} />
                      </Fragment>
                    )
                  })
                  if (enFente && fente.index >= vis) rendu.push(<div key="fin" className="tl-fente" aria-hidden="true" />)
                  return rendu
                })()}
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
          <div className={`tl-tray${fente && fente.tray ? ' tl-over' : ''}`} data-tray>
            {tray.length ? (
              tray.map((g) => <Chip key={g.id} game={g} cachee={g.id === prise} />)
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
          resetCount={activeFilterCount - (filters.owners.length ? 1 : 0)}
          onReset={onResetFilters}
          onClose={() => setShowFilters(false)}
        >
          <Filters
            owners={allOwners}
            tags={allTags}
            filters={filters}
            setFilters={setFilters}
            showPrice={false}
            showTags
          />
        </FilterSheet>
      )}
    </div>
  )
}
