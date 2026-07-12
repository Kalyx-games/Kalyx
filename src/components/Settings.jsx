import { useRef, useState } from 'react'
import { getTheme, applyTheme } from '../lib/theme'
import BubbleListManager from './BubbleListManager'

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

export default function Settings({
  owners, onAddOwner, onUpdateOwner, onDeleteOwner,
  tags, onAddTag, onUpdateTag, onDeleteTag,
  onExport, onImportFile, online, onClose,
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
        onAdd={onAddOwner}
        onUpdate={onUpdateOwner}
        onDelete={onDeleteOwner}
      />

      <BubbleListManager
        title="Tags"
        items={tags}
        migrationCode="migration_tags.sql"
        namePlaceholder="Nom du tag (ex. Coopératif)"
        onAdd={onAddTag}
        onUpdate={onUpdateTag}
        onDelete={onDeleteTag}
      />

      <section className="settings-card">
        <h3>Sauvegarde</h3>
        <p className="muted save-intro">
          Télécharge un fichier contenant toute ta collection (jeux + propriétaires + tags). Tu pourras le réimporter pour restaurer ou transférer tes données.
        </p>
        <div className="save-actions">
          <button type="button" className="btn-ghost" onClick={onExport}>⬇️ Exporter</button>
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
      </section>

      <section className="settings-card">
        <h3>Liens utiles</h3>
        <div className="links">
          {LINKS.map((l) => (
            <a key={l.url} className="link-row" href={l.url} target="_blank" rel="noreferrer">
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
          ))}
          <button type="button" className={`link-row link-copy ${copied ? 'copied' : ''}`} onClick={copyAppLink}>
            <span className="link-copy-icon" aria-hidden="true">🔗</span>
            <span className="link-label">{copied ? 'Lien copié ✓' : "Copier le lien de l'application"}</span>
            <span className="link-arrow">⧉</span>
          </button>
        </div>
      </section>
    </div>
  )
}
