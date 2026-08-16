import { useState } from 'react'
import { verifyCode, setCode } from '../lib/supabase'

// Demande le CODE d'accès de l'appareil (une seule fois par appareil). Le code est vérifié
// auprès du serveur ; s'il est bon, il est mémorisé (localStorage) et l'appareil peut écrire.
export default function CodeDialog({ onDone, onClose }) {
  const [code, setCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const c = code.trim()
    if (!c || busy) return
    setBusy(true)
    setErr('')
    const ok = await verifyCode(c)
    setBusy(false)
    if (!ok) {
      setErr('Code incorrect. Réessaie.')
      return
    }
    setCode(c)
    onDone && onDone()
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>🔒 Autoriser cet appareil</h2>
        <p className="confirm-msg">
          Entre le code d'accès <strong>une seule fois</strong> sur cet appareil. Il sera mémorisé ensuite.
          La lecture reste possible sans code ; le code protège les <strong>modifications</strong>.
        </p>
        <input
          className="code-input"
          type="password"
          inputMode="text"
          autoComplete="off"
          placeholder="Code d'accès"
          value={code}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        {err && <p className="code-err">{err}</p>}
        <div className="modal-actions">
          {onClose && (
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Plus tard
            </button>
          )}
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !code.trim()}>
            {busy ? 'Vérification…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
