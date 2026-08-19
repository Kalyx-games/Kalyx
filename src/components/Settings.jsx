/* global __APP_VERSION__ */
import { Fragment, useMemo, useRef, useState } from 'react'
import { BackIcon } from './icons'
import qrcode from 'qrcode-generator'
import { getTheme, applyTheme } from '../lib/theme'
import { checkForUpdate, forceUpdate } from '../lib/update'
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

// Temps relatif court, ex. "il y a 2 h", "hier". Au-delà d'un mois → date absolue.
function relativeTime(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    if (h < 24) return `il y a ${h} h`
    const j = Math.round(h / 24)
    if (j === 1) return 'hier'
    if (j < 30) return `il y a ${j} j`
    return backupDate(iso)
  } catch {
    return iso
  }
}

export default function Settings({
  owners, onAddOwner, onUpdateOwner, onRenameOwner, onDeleteOwner,
  tags, onAddTag, onUpdateTag, onRenameTag, onDeleteTag,
  onExport, onExportCsv, onImportFile,
  backupFreq, onSetBackupFreq, backups, backupBusy, onBackupNow, onRestore,
  onOpenPlayers,
  onEnterCode, onChangeCode, deviceAuthorized,
  online, onClose,
}) {
  const fileRef = useRef(null)
  const [theme, setThemeState] = useState(getTheme())
  const [copied, setCopied] = useState(false)
  // Vérification manuelle de mise à jour : le service worker peut se coincer et resservir
  // l'ancienne version indéfiniment ; ce bouton interroge le réseau puis renouvelle tout.
  const [upd, setUpd] = useState(null)
  const [toutesSauvegardes, setToutesSauvegardes] = useState(false)
  const runUpdateCheck = async () => {
    setUpd('checking')
    try {
      const { aJour } = await checkForUpdate()
      if (aJour) {
        setUpd('uptodate')
        return
      }
      setUpd('updating')
      await forceUpdate() // vide le service worker + les caches, puis recharge
    } catch {
      setUpd('error')
    }
  }

  // QR code du lien de l'app (généré une fois, sans réseau ni service externe).
  const qrDataUrl = useMemo(() => {
    try {
      const g = qrcode(0, 'M')
      g.addData(APP_URL)
      g.make()
      return g.createDataURL(5, 2)
    } catch {
      return ''
    }
  }, [])

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
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2>Réglages</h2>
      </div>

      <section className="settings-card share-card">
        <h3>Partager Kalyx</h3>
        <div className="share-row">
          {qrDataUrl && <img className="share-qr" src={qrDataUrl} alt="QR code vers l'app Kalyx" width="118" height="118" />}
          <div className="share-info">
            <p className="muted share-hint">Pour installer Kalyx sur un autre téléphone.</p>
            <div className="share-link">{APP_URL.replace('https://', '')}</div>
            <button type="button" className={`btn-ghost share-copy ${copied ? 'copied' : ''}`} onClick={copyAppLink}>
              {copied ? 'Lien copié ✓' : 'Copier le lien'}
            </button>
          </div>
        </div>
      </section>

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

      <section className="settings-card">
        <h3>Accès de l'appareil</h3>
        <p className="muted" style={{ margin: '0 0 10px' }}>
          {deviceAuthorized
            ? 'Cet appareil est autorisé à modifier la collection.'
            : "Cet appareil peut consulter mais pas modifier. Entrez le code d'accès pour l'autoriser."}
        </p>
        {deviceAuthorized ? (
          <>
            <button type="button" className="btn-ghost settings-open" onClick={onChangeCode} disabled={!online}>
              Changer le code d'accès
            </button>
            <button type="button" className="settings-relink" onClick={onEnterCode}>
              Ressaisir le code sur cet appareil
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost settings-open" onClick={onEnterCode}>
            Autoriser cet appareil
          </button>
        )}
      </section>

      <BubbleListManager
        title="Propriétaires"
        items={owners}
        namePlaceholder="Nom du propriétaire (ex. Mathieu)"
        addLabel="Ajouter un propriétaire"
        online={online}
        onAdd={onAddOwner}
        onUpdate={onUpdateOwner}
        onRename={onRenameOwner}
        onDelete={onDeleteOwner}
      />

      <BubbleListManager
        title="Tags"
        items={tags}
        namePlaceholder="Nom du tag (ex. Coopératif)"
        addLabel="Ajouter un tag"
        online={online}
        onAdd={onAddTag}
        onUpdate={onUpdateTag}
        onRename={onRenameTag}
        onDelete={onDeleteTag}
      />

      <section className="settings-card">
        <h3>Joueurs</h3>
        <button type="button" className="btn-ghost settings-open" onClick={onOpenPlayers} disabled={!online}>
          Renommer les joueurs
        </button>
        {!online && <p className="field-hint" style={{ marginTop: 8 }}>Hors ligne : lecture seule.</p>}
      </section>

      {/* Sauvegarde AUTOMATIQUE (dans le cloud) : fréquence + bouton + liste des sauvegardes. */}
      <section className="settings-card">
        <h3>Sauvegarde automatique</h3>

        <div className="backup-freq-row">
          <span className="field-label">Fréquence</span>
          <SortMenu value={backupFreq} options={FREQ_OPTIONS} onChange={onSetBackupFreq} arrows={false} />
        </div>

        <div className="save-actions">
          <button type="button" className="btn-ghost save-now" onClick={onBackupNow} disabled={!online || backupBusy}>
            {backupBusy ? '…' : 'Sauvegarder maintenant'}
          </button>
        </div>

        {backups && backups.length > 0 && (
          <ul className="backup-list">
            {/* Seules les deux dernières sont montrées : la liste n'est pas bornée (une
                sauvegarde manuelle ne s’efface jamais) et la carte pouvait dépasser mille pixels. */}
            {(toutesSauvegardes ? backups : backups.slice(0, 2)).map((b, i) => (
              <li key={b.id} className={`backup-row ${i === 0 ? 'latest' : ''}`}>
                <div className="backup-info">
                  <span className="backup-when">
                    {relativeTime(b.created_at)}
                    {i === 0 && <span className="backup-badge">dernière</span>}
                  </span>
                  <span className="backup-meta">
                    {backupDate(b.created_at)} · {b.games_count} jeu{b.games_count > 1 ? 'x' : ''}
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
        {backups && backups.length > 2 && (
          <button type="button" className="backup-more" onClick={() => setToutesSauvegardes((v) => !v)}>
            {toutesSauvegardes ? 'Réduire' : `Voir les ${backups.length - 2} plus anciennes`}
          </button>
        )}
        {backups && backups.length === 0 && (
          <p className="field-hint" style={{ marginTop: 12 }}>Aucune sauvegarde pour l'instant.</p>
        )}
      </section>

      {/* Sauvegarde en FICHIER : à garder sur l'appareil ou à ré-importer. */}
      <section className="settings-card">
        <h3>Sauvegarde en fichier</h3>
        <p className="field-hint">Un fichier à garder chez vous, ou à ré-importer plus tard.</p>
        <div className="save-actions">
          <button type="button" className="btn-ghost" onClick={onExport} title="Télécharger la sauvegarde complète (fichier .json)">
            Exporter
          </button>
          <button type="button" className="btn-ghost" onClick={onExportCsv} title="Télécharger 2 fichiers .csv (jeux et parties) ouvrables dans un tableur">
            Export tableur
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={!online}
            title={online ? 'Importer un fichier de sauvegarde' : 'Indisponible hors ligne'}
          >
            Importer
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
      </section>

      <section className="settings-card">
        <h3>Liens utiles</h3>
        <div className="links">
          {LINKS.map((l) => (
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
            </Fragment>
          ))}
        </div>
      </section>

      <div className="app-version">
        <p>Version {__APP_VERSION__}</p>
        <button type="button" className="version-check" onClick={runUpdateCheck} disabled={upd === "checking" || upd === "updating"}>
          {upd === "checking"
            ? 'Vérification…'
            : upd === "updating"
              ? 'Mise à jour…'
              : 'Vérifier les mises à jour'}
        </button>
        {upd === "uptodate" && <p className="version-msg">Vous êtes à jour.</p>}
        {upd === "error" && <p className="version-msg">Vérification impossible (hors ligne ?).</p>}
      </div>
    </div>
  )
}
