// Petite fenêtre de confirmation (avant de supprimer, de transférer, etc.).
// danger=true → bouton rouge (suppression) ; danger=false → bouton principal (encre).
//
// `accent` : la couleur de l'ACTION, quand elle en a déjà une ailleurs dans l'app. Le
// transfert vers la collection est vert partout (l'icône, le fond révélé du glissé) : la
// confirmation le dit de la même couleur, et on reconnaît le geste avant de lire.
// ⚠️ On ne l'invente jamais : sans couleur établie ailleurs, un bouton reste à l'encre.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', danger = true, accent, busy, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p className="confirm-msg">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
          {/* ⚠️ La couleur passe par une VARIABLE CSS, pas par un style inline complet : poser
              une `color` en ligne écraserait l'atténuation que le navigateur applique à
              :disabled, et le bouton paraîtrait actif pendant l'enregistrement (piège déjà
              documenté dans ce projet). */}
          <button
            type="button"
            className={danger ? 'btn-danger' : accent ? 'btn-primary btn-accent' : 'btn-primary'}
            style={accent ? { '--btn-accent': accent } : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
