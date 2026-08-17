import { Fragment, useEffect, useState } from 'react'
import {
  parseOwners, parseTags, ownerDisplay, parseExtensions,
  basePlayersSet, effectivePlayersSet, baseBestSet, effectiveBestSet, countsToText,
} from '../lib/games'

// Miniature optimisée (même image que la carte + le zoom), via l'optimiseur Vercel.
const thumbSrc = (url, w) => `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=72`

// Durée : identique à la carte ("30 min", "1 h", "1h30").
function durationLabel(g) {
  const d = g.duration_max ?? g.duration_min
  if (!d) return '—'
  if (d < 60) return `${d} min`
  const h = Math.floor(d / 60)
  const m = d % 60
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
}
const complexityWord = (n) => (n == null ? '' : n < 2 ? 'Simple' : n < 3 ? 'Moyen' : 'Corsé')

// Page détaillée d'un jeu (« fiche jeu ») — le point d'ancrage : depuis ici on lance une
// partie, on ouvre l'historique + les stats, on modifie le jeu, on va sur BGG, on zoome
// l'image. TOUTES les actions renvoient vers les écrans existants (rien n'est perdu).
export default function GameDetail({
  game, online, hasSheet, playCount = 0, lastPlayedLabel,
  ownerMap, tagMap,
  onClose, onZoomImage, onNewPlay, onStats, onHistory, onCreateSheet, onEdit, onBgg,
}) {
  const basePlayers = basePlayersSet(game)
  const extraPlayers = effectivePlayersSet(game).filter((n) => !basePlayers.includes(n))
  const playersText = (countsToText(basePlayers) || '—') + (extraPlayers.length ? ` (${countsToText(extraPlayers)})` : '')

  const baseBest = baseBestSet(game)
  const extraBest = effectiveBestSet(game).filter((n) => !baseBest.includes(n))
  const bestBaseText = countsToText(baseBest)
  const bestText = bestBaseText
    ? bestBaseText + (extraBest.length ? ` (${countsToText(extraBest)})` : '')
    : extraBest.length
    ? `(${countsToText(extraBest)})`
    : ''

  const complexity = game.complexity ? Number(game.complexity) : null
  const extensions = parseExtensions(game.extensions).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'fr'))
  const owners = parseOwners(game.owner)
  const tags = parseTags(game.tags)
  const fullImg = game.image_url

  // Sondage BGG « nombre de joueurs » : { total, rows:[{n,best,rec,notRec}] }.
  // pollSearched = on a bien interrogé BGG (objet avec un tableau rows, même vide) → distingue
  // « sondage cherché mais vide » (petite phrase) de « non cherché » (rien, bgg_poll absent/null).
  const pollSearched = game.bgg_poll && Array.isArray(game.bgg_poll.rows) ? game.bgg_poll : null
  const poll = pollSearched && pollSearched.rows.length ? pollSearched : null

  // Repli si l'image ne charge pas (optimiseur ET image brute en échec) → on montre le dé
  // au lieu d'une icône d'image cassée (cohérent avec la carte).
  const [imgBroken, setImgBroken] = useState(false)
  useEffect(() => setImgBroken(false), [fullImg])
  const showImg = Boolean(fullImg) && !imgBroken

  return (
    <div className="sheet detail-sheet">
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour">‹</button>
        <h2 className="detail-title">{game.name}</h2>
      </div>

      <div className="detail-hero-wrap">
        {showImg ? (
          <button type="button" className="detail-hero" onClick={() => onZoomImage(fullImg)} aria-label="Agrandir l'image">
            <img
              src={thumbSrc(fullImg, 512)}
              alt=""
              onError={(e) => {
                // 1er échec (optimiseur) → tente l'image brute ; 2e échec → repli sur le dé.
                if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg
                else setImgBroken(true)
              }}
            />
          </button>
        ) : (
          <div className="detail-hero detail-hero-empty" aria-hidden="true">🎲</div>
        )}
        {/* Propriétaires + tags empilés en bas à gauche de l'image (comme les cartes) → gain de place. */}
        {(owners.length > 0 || tags.length > 0) && (
          <div className="detail-bubbles" onClick={(e) => e.stopPropagation()}>
            {owners.map((o) => {
              const d = ownerDisplay(o, ownerMap)
              return <span key={`o-${o}`} className="owner-bubble" style={{ background: d.color }} title={o}>{d.initials}</span>
            })}
            {tags.map((t) => {
              const d = ownerDisplay(t, tagMap)
              return <span key={`t-${t}`} className="owner-bubble" style={{ background: d.color }} title={t}>{d.initials}</span>
            })}
          </div>
        )}
      </div>

      <div className="detail-infos">
        <div className="detail-info"><span className="detail-info-k">👥 Joueurs</span><span className="detail-info-v">{playersText}</span></div>
        {bestText && <div className="detail-info"><span className="detail-info-k">⭐ Idéal</span><span className="detail-info-v">{bestText}</span></div>}
        <div className="detail-info"><span className="detail-info-k">🕑 Durée</span><span className="detail-info-v">{durationLabel(game)}</span></div>
        <div className="detail-info"><span className="detail-info-k">🧠 Complexité</span><span className="detail-info-v">{complexity ? `${complexity} · ${complexityWord(complexity)}` : '—'}</span></div>
      </div>

      {extensions.length > 0 && (
        <p className="detail-ext"><span className="detail-info-k">🧩 Extensions</span> {extensions.join(', ')}</p>
      )}

      {hasSheet && (
        <p className="detail-plays">
          {playCount > 0
            ? `${playCount} partie${playCount > 1 ? 's' : ''} enregistrée${playCount > 1 ? 's' : ''}${lastPlayedLabel ? ` · dernière le ${lastPlayedLabel}` : ''}.`
            : 'Aucune partie enregistrée pour l’instant.'}
        </p>
      )}

      <div className="detail-actions">
        {hasSheet ? (
          <>
            {/* Gros bouton « Nouvelle partie » en tête, puis les 4 boutons (grille 2×2). */}
            <button type="button" className="btn-primary detail-primary" onClick={onNewPlay} disabled={!online}>🎲 Nouvelle partie</button>
            <div className="detail-grid">
              <button type="button" className="btn-ghost" onClick={onStats} disabled={!online}>📊 Statistiques</button>
              <button type="button" className="btn-ghost" onClick={onHistory} disabled={!online}>📚 Historique</button>
              <button type="button" className="btn-ghost" onClick={onEdit} disabled={!online}>✏️ Modifier le jeu</button>
              {onBgg && (
              <button type="button" className="btn-ghost detail-bgg-btn" onClick={onBgg}>
                <img
                  className="bgg-logo"
                  src="https://www.google.com/s2/favicons?domain=boardgamegeek.com&sz=64"
                  alt=""
                  width="18"
                  height="18"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                BGG ↗
              </button>
            )}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary detail-primary" onClick={onCreateSheet} disabled={!online}>🧮 Créer la fiche de score</button>
            <div className="detail-grid">
              <button type="button" className="btn-ghost" onClick={onEdit} disabled={!online}>✏️ Modifier le jeu</button>
              {onBgg && (
              <button type="button" className="btn-ghost detail-bgg-btn" onClick={onBgg}>
                <img
                  className="bgg-logo"
                  src="https://www.google.com/s2/favicons?domain=boardgamegeek.com&sz=64"
                  alt=""
                  width="18"
                  height="18"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                BGG ↗
              </button>
            )}
            </div>
          </>
        )}
      </div>

      {poll && (
        <div className="detail-poll">
          <div className="detail-poll-head">
            🗳️ Nombre de joueurs
            {poll.total ? <span className="detail-poll-total"> · {poll.total} votes</span> : null}
          </div>
          {/* Légende en toutes lettres (pas d'abréviation ambiguë), puis le tableau :
              une ligne par nombre de joueurs, barre visuelle + 3 colonnes de % alignées. */}
          <div className="poll-legend">
            <span className="poll-key"><span className="poll-dot poll-best" />Idéal</span>
            <span className="poll-key"><span className="poll-dot poll-rec" />Recommandé</span>
            <span className="poll-key"><span className="poll-dot poll-not" />Déconseillé</span>
          </div>
          <div className="poll-grid">
            {poll.rows.map((r) => {
              const best = r.best || 0
              const rec = r.rec || 0
              const notRec = r.notRec || 0
              const sum = best + rec + notRec
              const p = (v) => (sum > 0 ? Math.round((v / sum) * 100) : 0)
              const pb = p(best)
              const pr = p(rec)
              const pn = p(notRec)
              return (
                <Fragment key={r.n}>
                  <span className="poll-n">{r.n}</span>
                  <span className="poll-bar">
                    <span className="poll-seg poll-best" style={{ width: `${pb}%` }} />
                    <span className="poll-seg poll-rec" style={{ width: `${pr}%` }} />
                    <span className="poll-seg poll-not" style={{ width: `${pn}%` }} />
                  </span>
                  <span className="poll-pct poll-pct-best">{pb}%</span>
                  <span className="poll-pct poll-pct-rec">{pr}%</span>
                  <span className="poll-pct poll-pct-not">{pn}%</span>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Sondage cherché mais sans aucun vote sur BGG → on l'indique (uniquement dans ce cas). */}
      {!poll && pollSearched && (
        <div className="detail-poll">
          <div className="detail-poll-head">🗳️ Nombre de joueurs</div>
          <p className="detail-poll-none">Aucun sondage sur BoardGameGeek pour ce jeu.</p>
        </div>
      )}
    </div>
  )
}
