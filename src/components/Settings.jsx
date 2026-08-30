/* global __APP_VERSION__ */
import { Fragment, useMemo, useRef, useState } from 'react'
import { BackIcon } from './icons'
import qrcode from 'qrcode-generator'
import { getTheme, applyTheme } from '../lib/theme'
import { getDensite, applyDensite, DENSITES } from '../lib/densite'
import { haptiqueDisponible, haptiqueActive, setHaptique } from '../lib/haptique'
import { checkForUpdate, forceUpdate } from '../lib/update'
import SortMenu from './SortMenu'
import Bascule from './Bascule'
import { SITE_LOGOS } from '../lib/logos'

// Écran Réglages — ce qui vaut pour CET APPAREIL (apparence, densité, vibrations, sauvegarde
// en fichier) et les commandes qui touchent toute la base. Ce qui suit la PERSONNE (avatar,
// tags, noms des jeux en grille) vit dans le menu Compte, pas ici.
// L'ordre suit l'usage : ce qu'on vient régler d'abord, puis les sauvegardes, puis le partage
// et les liens — qu'on ouvre une fois dans sa vie.

const LINKS = [
  { label: "Melodice (musiques d'ambiance de jeux)", url: 'https://melodice.org/', domain: 'melodice.org' },
  { label: 'Base de données (Supabase)', url: 'https://supabase.com/dashboard/project/rfzanybiwciovbzrcozb', domain: 'supabase.com' },
  { label: 'Hébergement (Vercel)', url: 'https://vercel.com/kalyx/kalyx', domain: 'vercel.com' },
  { label: 'BoardGameGeek (Kalyx)', url: 'https://boardgamegeek.com/application/7068', domain: 'boardgamegeek.com' },
  { label: 'Code source (GitHub)', url: 'https://github.com/Kalyx-games/Kalyx', domain: 'github.com' },
]

// Lien de l'application (à copier pour partager).
const APP_URL = 'https://kalyx-sepia.vercel.app'

const FREQ_OPTIONS = [
  { value: 'always', label: 'À chaque ouverture' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
  { value: 'manual', label: 'Jamais' },
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
    // ⚠️ Surtout PAS la date absolue : la ligne du dessous l'affiche déjà, on la disait
    // alors deux fois. Un temps relatif reste un temps relatif jusqu'au bout.
    const m = Math.round(j / 30)
    return `il y a ${m} mois`
  } catch {
    return iso
  }
}

