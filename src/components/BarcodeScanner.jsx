import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

// Scanner de code-barres plein écran : ouvre la caméra arrière, lit un code EAN/UPC
// (bibliothèque ZXing → marche sur tous les navigateurs, y compris Firefox Android),
// et renvoie le code via onDetected. Secours : saisie manuelle du code.

const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]

export default function BarcodeScanner({ onDetected, onClose, busy }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const doneRef = useRef(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    doneRef.current = false // réinit (le montage/démontage double de React en dev le mettrait sinon à true)
    // La caméra met un instant à s'ouvrir. Si l'écran est fermé AVANT, le nettoyage
    // s'exécute alors que controlsRef est encore vide : sans ce drapeau, la caméra
    // resterait allumée en arrière-plan (voyant allumé et batterie qui file).
    let cancelled = false
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
    const reader = new BrowserMultiFormatReader(hints)
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, (result) => {
        if (result && !doneRef.current) {
          doneRef.current = true
          onDetected(result.getText())
        }
      })
      .then((controls) => {
        controlsRef.current = controls
        if (cancelled) {
          // Déjà fermé pendant l'ouverture → on coupe tout de suite.
          try {
            controls.stop()
          } catch {
            /* rien */
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Impossible d'ouvrir la caméra. Autorise l'accès, ou saisis le code à la main.")
      })
    return () => {
      cancelled = true
      doneRef.current = true
      try {
        controlsRef.current && controlsRef.current.stop()
      } catch {
        /* rien */
      }
    }
  }, [onDetected])

  const submitManual = () => {
    const code = manual.replace(/\D/g, '')
    if (code.length >= 8 && !doneRef.current) {
      doneRef.current = true
      onDetected(code)
    }
  }

  return (
    <div className="scanner">
      <div className="scanner-top">
        <span className="scanner-title">Scanne le code-barres</span>
        <button type="button" className="scanner-close" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      <div className="scanner-video-wrap">
        <video ref={videoRef} className="scanner-video" muted playsInline />
        <div className="scanner-frame" />
        {busy && <div className="scanner-busy">Recherche du jeu…</div>}
      </div>

      {error && <p className="scanner-error">{error}</p>}

      <div className="scanner-manual">
        <input
          inputMode="numeric"
          placeholder="…ou saisis le code (chiffres)"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            // Entrée → on masque le clavier (blur) ; la validation se fait via le bouton OK.
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />
        <button type="button" onClick={submitManual} disabled={manual.replace(/\D/g, '').length < 8 || busy}>
          OK
        </button>
      </div>
    </div>
  )
}
