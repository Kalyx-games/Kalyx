import { useEffect, useRef, useState } from 'react'
import { enterFullscreen, exitFullscreen } from '../lib/fullscreen'
import { playFinger, startRiser, stopRiser, playReveal, closeAudio } from '../lib/sound'

// Chwazi : chacun pose un doigt, l'app choisit au hasard.
// Deux modes : « Gagnant » (tire N gagnants) ou « Équipes » (répartit en N équipes).
// 100 % tactile, fonctionne hors ligne (aucun réseau).
// Dès qu'un doigt touche l'écran, toute l'interface disparaît (plein écran).

// Le thème effectif (l'app pose data-theme='dark'|'light' sur <html>, ou rien en
// mode « auto » → on suit alors la préférence système).
function isDarkTheme() {
  const t = document.documentElement.getAttribute('data-theme')
  if (t === 'dark') return true
  if (t === 'light') return false
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

// Teinte (0–360) → couleur, avec une luminosité adaptée au fond : vive sur fond
// sombre, profonde sur fond clair (une couleur lisible sur noir ne l'est pas
// forcément sur blanc).
function hslHex(h, s, l) {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
const colorForHue = (hue) => (isDarkTheme() ? hslHex(hue, 85, 63) : hslHex(hue, 68, 42))

// Prochaine teinte = milieu du plus grand arc libre sur la roue → les couleurs
// utilisées restent réparties au maximum (toujours très différenciées). 1re au hasard.
function nextHue(used) {
  if (!used.length) return Math.random() * 360
  const sorted = [...used].sort((a, b) => a - b)
  let bestGap = -1
  let bestMid = 0
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360
    const gap = b - a
    if (gap > bestGap) {
      bestGap = gap
      bestMid = (a + gap / 2) % 360
    }
  }
  return bestMid
}

const COUNTDOWN_START = 3 // secondes avant le tirage
const WINNER_MIN = 1
const WINNER_MAX = 8
const TEAM_MIN = 2
const TEAM_MAX = 8

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    /* pas de vibreur : tant pis */
  }
}
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Chwazi({ onClose }) {
  const [pointers, setPointers] = useState({}) // pointerId -> {x, y, color}
  const [mode, setMode] = useState('winner') // 'winner' | 'teams'
  const [winnerCount, setWinnerCount] = useState(1)
  const [teamCount, setTeamCount] = useState(2)
  const [result, setResult] = useState(null) // null | {type:'winner', ids} | {type:'teams', assign}
  const [menuOpen, setMenuOpen] = useState(false)

  const containerRef = useRef(null)
  const pointersRef = useRef(pointers)
  pointersRef.current = pointers
  const cfgRef = useRef({})
  cfgRef.current = { mode, winnerCount, teamCount }
  // Teintes déjà attribuées dans la manche en cours (remises à zéro quand l'écran
  // redevient vide) → sert à placer chaque nouvelle couleur dans le plus grand vide.
  const usedHuesRef = useRef([])

  const ids = Object.keys(pointers)
  const count = ids.length
  const controlsVisible = count === 0 && !result

  // Seuil de doigts pour lancer le décompte :
  //  - mode Gagnant : (nombre de gagnants) + 1  → au moins un doigt de plus que de gagnants
  //  - mode Équipes : (nombre d'équipes)         → au moins un doigt par équipe
  const minFingers = mode === 'winner' ? winnerCount + 1 : teamCount

  // Le tirage lui-même.
  function runPick() {
    const list = Object.keys(pointersRef.current)
    const { mode: m, winnerCount: w, teamCount: t } = cfgRef.current
    if (list.length < (m === 'winner' ? w + 1 : t)) return
    if (m === 'winner') {
      const ids = shuffle(list).slice(0, Math.min(w, list.length))
      setResult({ type: 'winner', ids })
    } else {
      const shuffled = shuffle(list)
      const assign = {}
      shuffled.forEach((id, i) => {
        assign[id] = i % t
      })
      // Couleurs d'équipes très éloignées les unes des autres (1re au hasard).
      const hues = []
      for (let i = 0; i < t; i++) hues.push(nextHue(hues))
      setResult({ type: 'teams', assign, colors: hues.map(colorForHue) })
    }
    vibrate([0, 90, 60, 90])
    playReveal()
  }

  // Décompte (invisible) : démarre dès qu'il y a ≥ 2 doigts et repart de zéro si un
  // doigt est ajouté ou retiré. Le chiffre n'est plus affiché ; seul l'uplifter et la
  // vibration marquent l'attente.
  useEffect(() => {
    if (result || count < minFingers) return
    let n = COUNTDOWN_START
    startRiser(COUNTDOWN_START) // uplifter continu qui culmine à la fin du décompte
    const iv = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(iv)
        runPick()
      } else {
        vibrate(20)
      }
    }, 1000)
    return () => {
      clearInterval(iv)
      stopRiser()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, result, minFingers])

  // Quand tous les doigts sont levés : on efface le résultat ET on repart d'une
  // sélection de couleurs vierge pour la manche suivante.
  useEffect(() => {
    if (count === 0) {
      usedHuesRef.current = []
      if (result) setResult(null)
    }
  }, [count, result])

  // iOS Safari : poser un 2e doigt déclenche le pinch-zoom, qui ANNULE les pointeurs
  // → on ne pouvait plus ajouter de doigts. On bloque le geste par défaut dès qu'il y
  // a plusieurs doigts (écouteurs natifs non passifs, seuls capables d'appeler
  // preventDefault sur le tactile).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const block = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault()
    }
    el.addEventListener('touchstart', block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    return () => {
      el.removeEventListener('touchstart', block)
      el.removeEventListener('touchmove', block)
    }
  }, [])

  // À la fermeture de l'écran, on libère l'audio : sans ça le contexte reste actif et
  // le fil audio continue de tourner en arrière-plan (batterie) alors qu'on ne joue plus.
  useEffect(() => closeAudio, [])

  // Plein écran : masque la barre du navigateur/système dès qu'un doigt est posé.
  // Sur Android, le bouton retour SORT du plein écran (au lieu de fermer Chwazi) :
  // on détecte cette sortie et on ferme Chwazi → un seul retour suffit, et on ne
  // quitte jamais l'app.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) onCloseRef.current()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      exitFullscreen()
    }
  }, [])

  const addPointer = (e) => {
    enterFullscreen() // 1er doigt (geste utilisateur) → masque la barre système
    setMenuOpen(false)
    if (result) return // pendant l'affichage du résultat, on n'ajoute plus
    // (La sélection est remise à zéro quand l'écran redevient vide, cf. useEffect.)
    const hue = nextHue(usedHuesRef.current)
    usedHuesRef.current = [...usedHuesRef.current, hue]
    const color = colorForHue(hue)
    playFinger(Object.keys(pointersRef.current).length)
    setPointers((prev) => ({ ...prev, [e.pointerId]: { x: e.clientX, y: e.clientY, color } }))
  }
  const movePointer = (e) => {
    setPointers((prev) =>
      prev[e.pointerId] ? { ...prev, [e.pointerId]: { ...prev[e.pointerId], x: e.clientX, y: e.clientY } } : prev
    )
  }
  const removePointer = (e) => {
    setPointers((prev) => {
      if (!prev[e.pointerId]) return prev
      const next = { ...prev }
      delete next[e.pointerId]
      return next
    })
  }

  const isTeams = mode === 'teams'
  const value = isTeams ? teamCount : winnerCount
  const theme = isTeams ? '#f97316' : '#84cc16'
  const atMin = value <= (isTeams ? TEAM_MIN : WINNER_MIN)
  const atMax = value >= (isTeams ? TEAM_MAX : WINNER_MAX)
  const step = (d) => {
    if (isTeams) setTeamCount((v) => Math.min(TEAM_MAX, Math.max(TEAM_MIN, v + d)))
    else setWinnerCount((v) => Math.min(WINNER_MAX, Math.max(WINNER_MIN, v + d)))
  }

  return (
    <div
      ref={containerRef}
      className="chwazi"
      onPointerDown={addPointer}
      onPointerMove={movePointer}
      onPointerUp={removePointer}
      onPointerCancel={removePointer}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Boutons haut : menu (gauche) + fermer (droite) — cachés dès qu'un doigt touche */}
      {controlsVisible && (
        <div className="chwazi-bar" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="chwazi-round"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Réglages du tirage"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </g>
            </svg>
          </button>
          {!menuOpen && (
            <button type="button" className="chwazi-round" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          )}
        </div>
      )}

      {/* Sélecteur (menu) : nombre de gagnants ou d'équipes */}
      {controlsVisible && menuOpen && (
        <div className="chwazi-card" style={{ '--chw': theme }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="chwazi-counter">
            <button type="button" className="cc-btn" onClick={() => step(-1)} disabled={atMin} aria-label="Moins">−</button>
            <span className="cc-num">{value}</span>
            <button type="button" className="cc-btn" onClick={() => step(1)} disabled={atMax} aria-label="Plus">+</button>
          </div>
          <div className="chwazi-toggle">
            <button type="button" className={!isTeams ? 'on' : ''} onClick={() => setMode('winner')}>Gagnant</button>
            <button type="button" className={isTeams ? 'on' : ''} onClick={() => setMode('teams')}>Équipes</button>
          </div>
        </div>
      )}

      {/* Consigne de départ (seulement écran vide, menu fermé) */}
      {controlsVisible && !menuOpen && <p className="chwazi-hint">Posez vos doigts sur l'écran</p>}

      {/* Un cercle sous chaque doigt */}
      {ids.map((id) => {
        const p = pointers[id]
        let color = p.color
        let cls = 'chwazi-dot'
        if (result?.type === 'winner') {
          cls += result.ids.includes(id) ? ' chosen' : ' dim'
        } else if (result?.type === 'teams') {
          const pal = result.colors || []
          color = pal[result.assign[id] % pal.length] || color
          cls += ' picked'
        }
        return <div key={id} className={cls} style={{ left: p.x, top: p.y, background: color }} />
      })}
    </div>
  )
}