export default function Settings({
  onExport, onExportCsv, onImportFile, backupsLoaded = true,
  backupFreq, onSetBackupFreq, backups, backupBusy, onBackupNow, onRestore,
  onOpenPlayers,
  onEnterCode, onChangeCode, deviceAuthorized, onRejouerIndice,
  online, onClose,
}) {
  const fileRef = useRef(null)
  const [theme, setThemeState] = useState(getTheme)
  const [densite, setDensiteState] = useState(getDensite)
  const [vibrations, setVibrations] = useState(haptiqueActive)
  const [copied, setCopied] = useState(false)
  // Vérification manuelle de mise à jour : le service worker peut se coincer et resservir
  // l'ancienne version indéfiniment ; ce bouton interroge le réseau puis renouvelle tout.
  const [upd, setUpd] = useState(null)
  const [toutesSauvegardes, setToutesSauvegardes] = useState(false)
  const runUpdateCheck = async () => {
    setUpd('checking')
    // Réarme au passage le rappel du geste de glissé : il rejouera dès le retour à la liste.
    // C'est le moyen offert à l'utilisateur de le revoir quand il veut, sans réglage dédié.
    onRejouerIndice?.()
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

      {/* Pas un réglage : l'ÉTAT qui commande cinq boutons plus bas. Sans lui, ils sont
          grisés sans que rien n'explique pourquoi. Disparaît une fois l'appareil autorisé. */}
      {!deviceAuthorized && (
        <button type="button" className="device-lock" onClick={onEnterCode}>
          <span className="device-lock-txt">Cet appareil peut consulter, mais pas modifier.</span>
          <span className="device-lock-cta">Autoriser</span>
        </button>
      )}


      <section className="settings-card">
        <h3>Apparence</h3>
        {/* Le thème n'avait AUCUN libellé : ses trois puces flottaient sous le titre de la
            carte, ce qui obligeait « Vibrations » à porter le sien et déséquilibrait le tout.
            Les trois réglages sont maintenant nommés de la même façon. */}
        <span className="oe-label">Thème</span>
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

        {/* ⚠️ TROIS choix → des puces, pas une bascule : les puces passent à la ligne sur un
            écran étroit, une bascule à trois segments déborderait. Et elles sont nommées par
            la TAILLE des tuiles, jamais par un nombre de colonnes — ce nombre dépend de la
            largeur du téléphone (le CSS refuse de descendre sous un plancher et rend alors
            moins de colonnes), un libellé « 4 colonnes » mentirait sur un petit écran. */}
        <span className="oe-label">Tuiles en vue grille</span>
        <div className="chips">
          {DENSITES.map((d) => (
            <button
              key={d.valeur}
              type="button"
              className={`fchip ${densite === d.valeur ? 'on' : ''}`}
              onClick={() => { applyDensite(d.valeur); setDensiteState(d.valeur) }}
            >
              {d.label}
            </button>
          ))}
        </div>
        {/* Un seul interrupteur coupe TOUTES les vibrations de l'app.
            ⚠️ L'avertissement ne paraît QUE quand elles sont activées : c'est le seul moment
            où il répond à une question réelle (« je les ai allumées et je ne sens rien »).
            Firefox Android répond « oui je sais vibrer » puis ne fait rien. */}
        {haptiqueDisponible && (
          <>
            <span className="oe-label">Vibrations</span>
            <Bascule
              ariaLabel="Vibrations"
              valeur={vibrations}
              onChange={(v) => { setHaptique(v); setVibrations(v) }}
              options={[
                { valeur: true, label: 'Activées' },
                { valeur: false, label: 'Coupées' },
              ]}
            />
            {vibrations && (
              <p className="field-hint">
                Firefox ne les joue pas, et votre téléphone peut les couper.
              </p>
            )}
          </>
        )}
        {/* Une seule ligne pour les trois : c'est la distinction avec le menu Compte, dont
            les réglages suivent la personne d'un téléphone à l'autre. */}
        <p className="field-hint carte-portee">
          Ces réglages ne valent que sur ce téléphone.
        </p>
      </section>



      <section className="settings-card">
        <h3>Joueurs</h3>
        <button type="button" className="btn-ghost settings-open" onClick={onOpenPlayers} disabled={!online}>
          Renommer les joueurs
        </button>
      </section>

      {/* Sauvegarde AUTOMATIQUE (dans le cloud) : fréquence + bouton + liste des sauvegardes. */}
      <section className="settings-card">
        <h3>Sauvegarde en ligne</h3>

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
                  title={online ? undefined : 'Indisponible hors ligne'}
                >
                  ↩ Restaurer
                </button>
              </li>
            ))}
          </ul>
        )}
        {backups && backups.length > 2 && (
          <button type="button" className="backup-more" onClick={() => setToutesSauvegardes((v) => !v)}>
            {toutesSauvegardes
                    ? 'Réduire'
                    : backups.length - 2 > 1
                    ? `Voir les ${backups.length - 2} plus anciennes`
                    : 'Voir la plus ancienne'}
          </button>
        )}
        {/* ⚠️ TROIS états, et ils ne se disent pas de la même façon : pas encore chargées,
            table absente, ou vraiment aucune. La carte était muette dans les deux premiers. */}
        {!backupsLoaded && !online ? (
          // ⚠️ `reloadBackups` n'est appelé que depuis un effet gardé par `online` : hors ligne
          // la liste n'arrive JAMAIS. Dire « Chargement… » serait une attente sans fin.
          <p className="field-hint">Indisponible hors ligne.</p>
        ) : !backupsLoaded ? (
          <p className="field-hint">Chargement…</p>
        ) : !backups ? (
          <p className="field-hint">
            Les sauvegardes en ligne ne sont pas activées sur votre base.
          </p>
        ) : backups.length === 0 ? (
          <p className="field-hint">Aucune sauvegarde pour l'instant.</p>
        ) : null}
      </section>

      {/* Sauvegarde en FICHIER : à garder sur l'appareil ou à ré-importer. */}
      <section className="settings-card">
        <h3>Sauvegarde en fichier</h3>
        <div className="save-actions">
          <button type="button" className="btn-ghost" onClick={onExport} disabled={!online} title={online ? 'Toute la collection dans un fichier .json, ré-importable ici' : 'Indisponible hors ligne'}>
            Exporter (.json)
          </button>
          <button type="button" className="btn-ghost" onClick={onExportCsv} disabled={!online} title={online ? 'Deux fichiers .csv — les jeux et les parties — ouvrables dans un tableur' : 'Indisponible hors ligne'}>
            Export CSV
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={!online}
            title={online ? 'Relire un fichier .json exporté depuis Kalyx' : 'Indisponible hors ligne'}
          >
            Importer (.json)
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

      {deviceAuthorized && (
        <section className="settings-card">
          <h3>Code d'accès</h3>
          <button type="button" className="btn-ghost settings-open" onClick={onChangeCode} disabled={!online}>
            Changer le code
          </button>
          <button type="button" className="settings-relink" onClick={onEnterCode}>
            Ressaisir le code sur cet appareil
          </button>
        </section>
      )}

      <section className="settings-card">
        <h3>Partager Kalyx</h3>
        <div className="share-row">
          {qrDataUrl && <img className="share-qr" src={qrDataUrl} alt="QR code vers l'app Kalyx" width="118" height="118" />}
          <div className="share-info">
            <div className="share-link">{APP_URL.replace('https://', '')}</div>
            <button type="button" className={`btn-ghost share-copy ${copied ? 'copied' : ''}`} onClick={copyAppLink}>
              {copied ? 'Lien copié ✓' : 'Copier le lien'}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h3>Liens</h3>
        {/* ⚠️ Le CONTENU d'un rang est écrit UNE fois : seule la balise change (un vrai lien en
            ligne, une coquille inerte hors ligne). Il était recopié à l'identique des deux
            côtés — deux endroits à corriger pour un seul rang. */}
        <div className="links">
          {LINKS.map((l) => {
            const contenu = (
              <>
                <img
                  className="link-fav"
                  src={SITE_LOGOS[l.domain]}
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
              </>
            )
            return (
              <Fragment key={l.url}>
                {online ? (
                  <a className="link-row" href={l.url} target="_blank" rel="noreferrer">{contenu}</a>
                ) : (
                  <span className="link-row disabled" title="Indisponible hors ligne" aria-disabled="true">{contenu}</span>
                )}
              </Fragment>
            )
          })}
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
