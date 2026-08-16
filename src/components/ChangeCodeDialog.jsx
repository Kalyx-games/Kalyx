import { useState } from 'react'
import { setWriteCode, setCode } from '../lib/supabase'

// Change LE code d'accès (pour tous les appareils). Depuis un appareil déjà autorisé :
// on saisit le nouveau code deux fois, on stocke son hash en base, puis on met à jour le
// code local. Les AUTRES appareils devront ensuite re-saisir le nouveau code.
export default function ChangeCodeDialog({ onDone, onClose }) {
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const a = c1.trim()
    const b = c2.trim()
    if (!a || busy) return
    if (a !== b) {
      setErr('Les deux codes ne correspondent pas.')
      return
    }
    setBusy(true)
    setErr('')
    const res = await setWriteCode(a) // autorisé par le code ACTUEL de cet appareil
    setBusy(false)
    if (res && res.error) {
      setErr(
        res.unauthorized
          ? "Cet appareil n'est plus autorisé. Ressaisis d'abord le code d'accès actuel, puis réessaie."
          : 'Changement impossible (base pas prête ?). Réessaie.'
      )
      return
    }
    setCode(a) // cet appareil utilise désormais le nouveau code
    onDone && onDone()
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>🔒 Changer le code d'accès</h2>
        <p className="confirm-msg">
          Choisis un <strong>nouveau code</strong> pour toute l'appli. Ensuite, chaque appareil devra le
          re-saisir une fois pour pouvoir modifier la collection.
        </p>
        <input
          className="code-input"
          type="password"
          inputMode="text"
          autoComplete="off"
          placeholder="Nouveau code"
          value={c1}
          onChange={(e) => setC1(e.target.value)}
        />
        <input
          className="code-input"
          type="password"
          inputMode="text"
          autoComplete="off"
          placeholder="Confirmer le nouveau code"
          value={c2}
          onChange={(e) => setC2(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        {err && <p className="code-err">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !c1.trim() || !c2.trim()}>
            {busy ? 'Changement…' : 'Changer le code'}
          </button>
        </div>
      </div>
    </div>
  )
}
