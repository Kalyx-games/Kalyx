import { useEffect, useRef, useState } from 'react'
import { enterFullscreen, exitFullscreen } from '../lib/fullscreen'
import { playFinger, startRiser, stopRiser, playReveal } from '../lib/sound'

// Chwazi : chacun pose un doigt, l'app choisit au hasard.
// Deux modes : « Gagnant » (tire N gagnants) ou « Équipes » (répartit en N équipes).
// 100 % tactile, fonctionne hors ligne (aucun réseau).
// Dès qu'un doigt touche l'écran, toute l'interface disparaît (plein écran).

// Couleurs distinctes attribuées aux doigts (mode Gagnant).
const FINGER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#2f6df6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]
// Couleurs des équipes (mode Équipes), une par équipe.
const TEAM_COLORS = ['#2f6df6', '#f97316', '#22c55e', '#ec4899', '#eab308', '#8b5cf6', '#06b6d4', '#ef4444']

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

  const pointersRef = useRef(pointers)
  pointersRef.current = pointers
  const cfgRef = useRef({})
  cfgRef.current = { mode, winnerCount, teamCount }
  // Palette des doigts mélangée : l'ordre des couleurs change à chaque manche
  // (variété visuelle + on retient mieux qui a été désigné). Reste distinct.
  const paletteRef = useRef(shuffle(FINGER_COLORS))

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
      // Couleurs d'équipes mélangées (pas toujours bleu puis orange), mais distinctes.
      setResult({ type: 'teams', assign, colors: shuffle(TEAM_COLORS) })
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

  // Quand tous les doigts sont levés, on efface le résultat pour repartir propre.
  useEffect(() => {
    if (count === 0 && result) setResult(null)
  }, [count, result])

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
    // Nouveau round (écran vide) → on re-mélange l'ordre des couleurs.
    if (Object.keys(pointersRef.current).length === 0) paletteRef.current = shuffle(FINGER_COLORS)
    playFinger(Object.keys(pointersRef.current).length)
    setPointers((prev) => {
      const color = paletteRef.current[Object.keys(prev).length % paletteRef.current.length]
      return { ...prev, [e.pointerId]: { x: e.clientX, y: e.clientY, color } }
    })
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
              <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
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
          const pal = result.colors || TEAM_COLORS
          color = pal[result.assign[id] % pal.length]
          cls += ' picked'
        }
        return <div key={id} className={cls} style={{ left: p.x, top: p.y, background: color }} />
      })}
    </div>
  )
}
