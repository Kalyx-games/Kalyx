import { Fragment, useRef, useState } from 'react'
import { getTheme, applyTheme } from '../lib/theme'
import BubbleListManager from './BubbleListManager'
import SortMenu from './SortMenu'

// Écran Réglages : propriétaires + tags (même format bulle), sauvegarde, apparence, liens.

const LINKS = [
  { label: "Melodice (musiques d'ambiance de jeux)", url: 'https://melodice.org/', domain: 'melodice.org' },
  { label: 'Base de données (tableau de bord Supabase)', url: 'https://supabase.com/dashboard/project/rfzanybiwciovbzrcozb', domain: 'supabase.com' },
  { label: 'Hébergement (tableau de bord Vercel)', url: 'https://vercel.com/kalyx/kalyx', domain: 'vercel.com' },
  { label: 'Application BoardGameGeek (Kalyx)', url: 'https://boardgamegeek.com/application/7068', domain: 'boardgamegeek.com' },
  { label: 'Code source (dépôt GitHub)', url: 'https://github.com/Kalyx-games/Kalyx', domain: 'github.com' },
]

// Lien de l'application (à copier pour partager).
const APP_URL = 'https://kalyx-sepia.vercel.app'

const FREQ_OPTIONS = [
  { value: 'always', label: 'À chaque ouverture' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
  { value: 'manual', label: 'Manuel' },
]

// Date lisible d'une sauvegarde, ex. "14 juil. à 21:30".
function backupDate(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function Settings({
  owners, onAddOwner, onUpdateOwner, onDeleteOwner,
  tags, onAddTag, onUpdateTag, onDeleteTag,
  onExport, onExportCsv, onImportFile,
  backupFreq, onSetBackupFreq, backups, backupBusy, onBackupNow, onRestore,
  onOpenPlayers,
  online, onClose,
}) {
  const fileRef = useRef(null)
  const [theme, setThemeState] = useState(getTheme())
  const [copied, setCopied] = useState(false)

  // Copie le lien de l'app dans le presse-papiers (pour la partager).
  const copyAppLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(APP_URL)
      } else {
        const ta = document.createElement('textarea')
        ta.value = APP_URL
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* copie impossible : tant pis */
    }
  }

  return (
    <div className="settings">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">←</button>
        <h2>Réglages</h2>
      </div>

      <section className="settings-card">
        <h3>Apparence</h3>
        <div className="chips">
          {[['auto', 'Système'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`fchip ${theme === v ? 'on' : ''}`}
              onClick={() => {
                // fondu des couleurs pendant la bascule (le temps du switch seulement)
                document.documentElement.classList.add('theme-anim')
                applyTheme(v)
                setThemeState(v)
                setTimeout(() => document.documentElement.classList.remove('theme-anim'), 340)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <BubbleListManager
        title="Propriétaires"
        items={owners}
        migrationCode="migration_proprietaires.sql"
        namePlaceholder="Nom du propriétaire (ex. Mathieu)"
        addLabel="Ajouter un propriétaire"
        online={online}
        onAdd={onAddOwner}
        onUpdate={onUpdateOwner}
        onDelete={onDeleteOwner}
      />

      <BubbleListManager
        title="Tags"
        items={tags}
        migrationCode="migration_tags.sql"
        namePlaceholder="Nom du tag (ex. Coopératif)"
        addLabel="Ajouter un tag"
        online={online}
        onAdd={onAddTag}
        onUpdate={onUpdateTag}
        onDelete={onDeleteTag}
      />

      <section className="settings-card">
        <h3>Joueurs</h3>
        <button type="button" className="btn-ghost settings-open" onClick={onOpenPlayers} disabled={!online}>
          👥 Renommer les joueurs
        </button>
        {!online && <p className="field-hint" style={{ marginTop: 8 }}>Hors ligne : lecture seule.</p>}
      </section>

      {/* Une seule carte : sauvegarde automatique (fréquence + liste) ET fichier (export/import). */}
      <section className="settings-card">
        <h3>Sauvegarde</h3>

        <div className="backup-freq-row">
          <span className="field-label">Fréquence</span>
          <SortMenu value={backupFreq} options={FREQ_OPTIONS} onChange={onSetBackupFreq} arrows={false} />
        </div>

        {/* Sauvegarde en ligne (liée à la fréquence ci-dessus), sur sa propre ligne. */}
        <div className="save-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn-ghost save-now" onClick={onBackupNow} disabled={!online || backupBusy}>
            {backupBusy ? '…' : '💾 Sauvegarder maintenant'}
          </button>
        </div>

        {/* Sauvegarde en fichier : le duo exporter / importer. */}
        <div className="save-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn-ghost" onClick={onExport} title="Télécharger la sauvegarde complète (fichier .json)">
            ⬇️ Exporter
          </button>
          <button type="button" className="btn-ghost" onClick={onExportCsv} title="Télécharger 2 fichiers .csv (jeux et parties) ouvrables dans un tableur">
            📊 Export tableur
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={!online}
            title={online ? 'Importer un fichier de sauvegarde' : 'Indisponible hors ligne'}
          >
            ⬆️ Importer
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files && e.target.files[0]
              if (f) onImportFile(f)
              e.target.value = '' // permet de réimporter le même fichier
            }}
          />
        </div>

        {backups === null || backups.length === 0 ? (
          backups && backups.length === 0 ? (
            <p className="field-hint" style={{ marginTop: 12 }}>Aucune sauvegarde pour l'instant.</p>
          ) : null
        ) : (
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.id} className="backup-row">
                <div className="backup-info">
                  <span className="backup-when">{backupDate(b.created_at)}</span>
                  <span className="backup-meta">
                    {b.games_count} jeu{b.games_count > 1 ? 'x' : ''}
                    {b.kind === 'manual' ? ' · manuelle' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost backup-restore"
                  onClick={() => onRestore(b)}
                  disabled={!online}
                  title={online ? 'Restaurer cette sauvegarde' : 'Indisponible hors ligne'}
                >
                  ↩ Restaurer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-card">
        <h3>Liens utiles</h3>
        <div className="links">
          {LINKS.map((l, i) => (
            <Fragment key={l.url}>
              {online ? (
                <a className="link-row" href={l.url} target="_blank" rel="noreferrer">
                  <img
                    className="link-fav"
                    src={`https://www.google.com/s2/favicons?domain=${l.domain}&sz=64`}
                    alt=""
                    width="20"
                    height="20"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <span className="link-label">{l.label}</span>
                  <span className="link-arrow">↗</span>
                </a>
              ) : (
                <span className="link-row disabled" title="Indisponible hors ligne" aria-disabled="true">
                  <img
                    className="link-fav"
                    src={`https://www.google.com/s2/favicons?domain=${l.domain}&sz=64`}
                    alt=""
                    width="20"
                    height="20"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <span className="link-label">{l.label}</span>
                  <span className="link-arrow">↗</span>
                </span>
              )}
              {/* Bouton "Copier le lien" placé juste sous le premier lien (Melodice). */}
              {i === 0 && (
                <button type="button" className={`link-row link-copy ${copied ? 'copied' : ''}`} onClick={copyAppLink}>
                  <span className="link-copy-icon" aria-hidden="true">🔗</span>
                  <span className="link-label">{copied ? 'Lien copié ✓' : "Copier le lien de l'application"}</span>
                  <span className="link-arrow">⧉</span>
                </button>
              )}
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  )
}
