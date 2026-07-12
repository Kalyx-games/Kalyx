// Petite fenêtre de confirmation (avant de supprimer, de transférer, etc.).
// danger=true → bouton rouge (suppression) ; danger=false → bouton principal (indigo).
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', danger = true, busy, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p className="confirm-msg">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
