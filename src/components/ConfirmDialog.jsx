// Petite fenêtre de confirmation (avant de supprimer, de transférer, etc.).
// danger=true → bouton rouge (suppression) ; danger=false → bouton principal (encre).
//
// `accent` : la couleur de l'ACTION, quand elle en a déjà une ailleurs dans l'app. Le
// transfert vers la collection est vert partout (l'icône, le fond révélé du glissé) : la
// confirmation le dit de la même couleur, et on reconnaît le geste avant de lire.
// ⚠️ On ne l'invente jamais : sans couleur établie ailleurs, un bouton reste à l'encre.
// `closing` : la fenêtre sort en fondu au lieu de disparaître d'un coup. L'état vient de
// `useExitLayer` côté App, qui la garde montée le temps de l'animation — donc TOUS les chemins
// de fermeture en profitent, y compris le bouton retour d'Android.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', danger = true, accent, busy, closing = false, onConfirm, onCancel }) {
  return (
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onClick={busy ? undefined : onCancel}>
      <div className={`confirm${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
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
