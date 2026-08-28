// Menu des tierlists : la tierlist globale (moyenne), la liste des tierlists existantes
// (par joueur), et le bouton pour créer la sienne.
import { BackIcon, PlusIcon } from './icons'
export default function TierlistHub({ tierlists, online, closing = false, onOpenGlobal, onOpenTierlist, onCreate, onClose }) {
  const missing = tierlists === null // table pas encore créée (migration à lancer)
  const list = tierlists || []
  return (
    <div className={`sheet settings${closing ? ' closing' : ''}`}>
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2>Tierlists</h2>
      </div>

      {missing ? (
        <p className="empty" style={{ padding: 24 }}>
          {/* ⚠️ Hors ligne, `tierlists` est null pour une tout autre raison : on ne peut pas
              accuser la base d'un défaut de migration alors que c'est le réseau qui manque. */}
          {online
            ? 'Les tierlists ne sont pas encore activées sur votre base.'
            : 'Hors ligne : vos tierlists ne peuvent pas être chargées. Reconnectez-vous pour les consulter.'}
        </p>
      ) : (
        <>
          <button type="button" className="tl-global-btn" onClick={onOpenGlobal}>
            Tierlist globale <span className="tl-global-sub">moyenne de tous les joueurs</span>
          </button>

          <button type="button" className="tl-create-btn" onClick={onCreate} disabled={!online} title={online ? '' : 'Indisponible hors ligne'}>
            <PlusIcon size={14} /> Créer ma tierlist
          </button>

          <h3 className="tl-list-title">Tierlists des joueurs</h3>
          {list.length === 0 ? (
            <p className="muted" style={{ padding: '4px 4px 16px' }}>Aucune tierlist pour l'instant. Créez la vôtre !</p>
          ) : (
            <div className="tl-list">
              {list.map((tl) => (
                <button key={tl.id} type="button" className="tl-list-item" onClick={() => onOpenTierlist(tl)}>
                  <span className="tl-list-name">{tl.player}</span>
                  <span className="tl-list-chev">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
