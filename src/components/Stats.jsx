import { useMemo, useState } from 'react'
import { computeStats } from '../lib/stats'
import SortMenu from './SortMenu'

// Écran Statistiques : chiffres clés + répartitions en barres horizontales.
// Tout est calculé sur la COLLECTION (jeux possédés) déjà filtrée par les filtres
// partagés (les mêmes que l'onglet Collection) — d'où l'absence de filtre propre ici.

const PLAYERS_COLOR = 'var(--bar-on)' // encre : la longueur porte l'info, pas la teinte
const OPTIMAL_COLOR = 'var(--gold)' // l'or reste à l'idéal ⭐
const DURATION_COLOR = 'var(--bar-on)'
const COMPLEXITY_COLOR = 'var(--bar-on)'

// Une ligne de barre horizontale : libellé · piste remplie · valeur.
function BarRow({ label, sub, count, max, color, onClick }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const inner = (
    <>
      <div className="bar-label">
        {label}
        {sub ? <span className="bar-sub"> {sub}</span> : null}
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="bar-val">{count}</div>
    </>
  )
  // Barre cliquable → applique le filtre correspondant à la Collection.
  return onClick ? (
    <button type="button" className="bar-row bar-row-btn" onClick={onClick} aria-label={`Filtrer : ${label}`}>
      {inner}
    </button>
  ) : (
    <div className="bar-row">{inner}</div>
  )
}

