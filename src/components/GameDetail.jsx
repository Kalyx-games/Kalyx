import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BackIcon, ExtIcon, PencilIcon, DieIcon } from './icons'
import { BGG_LOGO } from '../lib/logos'
import SnapshotPane from './SnapshotPane'
import { backdropSrc, heroSrc } from '../lib/img'
import {
  parseOwners, parseTags, ownerDisplay, parseExtensions,
  basePlayersSet, effectivePlayersSet, baseBestSet, effectiveBestSet, countsToText,
} from '../lib/games'


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
  ownerMap, tagMap, siblings = [], onNavigate, closing = false,
  onClose, onNewPlay, onStats, onHistory, onCreateSheet, onEdit, onBgg,
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
  const [heroActions, setHeroActions] = useState(false) // les actions posées sur la jaquette
  useEffect(() => setImgBroken(false), [fullImg])
  const showImg = Boolean(fullImg) && !imgBroken

  // Glissé horizontal sur la fiche → jeu précédent/suivant de la liste filtrée (siblings).
  // Écouteurs tactiles natifs non-passifs (comme ailleurs). navRef reste frais à chaque rendu.
  const idx = siblings.findIndex((g) => g.id === game.id)
  const sheetRef = useRef(null)
  const headRef = useRef(null)
  const swipeRef = useRef({ x: 0, y: 0, dragging: false })
  const navDirRef = useRef(0) // sens du dernier changement de jeu (0 = ouverture, 1 = suivant, -1 = précédent)
  // Transition PLEIN ÉCRAN (pager) : on fige un instantané du corps ACTUEL qui glisse dehors PENDANT
  // que le corps du NOUVEAU jeu glisse dedans → on voit vraiment une fiche remplacer l'autre.
  const bodyRef = useRef(null)
  const [bodyLeaving, setBodyLeaving] = useState(null) // { node, dir, top, left, width } | null
  // La tête change de hauteur avec le nombre de lignes du titre, donc le corps entrant peut
  // ne pas être à la même ordonnée que l'instantané sortant (mesuré : 20px d'écart entre un
  // titre d’une ligne et un titre de deux). On réaligne, sinon les deux panneaux se croisent
  // en escalier — et le fond d’ambiance du sortant paraîtrait sauter.
  useLayoutEffect(() => {
    if (!bodyLeaving || !bodyRef.current) return
    const top = bodyRef.current.getBoundingClientRect().top
    setBodyLeaving((b) => (b && Math.abs(b.top - top) > 0.5 ? { ...b, top } : b))
  }, [bodyLeaving])
  // On change de jeu (glissé) → les actions de la jaquette se referment.
  useEffect(() => { setHeroActions(false) }, [game.id])
  // Le fond d'ambiance remonte DERRIÈRE la tête : son décalage était la somme codée en dur
  // 8+6+44+14, calée sur une tête d'une seule ligne. Depuis que le titre y revient et peut
  // passer sur deux lignes, on mesure la tête pour de bon.
  useEffect(() => {
    const head = headRef.current
    const sheet = sheetRef.current
    if (!head || !sheet) return
    const mesurer = () => sheet.style.setProperty('--kx-head-h', head.offsetHeight + 'px')
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])
  const leaveTimer = useRef(null)
  const startNav = (dir) => {
    const next = idx + dir
    if (!onNavigate || idx < 0 || next < 0 || next >= siblings.length) return
    const el = bodyRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const clone = el.cloneNode(true)
      clearTimeout(leaveTimer.current)
      setBodyLeaving({ node: clone, dir, top: rect.top, left: rect.left, width: rect.width })
      // Filet de sécurité : normalement l'instantané est retiré par onAnimationEnd (synchronisé pile à
      // la fin de l'anim → pas de « bande figée » qui traîne). Ce timeout (plus long) ne sert qu'au cas
      // où animationend ne se déclenche pas (reduced-motion, anim interrompue).
      leaveTimer.current = setTimeout(() => setBodyLeaving(null), 600)
    }
    navDirRef.current = dir
    if (sheetRef.current) sheetRef.current.scrollTop = 0 // nouveau jeu en haut, aligné avec l'instantané
    onNavigate(siblings[next]) // bascule immédiate → le nouveau corps glisse en entrée
  }
  const navRef = useRef({})
  navRef.current = { startNav }
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const st = swipeRef.current
    const onStart = (e) => { const t = e.touches[0]; st.x = t.clientX; st.y = t.clientY; st.dragging = false }
    const onMove = (e) => {
      const t = e.touches[0]
      const dx = t.clientX - st.x
      const dy = t.clientY - st.y
      if (!st.dragging && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) + 6) st.dragging = true
      if (st.dragging) e.preventDefault()
    }
    const onEnd = (e) => {
      if (!st.dragging) return
      st.dragging = false
      const dx = e.changedTouches[0].clientX - st.x
      if (Math.abs(dx) < 60) return
      navRef.current.startNav(dx < 0 ? 1 : -1) // glissé vers la gauche → jeu suivant
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  return (
    <div className={`sheet detail-sheet${closing ? ' closing' : ''}`} ref={sheetRef}>
      <div className="settings-head" ref={headRef}>
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        {/* Le titre partage la rangée avec le seul bouton retour, et il REVIENT À LA LIGNE :
            avec une troncature, 11 jeux sur 146 étaient encore coupés à 375px. La tête peut
            donc grandir → le fond d'ambiance se recale dessus (voir --kx-head-h). */}
        <h2 className="detail-title">{game.name}</h2>
      </div>

      {/* Corps du nouveau jeu qui GLISSE en entrée (plein écran). L'ancien corps (instantané figé)
          glisse dehors en même temps → cf. SnapshotPane plus bas. key={game.id} → re-montage. */}
      {bodyLeaving && (
        <SnapshotPane
          node={bodyLeaving.node}
          className={`detail-body-leaving dir-${bodyLeaving.dir}`}
          style={{ top: bodyLeaving.top, left: bodyLeaving.left, width: bodyLeaving.width }}
          onAnimationEnd={() => { clearTimeout(leaveTimer.current); setBodyLeaving(null) }}
        />
      )}
      <div className="detail-body" key={game.id} data-dir={navDirRef.current} ref={bodyRef}>
      {/* Fond d'ambiance : la jaquette, floutée, teinte le haut de la fiche puis se fond
          dans le fond de page. L'image est demandée en 128 px de large — un flou de 30 px
          n'a que faire de la définition, et ça ne coûte que quelques kilo-octets. */}
      {showImg && (
        <div className="detail-backdrop" aria-hidden="true">
          <img
            src={backdropSrc(fullImg)}
            alt=""
            // Repli sur l'image brute si l'optimiseur ne répond pas (domaine non listé, dev).
            onError={(e) => { if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg }}
          />
        </div>
      )}
      <div className="detail-hero-wrap">
        {showImg ? (
          <button
            type="button"
            className="detail-hero"
            onClick={() => setHeroActions((v) => !v)}
            aria-expanded={heroActions}
            aria-label={heroActions ? 'Masquer les actions' : 'Afficher les actions du jeu'}
          >
            <img
              src={heroSrc(fullImg)}
              alt=""
              onError={(e) => {
                // 1er échec (optimiseur) → tente l'image brute ; 2e échec → repli sur le dé.
                if (e.currentTarget.src !== fullImg) e.currentTarget.src = fullImg
                else setImgBroken(true)
              }}
            />
          </button>
        ) : (
          <button
            type="button"
            className="detail-hero detail-hero-empty"
            onClick={() => setHeroActions((v) => !v)}
            aria-expanded={heroActions}
            aria-label={heroActions ? 'Masquer les actions' : 'Afficher les actions du jeu'}
          >
            <span aria-hidden="true">🎲</span>
          </button>
        )}
        {/* Les actions de service ne se montrent QUE si on touche la jaquette : elles ne pèsent
            sur rien tant qu'on consulte, et restent à portée quand on les cherche. Rendues même
            sans image : sinon, un jeu sans jaquette n'aurait plus aucun accès à Modifier ni BGG. */}
        <div className={`detail-hero-acts${heroActions ? ' on' : ''}`} aria-hidden={!heroActions}>
          <button type="button" className="hero-act" onClick={onEdit} disabled={!online} tabIndex={heroActions ? 0 : -1}>
            <PencilIcon size={17} /> Modifier
          </button>
          {onBgg && (
            <button type="button" className="hero-act" onClick={onBgg} tabIndex={heroActions ? 0 : -1}>
              <img className="bgg-mark" src={BGG_LOGO} alt="" width="17" height="17" /> BGG
            </button>
          )}
        </div>
      </div>

      <div className="detail-infos">
        <div className="detail-info"><span className="detail-info-k">Joueurs</span><span className="detail-info-v">{playersText}</span></div>
        {bestText && <div className="detail-info"><span className="detail-info-k">Idéal</span><span className="detail-info-v">{bestText}</span></div>}
        <div className="detail-info"><span className="detail-info-k">Durée</span><span className="detail-info-v">{durationLabel(game)}</span></div>
        <div className="detail-info" title={complexity ? `${complexity} sur 5 (BoardGameGeek)` : undefined}>
          <span className="detail-info-k">Complexité</span>
          {/* le mot parle de lui-même ; le chiffre BGG reste en infobulle */}
          <span className="detail-info-v">{complexity ? complexityWord(complexity) : '—'}</span>
        </div>
      </div>


      {extensions.length > 0 && (
        <p className="detail-ext"><span className="detail-info-k"><ExtIcon size={13} /></span> {extensions.join(', ')}</p>
      )}

      {/* La donnée vivante du jeu, traitée comme telle : le nombre en grand, et toute la
          rangée mène à la liste des parties — on tape le compte, on obtient ce qu'il compte. */}
      {hasSheet && (
        <button type="button" className="detail-plays" onClick={onHistory} disabled={!online} title="Voir l’historique des parties">
          <span className="detail-plays-n">{playCount}</span>
          <span className="detail-plays-txt">
            {playCount > 1 ? 'parties jouées' : 'partie jouée'}
            {lastPlayedLabel && <span className="detail-plays-last">dernière le {lastPlayedLabel}</span>}
          </span>
          <span className="detail-plays-go" aria-hidden="true">›</span>
        </button>
      )}

      <div className="detail-actions">
        {hasSheet ? (
          <>
            {/* Une seule action primaire. Les statistiques restent à un tap, au second rang
                (la liste des parties, elle, est sous le compte juste au-dessus). */}
            <button type="button" className="btn-primary detail-primary" onClick={onNewPlay} disabled={!online}>
              <DieIcon size={18} /> Nouvelle partie
            </button>
            <button type="button" className="btn-ghost detail-secondary" onClick={onStats} disabled={!online}>
              Statistiques
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary detail-primary" onClick={onCreateSheet} disabled={!online}>
            Créer la fiche de score
          </button>
        )}
      </div>
      {poll && (
        <div className="detail-poll">
          <div className="detail-poll-head">
            Nombre de joueurs
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
          <div className="detail-poll-head">Nombre de joueurs</div>
          <p className="detail-poll-none">Aucun sondage sur BoardGameGeek pour ce jeu.</p>
        </div>
      )}
      {/* Qui possède le jeu : la dernière chose qu'on cherche sur une fiche, donc la dernière
          de la page. Les noms en entier (la fiche a la place que la carte n'a pas), avec la
          pastille de couleur des bulles pour garder le lien avec la liste. */}
      {(owners.length > 0 || tags.length > 0) && (
        <p className="detail-owners">
          {owners.map((o) => (
            <span key={`o-${o}`} className="detail-owner">
              <i style={{ background: ownerDisplay(o, ownerMap).color }} aria-hidden="true" />{o}
            </span>
          ))}
          {tags.map((t) => (
            <span key={`t-${t}`} className="detail-owner">
              <i style={{ background: ownerDisplay(t, tagMap).color }} aria-hidden="true" />{t}
            </span>
          ))}
        </p>
      )}
      </div>
    </div>
  )
}