// Un bloc « carte » contenant un titre et une liste de barres.
// `onPick(row)` (optionnel) rend chaque barre non vide cliquable.
function BarBlock({ title, rows, color, empty, onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  const anyData = rows.some((r) => r.count > 0)
  return (
    <section className="stat-block">
      <h3 className="stat-block-title">{title}</h3>
      {anyData ? (
        <div className="bars">
          {rows.map((r) => (
            <BarRow
              key={r.key}
              label={r.label}
              sub={r.sub}
              count={r.count}
              max={max}
              color={r.color || color}
              onClick={onPick && r.count > 0 ? () => onPick(r) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="stat-empty-line">{empty}</p>
      )}
    </section>
  )
}

// Libellé de complexité (à côté de la moyenne chiffrée).
const complexityWord = (n) => (n == null ? '' : n < 2 ? 'Simple' : n < 3 ? 'Moyen' : 'Corsé')
const CX_LABEL_TO_BUCKET = { Simple: 'simple', Moyen: 'moyen', Corsé: 'complexe' }

function Tile({ value, label, sub }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
      {sub ? <div className="stat-tile-sub">{sub}</div> : null}
    </div>
  )
}

// Section « Joueur » : choisir un joueur → son bilan global (toutes parties, tous jeux).
// `playerOverall` = [{name, games, wins, winRate}] trié par nb de parties (le + assidu 1er).
// Entités spéciales du comparatif (sinon = un nom de joueur).
const ALL = '__all__'
const REGULARS = '__regulars__'
// Vert = meilleur, rouge = moins bon, gris = égalité (mêmes règles que le comparatif d'un jeu).
function cmpClasses(a, b) {
  if (a == null || b == null || a === b) return ['cmp-tie', 'cmp-tie']
  return a > b ? ['cmp-good', 'cmp-bad'] : ['cmp-bad', 'cmp-good']
}

function PlayerSection({ playerOverall }) {
  const all = playerOverall || []
  // On ne propose que les joueurs réguliers sur au moins un jeu : ceux qui n'ont fait que
  // passer encombreraient le menu. (Repli sur la liste complète par sécurité.)
  const regulars = all.filter((p) => p.regular)
  const list = regulars.length ? regulars : all
  const [selected, setSelected] = useState(null)
  const [cmp, setCmp] = useState({ left: null, right: null })

  // Agrège un ensemble de joueurs vu comme UNE entité (somme des parties/victoires).
  const aggregate = (names) => {
    const set = new Set(names)
    let games = 0
    let wins = 0
    all.forEach((p) => {
      if (!set.has(p.name)) return
      games += p.games
      wins += p.wins
    })
    return { games, wins, winRate: games ? Math.round((wins / games) * 100) : 0 }
  }
  const isGroup = (key) => key === ALL || key === REGULARS
  const entityNames = (key) =>
    key === ALL ? all.map((p) => p.name) : key === REGULARS ? regulars.map((p) => p.name) : [key]
  // Si un groupe est comparé à un joueur seul qui en fait partie, on le retire du groupe
  // (comparer un joueur à un groupe qui le contient n'a aucun intérêt).
  const membersFor = (key, otherKey) => {
    if (!(isGroup(key) && !isGroup(otherKey))) return entityNames(key)
    const filtered = entityNames(key).filter((n) => n !== otherKey)
    return filtered.length ? filtered : entityNames(key) // ne jamais vider le groupe
  }
  const excludedFrom = (key, otherKey) =>
    isGroup(key) && !isGroup(otherKey) && entityNames(key).includes(otherKey) && entityNames(key).length > 1
      ? otherKey
      : null
  const entityOptions = [
    { value: ALL, label: 'Tout le monde' },
    ...(regulars.length > 1 ? [{ value: REGULARS, label: 'Joueurs réguliers' }] : []),
    ...list.map((p) => ({ value: p.name, label: p.name })),
  ]
  // Défaut : les réguliers face au joueur le plus assidu.
  const cmpLeft = cmp.left ?? (regulars.length > 1 ? REGULARS : ALL)
  const cmpRight = cmp.right ?? (list[0]?.name || ALL)
  const membersA = membersFor(cmpLeft, cmpRight)
  const membersB = membersFor(cmpRight, cmpLeft)
  const A = aggregate(membersA)
  const B = aggregate(membersB)
  const aExcl = excludedFrom(cmpLeft, cmpRight)
  const bExcl = excludedFrom(cmpRight, cmpLeft)
  // Pour un GROUPE, on affiche la MOYENNE par joueur (sinon le groupe a toujours des totaux
  // plus gros → comparaison inutile). Pour un joueur seul, c'est son compte brut.
  const anyGroup = membersA.length > 1 || membersB.length > 1
  const avgVal = (sum, members) => (members.length > 1 ? Math.round((sum / members.length) * 10) / 10 : sum)
  // aNum/bNum servent à COLORER (comparaison numérique) ; aTxt/bTxt à AFFICHER.
  const cmpRow = (label, aTxt, bTxt, aNum, bNum, colored) => {
    const [ca, cb] = colored ? cmpClasses(aNum, bNum) : ['cmp-tie', 'cmp-tie']
    return (
      <tr>
        <th className="cmp-label" scope="row">{label}</th>
        <td className={`cmp-cell ${ca}`}><span className="cmp-val">{aTxt}</span></td>
        <td className={`cmp-cell ${cb}`}><span className="cmp-val">{bTxt}</span></td>
      </tr>
    )
  }

  if (list.length === 0) return null // pas encore de partie enregistrée → section masquée
  const current = list.find((p) => p.name === selected) || list[0] // défaut : le + de parties
  return (
    <section className="stat-block">
      <h3 className="stat-block-title">Bilan d'un joueur</h3>
      <SortMenu
        value={current.name}
        options={list.map((p) => ({ value: p.name, label: p.name }))}
        onChange={setSelected}
        arrows={false}
      />
      <div className="stat-tiles" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.winRate} %</div>
          <div className="stat-tile-label">taux de victoire</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.games}</div>
          <div className="stat-tile-label">{current.games > 1 ? 'parties jouées' : 'partie jouée'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{current.wins}</div>
          <div className="stat-tile-label">{current.wins > 1 ? 'parties gagnées' : 'partie gagnée'}</div>
        </div>
        {/* Meilleur jeu : hors coopératif (tout le monde y gagne), min. 3 parties. */}
        <div className="stat-tile">
          <div className="stat-tile-value stat-tile-text">{current.bestGame ? current.bestGame.name : '—'}</div>
          <div className="stat-tile-label">
            meilleur jeu{current.bestGame ? ` (${current.bestGame.winRate} %)` : ''}
          </div>
        </div>
      </div>

      {/* Comparaison de deux entités (un joueur, les réguliers, ou tout le monde),
          même principe que le comparatif d'un jeu. */}
      <h3 className="stat-block-title" style={{ marginTop: 18 }}>Comparaison</h3>
      <div className="cmp-heads">
        <SortMenu
          value={cmpLeft}
          options={entityOptions.filter((o) => o.value !== cmpRight)}
          onChange={(v) => setCmp((c) => ({ ...c, left: v }))}
          arrows={false}
        />
        <span className="cmp-vs">vs</span>
        <SortMenu
          value={cmpRight}
          options={entityOptions.filter((o) => o.value !== cmpLeft)}
          onChange={(v) => setCmp((c) => ({ ...c, right: v }))}
          arrows={false}
        />
      </div>
      {(aExcl || bExcl) && (
        <div className="cmp-heads">
          <span className="cmp-excl">{aExcl ? `hors ${aExcl}` : ''}</span>
          <span className="cmp-vs" />
          <span className="cmp-excl">{bExcl ? `hors ${bExcl}` : ''}</span>
        </div>
      )}
      <table className="stat-table cmp-table">
        <tbody>
          {cmpRow('Taux de victoire', `${A.winRate} %`, `${B.winRate} %`, A.winRate, B.winRate, true)}
          {/* Pour un groupe : MOYENNE par joueur (sinon le total du groupe est toujours plus gros).
              En gris : victoires/parties dépendent surtout du nb de parties jouées → le taux de
              victoire reste la seule comparaison colorée pertinente. */}
          {cmpRow(
            anyGroup ? 'Victoires (moy.)' : 'Victoires',
            avgVal(A.wins, membersA),
            avgVal(B.wins, membersB),
            0,
            0,
            false
          )}
          {cmpRow(
            anyGroup ? 'Parties (moy.)' : 'Parties',
            avgVal(A.games, membersA),
            avgVal(B.games, membersB),
            0,
            0,
            false
          )}
        </tbody>
      </table>
    </section>
  )
}

export default function Stats({ games, hasCollection, playerOverall, onOpenTierlists, anecdote, onFilter }) {
  const s = useMemo(() => computeStats(games), [games])

  // Aucun jeu de collection à afficher : soit la collection est vraiment vide,
  // soit les filtres actifs excluent tout (message différent pour ne pas induire en erreur).
  const noCollectionShown = (games ?? []).every((g) => g.status === 'wishlist')

  // Anecdote du jour (issue des tierlists), tout en haut de l'onglet Stats.
  const anecEl = anecdote ? (
    <div className="tl-anec-hero">
      <div className="tl-anec-hero-label">💡 Le saviez-vous ?</div>
      <div className="tl-anec-hero-main">
        <span className="tl-anec-hero-icon">{anecdote.icon}</span>
        <span className="tl-anec-hero-text">{anecdote.text}</span>
      </div>
    </div>
  ) : null

  // Grand bouton d'accès aux tierlists (toujours en haut de l'onglet Stats).
  const tierBtn = onOpenTierlists ? (
    <button type="button" className="tl-open-btn" onClick={onOpenTierlists}>
      Tierlists
    </button>
  ) : null

  if (noCollectionShown) {
    return (
      <div className="stats">
        {anecEl}
        {tierBtn}
        <div className="empty stats-empty">
          <p className="empty-emoji">📊</p>
          {hasCollection ? (
            <>
              <p>Aucun jeu ne correspond à tes filtres.</p>
              <p className="muted">Modifie ou réinitialise les filtres pour voir les statistiques.</p>
            </>
          ) : (
            <>
              <p>Ta collection est vide pour l'instant.</p>
              <p className="muted">Ajoute des jeux : les statistiques apparaîtront ici.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  const fmt1 = (n) => (n != null ? n.toFixed(1) : '—')

  return (
    <div className="stats">
      {anecEl}
      {tierBtn}
      <div className="stat-tiles">
        <Tile value={s.total} label={s.total > 1 ? 'jeux en collection' : 'jeu en collection'} />
        <Tile value={s.wishlistCount} label="en wishlist" />
        <Tile
          value={s.avgDuration != null ? `${s.avgDuration} min` : '—'}
          label="durée moyenne"
          sub={s.medDuration != null ? `médiane ${s.medDuration} min` : null}
        />
        <Tile
          value={
            s.avgComplexity == null ? (
              '—'
            ) : (
              <>
                {fmt1(s.avgComplexity)} <span className="tile-word">{complexityWord(s.avgComplexity)}</span>
              </>
            )
          }
          label="complexité moyenne"
          sub={s.medComplexity != null ? `médiane ${fmt1(s.medComplexity)}` : null}
        />
      </div>

      <BarBlock
        title="Par nombre de joueurs"
        color={PLAYERS_COLOR}
        empty="Aucune donnée de joueurs."
        rows={s.byPlayers.map((r) => ({ key: r.n, label: r.label, count: r.count }))}
        onPick={onFilter ? (r) => onFilter({ players: [r.key], playerOptimal: false }, `${r.label} joueurs`) : undefined}
      />

      <BarBlock
        title="Par nombre de joueurs idéal"
        color={OPTIMAL_COLOR}
        empty="Aucun nombre idéal renseigné."
        rows={s.byOptimalPlayers.map((r) => ({ key: r.n, label: r.label, count: r.count }))}
        onPick={onFilter ? (r) => onFilter({ players: [r.key], playerOptimal: true }, `${r.label} joueurs (idéal)`) : undefined}
      />

      <BarBlock
        title="Par durée"
        color={DURATION_COLOR}
        empty="Aucune durée renseignée."
        rows={s.byDuration.map((r) => ({ key: r.label, label: r.label, count: r.count }))}
      />

      <BarBlock
        title="Par complexité"
        color={COMPLEXITY_COLOR}
        empty="Aucune complexité renseignée."
        rows={s.byComplexity.map((r) => ({ key: r.label, label: r.label, sub: r.hint, count: r.count, bucket: CX_LABEL_TO_BUCKET[r.label] }))}
        onPick={onFilter ? (r) => onFilter({ complexity: [r.bucket] }, r.label) : undefined}
      />

      {/* Séparateur : au-dessus les stats sur les JEUX, en dessous les stats sur les JOUEURS. */}
      {(playerOverall || []).length > 0 && (
        <div className="stats-divider">
          <span>Joueurs</span>
        </div>
      )}
      <PlayerSection playerOverall={playerOverall} />
    </div>
  )
}
