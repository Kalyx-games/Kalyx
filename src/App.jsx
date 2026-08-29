import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from 'react'
import lazyRetry from './lib/lazyRetry'
import { isConfigured, hasCode } from './lib/supabase'
import { fetchGames, addGame, updateGame, deleteGame, cleanGameInput, parseOwners, parseTags } from './lib/games'
import { saveGamesCache, loadGamesCache, saveBubblesCache, loadBubblesCache } from './lib/cache'
import { fetchOwners, addOwner, updateOwner, renameOwner, deleteOwner } from './lib/owners'
import { fetchTags, addTag, updateTag, renameTag, deleteTag } from './lib/tags'
import { downloadBackup, downloadCsv, parseBackup, importBackup, fetchBackups, createBackup, maybeAutoBackup, restoreBackup, restorePreview } from './lib/backup'
import { philibertSearchUrl } from './lib/philibert'
import { EMPTY_FILTERS, PRICE_MIN, PRICE_MAX, norm, passesFilters } from './lib/filtering'
import { messageUtilisateur } from './lib/messages'
import { faitNotable } from './lib/faits'
import { lettreDe, useLettreDefilement } from './lib/lettre'
import { DEMO_TOTAL } from './lib/glisseAction'
import Ascenseur from './components/Ascenseur'
import { useExitLayer } from './lib/useExitLayer'
import { fetchScoresheets, saveScoresheet } from './lib/scoresheets'
import { fetchTierlists, upsertTierlist, deleteTierlist, computeGlobalTierlist, computeAnecdoteList, emptyRanking, dedupeByName, repIdMap, remapRanking, verdictDeLaTable } from './lib/tierlists'
import { buildAnecdotes, anecdoteDuJour } from './lib/anecdotes'
import { fetchPlays, fetchAllPlays, savePlay, updatePlay, deletePlay, fetchPlayerNames, fetchPlayMeta, renameCategories, fetchPlayerRoster, fetchPlayerOverall, renamePlayer } from './lib/plays'
import GameCard from './components/GameCard'
import GameForm from './components/GameForm'
import GameDetail from './components/GameDetail'
import Filters from './components/Filters'
import ConfirmDialog from './components/ConfirmDialog'
import SortMenu from './components/SortMenu'
import FilterSheet from './components/FilterSheet'
import ImageZoom from './components/ImageZoom'
import CodeDialog from './components/CodeDialog'
import ChangeCodeDialog from './components/ChangeCodeDialog'
// Écrans lourds ou rarement ouverts : chargés à la demande (allège le bundle de départ).
// lazyRetry : recharge la page si un morceau échoue à se télécharger (ancien chunk après
// déploiement) → plus d'écran blanc « définitif » en changeant d'onglet.
const Settings = lazyRetry(() => import('./components/Settings'))
const PlayersManager = lazyRetry(() => import('./components/PlayersManager'))
const Stats = lazyRetry(() => import('./components/Stats'))
const Chwazi = lazyRetry(() => import('./components/Chwazi'))
const ScoreSheet = lazyRetry(() => import('./components/ScoreSheet'))
const ScoreSheetEditor = lazyRetry(() => import('./components/ScoreSheetEditor'))
const GameHistory = lazyRetry(() => import('./components/GameHistory'))
const TierlistHub = lazyRetry(() => import('./components/TierlistHub'))
const TierlistView = lazyRetry(() => import('./components/TierlistView'))
import SkeletonCard from './components/SkeletonCard'
import GameTile from './components/GameTile'
import { enterFullscreen } from './lib/fullscreen'
import NavBar from './components/NavBar'
import EcranComptes from './components/EcranComptes'
import EcranCompte from './components/EcranCompte'
import Avatar from './components/Avatar'
import { SettingsIcon, ChwaziIcon, FilterIcon, PlusIcon, ClockIcon, DieIcon, CheckIcon, CrownIcon, GridIcon, ListIcon, PlayersIcon } from './components/icons'


// Le filtre propriétaire est PERSISTANT (un seul propriétaire regarde en général ses
// jeux) : on le mémorise dans le navigateur pour ne pas le reperdre à chaque ouverture.
const OWNER_FILTER_KEY = 'kalyx-owner-filter'
function loadOwnerFilter() {
  try {
    const arr = JSON.parse(localStorage.getItem(OWNER_FILTER_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
// Le COMPTE choisi à l'écran de démarrage. Distinct du filtre : le filtre dit ce qu'on
// regarde en ce moment (il change au gré des envies), le compte dit qui on est — et sa
// simple PRÉSENCE, même vide, signifie « le choix a déjà été fait, ne plus demander ».
const COMPTE_KEY = 'kalyx-compte'
// En dessous de ce nombre d anecdotes disponibles, on se TAIT : le parcours ne vaut que
// parce qu il ne se répète pas. En pratique les anecdotes de tierlists (communes à tous les
// comptes) suffisent à passer le seuil ; le filet ne sert que si personne n a fait de
// tierlist ET que le compte est tout neuf — là, la poignée de phrases restantes
// reviendrait tous les deux jours, ce qui les déclasse en bruit.
const ANEC_MIN = 10
function loadCompte() {
  try {
    const v = localStorage.getItem(COMPTE_KEY)
    return v === null ? undefined : JSON.parse(v) // undefined = jamais choisi
  } catch {
    return undefined
  }
}
function saveCompte(nom) {
  try {
    localStorage.setItem(COMPTE_KEY, JSON.stringify(nom ?? null))
  } catch {
    /* stockage indispo : tant pis */
  }
}
// ⚠️ LA LIGNE COMPLÈTE DU COMPTE ACTIF (initiales choisies, couleur, avatar), mémorisée en
// LOCAL — donc lisible dès la PREMIÈRE image, contrairement à la table `owners` qui arrive
// du cache IndexedDB puis du réseau, toujours de façon asynchrone.
// Sans elle, l'avatar de la barre du haut retombait quelques centaines de millisecondes sur
// des initiales CALCULÉES (les deux premières lettres du nom) et une couleur calculée : au
// rechargement, on voyait « CL » scintiller — le même « CL » pour « Claire & Nazim » et
// « Clémence & Mathieu », et l'emoji ou la jaquette choisis n'apparaissaient pas du tout.
// Une valeur périmée (avatar changé sur un autre appareil) est écrasée dès que la table
// arrive : le pire cas est une image juste, brièvement.
const COMPTE_VUE_KEY = 'kalyx-compte-vue'
function loadCompteVue() {
  try {
    const v = localStorage.getItem(COMPTE_VUE_KEY)
    const o = v ? JSON.parse(v) : null
    return o && o.name ? o : null
  } catch {
    return null
  }
}
function saveCompteVue(ligne) {
  try {
    if (ligne && ligne.name) localStorage.setItem(COMPTE_VUE_KEY, JSON.stringify(ligne))
    else localStorage.removeItem(COMPTE_VUE_KEY)
  } catch {
    /* stockage indispo : on retombera sur les initiales calculées, comme avant */
  }
}

function saveOwnerFilter(arr) {
  try {
    localStorage.setItem(OWNER_FILTER_KEY, JSON.stringify(arr || []))
  } catch {
    /* stockage indispo : tant pis */
  }
}

// On mémorise l'onglet courant (stats/collection/wishlist) pour y rester après une actualisation.
const VIEW_KEY = 'kalyx-view'
function loadView() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'wishlist' || v === 'stats' ? v : 'collection'
  } catch {
    return 'collection'
  }
}
function saveView(v) {
  try {
    if (v === 'collection' || v === 'wishlist' || v === 'stats') localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* stockage indispo : tant pis */
  }
}

// RAPPEL DU GESTE. Le glissé n'a aucune affordance permanente : on finit par oublier qu'il
// existe, et surtout qu'il marche des DEUX côtés. Une fois par mois, à l'ouverture, la
// première carte fait un aller-retour — assez pour rappeler, trop court pour agacer.
// ⚠️ Ce n'est PLUS une animation CSS : la démonstration écrit `offset` et `sens` par le chemin
// du doigt (`lib/glisseAction.js`), donc le VRAI fond révélé apparaît dessous, avec sa couleur
// et son icône, en vue liste comme en vue grille.
const RAPPEL_KEY = 'kalyx-rappel-glisse'
const RAPPEL_DELAI = 30 * 24 * 3600 * 1000
function rappelDu() {
  try {
    const v = Number(localStorage.getItem(RAPPEL_KEY))
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}
function noteRappel(t) {
  try {
    localStorage.setItem(RAPPEL_KEY, String(t))
  } catch {
    /* stockage indispo : tant pis, on ne rappellera pas */
  }
}
// Réarme le rappel : il rejouera dès qu'une liste sera de nouveau à l'écran. Branché sur
// « Vérifier les mises à jour » des Réglages — le seul bouton qu'on tape en voulant vérifier
// que l'app va bien, donc l'endroit naturel pour revoir l'animation à volonté.
function reArmeRappel() {
  try {
    localStorage.removeItem(RAPPEL_KEY)
  } catch {
    /* stockage indispo : rien à réarmer */
  }
}

// ⚠️ UNE PRÉFÉRENCE PAR ONGLET : on ne regarde pas sa collection et sa wishlist de la même
// façon (l'une se parcourt à la jaquette, l'autre se lit au prix). Passer la collection en
// grille ne doit donc pas basculer la wishlist, ni l'inverse.
const LAYOUT_KEY = 'kalyx-layout' // collection (nom historique : la clé existante est conservée)
const LAYOUT_KEY_WISH = 'kalyx-layout-wishlist'
const cleLayout = (statut) => (statut === 'wishlist' ? LAYOUT_KEY_WISH : LAYOUT_KEY)
function loadLayout(statut) {
  try {
    return localStorage.getItem(cleLayout(statut)) === 'grille' ? 'grille' : 'liste'
  } catch {
    return 'liste'
  }
}
function saveLayout(statut, v) {
  try {
    if (v === 'liste' || v === 'grille') localStorage.setItem(cleLayout(statut), v)
  } catch {
    /* stockage indispo : tant pis */
  }
}

// Écran ouvert par-dessus l'onglet (fiche jeu / historique / réglages / joueurs / hub tierlists),
// mémorisé pour revenir dessus après une actualisation. On NE mémorise PAS les formulaires en cours
// de saisie (nouvelle partie, édition…) : leur contenu non enregistré serait perdu de toute façon.
const PAGE_KEY = 'kalyx-page'
function loadPage() {
  try {
    const raw = localStorage.getItem(PAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function savePage(p) {
  try {
    const empty = !p.detail && !p.history && !p.settings && !p.players && !p.tierlistHub
    if (empty) localStorage.removeItem(PAGE_KEY)
    else localStorage.setItem(PAGE_KEY, JSON.stringify(p))
  } catch {
    /* stockage indispo : tant pis */
  }
}

// Fréquence de la sauvegarde automatique (mémorisée dans le navigateur).
const BACKUP_FREQ_KEY = 'kalyx-backup-freq'
function loadBackupFreq() {
  try {
    return localStorage.getItem(BACKUP_FREQ_KEY) || 'daily'
  } catch {
    return 'daily'
  }
}
function saveBackupFreq(v) {
  try {
    localStorage.setItem(BACKUP_FREQ_KEY, v)
  } catch {
    /* ignore */
  }
}


// Rang pseudo-aléatoire STABLE d'un jeu pour une graine donnée (hachage FNV-1a de
// id + graine → nombre dans [0,1)). Trier par ce rang donne un ordre "aléatoire" qui
// ne change QUE quand la graine change (= quand on reclique sur "Aléatoire"), et qui
// reste stable quand on tape dans la recherche ou qu'on filtre.
function shuffleRank(id, seed) {
  const s = String(id) + ':' + seed
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

// Date courte « 12 juil. 2026 » pour la ligne d'info des cartes.
// L'étiquette que porte l'ascenseur pour UN jeu, selon le tri en cours — l'évolution du
// critère, pas autre chose. `null` pour tout le tri = pas d'étiquette affichable (aléatoire) :
// l'ascenseur reste, nu.
function etiquetteDeTri(sort, playMeta) {
  switch (sort) {
    case 'name':
      return (g) => lettreDe(g.name)
    case 'duration':
      return (g) => {
        const d = g.duration_max ?? g.duration_min
        if (!d) return '—'
        if (d < 60) return `${d} min`
        const h = Math.floor(d / 60)
        const m = d % 60
        return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
      }
    case 'complexity':
      // Le MOT, pas le chiffre : trois groupes lisibles, comme partout ailleurs dans l'app.
      return (g) => (g.complexity == null ? '—' : g.complexity < 2 ? 'Simple' : g.complexity < 3 ? 'Moyen' : 'Corsé')
    case 'players':
      return (g) => (g.players_min ? `${g.players_min} j` : '—')
    case 'plays':
      return (g) => String(playMeta[g.id]?.count || 0)
    case 'lastplayed':
      // Le MOIS : le bon grain pour se situer — un groupe par jour en ferait un par carte.
      return (g) => {
        const iso = playMeta[g.id]?.last
        if (!iso) return '—'
        const d = new Date(iso)
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
      }
    case 'price':
      return (g) => (g.price != null ? `${g.price} €` : '—')
    default:
      return null // aléatoire : rien d'affichable
  }
}

function formatDay(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Nom' },
  { value: 'random', label: 'Aléatoire' },
  { value: 'players', label: 'Joueurs' },
  { value: 'complexity', label: 'Complexité' },
  { value: 'duration', label: 'Durée' },
]

// Type de chargement : « reload » = actualisation (pull-to-refresh / F5) → on restaure l'écran ouvert
// (cf. loadPage). Sinon (DÉMARRAGE À FROID : Kalyx fermée puis rouverte) → on repart PROPREMENT en haut
// de la Collection, comme demandé (« quitter et revenir »). Défaut prudent : cold start si type inconnu.
const isReload = (() => {
  try {
    const nav = performance.getEntriesByType('navigation')[0]
    return !!nav && nav.type === 'reload'
  } catch {
    return false
  }
})()

export default function App() {
  const [games, setGames] = useState(null) // null = en cours de chargement
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  // Sécurité : cet appareil est-il autorisé à écrire (code d'accès saisi une fois) ?
  const [authorized, setAuthorized] = useState(hasCode())
  const [codeAsk, setCodeAsk] = useState(false) // fenêtre de saisie du code ouverte ?
  const [codeChange, setCodeChange] = useState(false) // fenêtre de CHANGEMENT du code ouverte ?
  const codeDismissedRef = useRef(false) // "Plus tard" cliqué → ne pas re-proposer tout seul
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name')
  const [shuffleSeed, setShuffleSeed] = useState(0) // change à chaque clic sur "Aléatoire"
  const [sortDir, setSortDir] = useState('asc') // 'asc' = croissant, 'desc' = décroissant
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, owners: loadOwnerFilter() }))
  // On mémorise le filtre propriétaire à chaque changement (persistant entre les sessions).
  useEffect(() => {
    saveOwnerFilter(filters.owners)
  }, [filters.owners])
  const [editing, setEditing] = useState(null) // null | 'new' | objet jeu
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null) // jeu à supprimer | null
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [moving, setMoving] = useState(null) // jeu à transférer vers la collection | null
  const [movingBusy, setMovingBusy] = useState(false)
  // Au démarrage à froid, on ignore l'onglet mémorisé → on repart sur la Collection (cf. isReload).
  const savedView = isReload ? loadView() : 'collection'
  // Deux préférences distinctes, relues quand on change d'onglet.
  const [layouts, setLayouts] = useState(() => ({ collection: loadLayout('collection'), wishlist: loadLayout('wishlist') }))
  const [view, setView] = useState(savedView === 'wishlist' ? 'wishlist' : 'collection') // 'collection' | 'wishlist'
  const [settingsOpen, setSettingsOpen] = useState(false) // écran Réglages (engrenage en haut à droite)
  const [playersOpen, setPlayersOpen] = useState(false) // écran Joueurs (renommage global)
  const [playerRoster, setPlayerRoster] = useState(null) // [{name, games}] | null = en cours
  const [renamingPlayer, setRenamingPlayer] = useState(false)
  const [statsOpen, setStatsOpen] = useState(savedView === 'stats') // écran Stats
  const [playerOverall, setPlayerOverall] = useState(null) // [{name, games, wins, winRate}] tous jeux | null
  // ⚠️ null = PAS ENCORE CONNU (≠ [] qui AFFIRMERAIT « aucune partie n'a jamais été jouée »).
  const [allPlays, setAllPlays] = useState(null) // toutes les parties — matière des anecdotes
  const [tierlistsLues, setTierlistsLues] = useState(false) // répondu, même par un échec
  // Tierlists : menu (hub) + écran d'une tierlist (view/edit/global).
  const [tierlistHub, setTierlistHub] = useState(false)
  const [tierlists, setTierlists] = useState(null) // [{id,player,ranking,updated_at}] | null (table absente/pas chargé)
  const [tierlistView, setTierlistView] = useState(null) // { mode, title, ranking, unranked, player, id } | null
  // On mémorise l'onglet (stats/collection/wishlist) pour y revenir après une actualisation.
  useEffect(() => {
    saveView(statsOpen ? 'stats' : view)
  }, [view, statsOpen])
  // Stats générales par joueur (toutes parties) : (re)chargées quand on ouvre l'onglet Stats.
  // On passe les jeux déjà en mémoire → évite de re-télécharger la liste à chaque visite.
  useEffect(() => {
    if (!statsOpen) return
    // Les parties nourrissent À LA FOIS les anecdotes et le bilan par joueur : on ne lit
    // la table qu'UNE fois, et le bilan se calcule sur ces mêmes lignes.
    fetchAllPlays()
      .then((ps) => {
        setAllPlays(ps)
        return fetchPlayerOverall(games, ps)
      })
      // Hors ligne, on laisse « inconnu » : mieux vaut pas d'anecdote qu'une anecdote fausse.
      .catch(() => { setAllPlays(null); return fetchPlayerOverall(games).catch(() => []) })
      .then(setPlayerOverall)
      .catch(() => setPlayerOverall([]))
    // Les tierlists alimentent l'anecdote du jour affichée en haut des Stats → on les charge
    // à l'ouverture de l'onglet (et pas seulement en ouvrant le hub Tierlists).
    fetchTierlists().then(setTierlists).catch(() => setTierlists(null)).finally(() => setTierlistsLues(true))
    // volontairement pas de dépendance sur `games` : on ne veut recharger qu'à l'ouverture
    // de l'onglet, pas à chaque modification de la collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsOpen])
  const [chwaziOpen, setChwaziOpen] = useState(false) // écran Chwazi plein écran (onglet à droite)
  const [confirmingOwner, setConfirmingOwner] = useState(null) // propriétaire à supprimer | null
  const [deletingOwnerBusy, setDeletingOwnerBusy] = useState(false)
  const [confirmingTag, setConfirmingTag] = useState(null) // tag à supprimer | null
  const [deletingTagBusy, setDeletingTagBusy] = useState(false)
  const [importing, setImporting] = useState(null) // sauvegarde à confirmer | null
  const [importBusy, setImportBusy] = useState(false)
  const [toast, setToast] = useState(null) // { texte, fait } | null — confirmation éphémère
  const toastTimer = useRef(null)
  // Affiche un toast qui disparaît tout seul (visible même par-dessus les overlays).
  // `opts.fait` = { titre, sous } : le toast passe alors à deux niveaux et dure plus longtemps.
  const showToast = useCallback((msg, opts) => {
    setToast(msg ? { texte: msg, fait: opts?.fait || null } : null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (msg) toastTimer.current = setTimeout(() => setToast(null), opts?.ms || 2800)
  }, [])
  // Le fait notable de la DERNIÈRE partie enregistrée. Mémoire de session : rien n'est écrit
  // nulle part. Un fait est une nouvelle — une nouvelle qu'on relit une semaine plus tard n'en
  // est plus une, et la persister obligerait à une colonne en base ou à un localStorage qui
  // mentirait dès qu'on change d'appareil.
  const [dernierFait, setDernierFait] = useState(null) // { gameId, titre, sous } | null
  // Un seul fait par jeu et par jour : Map(game_id → 'AAAA-M-J'), jamais persistée non plus.
  const faitsDuJourRef = useRef(new Map())
  // Sauvegardes automatiques (table `backups` Supabase)
  const [backupFreq, setBackupFreq] = useState(loadBackupFreq)
  const [backupsList, setBackupsList] = useState(null) // liste des sauvegardes, ou null si table absente
  const [restoring, setRestoring] = useState(null) // sauvegarde à restaurer (confirmation) | null
  const [restorePlan, setRestorePlan] = useState(null) // ce que la restauration détruirait | null = en cours
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const autoBackupRef = useRef(false) // pour ne lancer la sauvegarde auto qu'une fois par chargement
  const [zoomImage, setZoomImage] = useState(null) // image affichée en grand (lightbox)
  const [ownersList, setOwnersList] = useState(null) // lignes de la table owners, ou null si absente
  const [tagsList, setTagsList] = useState(null) // lignes de la table tags, ou null si absente
  // « chargé » = le fetch a répondu (même si null car table absente). Sert de signal fiable
  // à la sauvegarde auto : sinon, table owners/tags absente → liste null pour toujours → la
  // sauvegarde auto ne se déclencherait JAMAIS (null = « en cours » ET « absente » sans ça).
  const [ownersLoaded, setOwnersLoaded] = useState(false)
  const [compte, setCompte] = useState(loadCompte) // nom du compte actif | null (aucun) | undefined (jamais choisi)
  const [compteVue] = useState(loadCompteVue) // sa ligne complète, telle qu'on l'a vue la dernière fois
  const [choixCompte, setChoixCompte] = useState(false) // écran des avatars rouvert volontairement
  const [rappelGlisse, setRappelGlisse] = useState(false) // piqûre de rappel du geste (1×/mois)
  const [compteOuvert, setCompteOuvert] = useState(false) // menu Compte (barre du haut)
  const [ajoutCompte, setAjoutCompte] = useState(false) // formulaire de création d'un compte
  const [tagsLoaded, setTagsLoaded] = useState(false)
  const [scoresheets, setScoresheets] = useState(null) // { game_id: template }, ou null si table absente
  const [scoringGame, setScoringGame] = useState(null) // jeu en cours de notation (nouvelle partie OU édition) | null
  const [scoreExitConfirm, setScoreExitConfirm] = useState(false) // confirmation « quitter la saisie ? » (garde anti-perte)
  const scoringDirtyRef = useRef(false) // la saisie en cours a-t-elle du contenu non enregistré ? (rapporté par ScoreSheet)
  const [sheetExitConfirm, setSheetExitConfirm] = useState(false) // même garde, pour l'éditeur de fiche
  const sheetDirtyRef = useRef(false) // la fiche en cours d'édition a-t-elle changé ? (rapporté par ScoreSheetEditor)
  // ⚠️ L'éditeur n'avait AUCUNE garde : la flèche et « Annuler » fermaient sec, tout était
  // perdu sans un mot — alors que la saisie d'une partie, elle, demande confirmation depuis
  // longtemps. Et replier des sections rend la perte plus facile encore : on ne voit plus ce
  // qu'on a saisi.
  const intentionFicheRef = useRef(null) // ce qu'on VOULAIT faire quand l'éditeur s'est interposé
  const [editingPlay, setEditingPlay] = useState(null) // partie en cours d'édition | null (= nouvelle partie)
  const [editingSheet, setEditingSheet] = useState(null) // jeu dont on édite/crée la fiche | null
  const [historyGame, setHistoryGame] = useState(null) // jeu dont on regarde l'historique | null
  const [detailGame, setDetailGame] = useState(null) // jeu dont on affiche la « fiche jeu » | null
  const [gamePlays, setGamePlays] = useState(null) // parties du jeu affiché (null = chargement)
  const [historyView, setHistoryView] = useState('stats') // 'stats' (écran Statistiques) | 'plays' (écran Historique)
  const [playerNames, setPlayerNames] = useState([]) // noms déjà utilisés (auto-complétion)
  const [playMeta, setPlayMeta] = useState({}) // { game_id: { count, last } } (tris + cartes)
  const [savingPlay, setSavingPlay] = useState(false)
  const [confirmingPlay, setConfirmingPlay] = useState(null) // partie à supprimer | null
  const [confirmingTierlist, setConfirmingTierlist] = useState(false) // suppression tierlist en attente

  // Charger les listes gérées (tables owners + tags + fiches de score).
  // ⚠️ Comptes et tags passent par le CACHE, comme les jeux : hors ligne, `fetchOwners`
  // renvoie null et l'app perdait initiales et couleurs (recalculées, avec des collisions
  // entre prénoms proches). Le cache n'est peuplé que par un chargement RÉUSSI, donc il ne
  // masque jamais une table réellement absente : il ne sert que de repli.
  // Choisir un compte pose le filtre par propriétaire — le mécanisme persistant qui
  // existe déjà. « Toute la collection » (null) vide le filtre au lieu d'en poser un.
  const choisirCompte = useCallback((nom) => {
    setCompte(nom ?? null)
    saveCompte(nom ?? null)
    setFilters((f) => ({ ...f, owners: nom ? [nom] : [] }))
    setChoixCompte(false)
    // Choisir CONCLUT le geste : on veut voir la collection du compte, pas retomber sur le
    // menu d où l on venait. (Fermer deux couches d un coup est sûr depuis que la traversée
    // d historique n incrémente plus le compteur de popstate que de 1.)
    setCompteOuvert(false)
    setAjoutCompte(false)
    window.scrollTo(0, 0)
  }, [])

  const reloadOwners = useCallback(() => {
    fetchOwners().then((v) => {
      if (v) {
        setOwnersList(v)
        saveBubblesCache('owners', v)
      } else {
        loadBubblesCache('owners').then((c) => setOwnersList(c.length ? c : null))
      }
      setOwnersLoaded(true)
    })
  }, [])
  const reloadTags = useCallback(() => {
    fetchTags().then((v) => {
      if (v) {
        setTagsList(v)
        saveBubblesCache('tags', v)
      } else {
        loadBubblesCache('tags').then((c) => setTagsList(c.length ? c : null))
      }
      setTagsLoaded(true)
    })
  }, [])
  useEffect(() => {
    reloadOwners()
    reloadTags()
    fetchScoresheets().then(setScoresheets).catch(() => setScoresheets(null))
    fetchPlayerNames().then(setPlayerNames).catch(() => {})
    fetchPlayMeta().then(setPlayMeta).catch(() => {})
  }, [reloadOwners, reloadTags])

  // Charge les jeux : depuis Supabase si possible (et on met en cache), sinon
  // depuis le cache local (hors ligne). Pas de message d'erreur technique.
  const loadGames = useCallback(() => {
    if (!isConfigured) {
      setError("La base n'est pas configurée sur cet hébergement.")
      setGames([])
      return
    }
    fetchGames()
      .then((data) => {
        setGames(data)
        setError(null)
        saveGamesCache(data)
      })
      .catch(async () => {
        const cached = await loadGamesCache()
        setGames(cached || [])
        // On n'affiche une erreur que si on est en ligne ET sans rien à montrer.
        if ((!cached || cached.length === 0) && navigator.onLine) {
          setError('Impossible de charger les jeux. Réessayez.')
        } else {
          setError(null)
        }
      })
  }, [])

  useEffect(() => {
    loadGames()
  }, [loadGames])

  // Suivre l'état de la connexion, et resynchroniser au retour en ligne.
  useEffect(() => {
    const up = () => {
      setOnline(true)
      loadGames()
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [loadGames])

  // Bouton "retour" du téléphone. À chaque appui, on ferme UNE SEULE couche, de la
  // plus haute à la plus basse (fenêtre → onglet ouvert → vue précédente). L'app ne
  // se ferme jamais : on remet toujours une entrée d'historique "piège".
  const viewHistoryRef = useRef([]) // vues précédentes (pour revenir en arrière)
  // Fermetures ANIMÉES exposées par les feuilles à poignée (formulaire, menu de filtres) : le bouton
  // retour Android passe par elles pour fermer AVEC l'animation (glissé vers le bas) au lieu de couper net.
  const formCloseRef = useRef(null)
  const filterCloseRef = useRef(null)
  const uiRef = useRef({})
  uiRef.current = { choixCompte, codeAsk, codeChange, compteOuvert, editing, confirming, confirmingOwner, confirmingTag, moving, importing, restoring, confirmingPlay, confirmingTierlist, scoreExitConfirm, sheetExitConfirm, showFilters, chwaziOpen, editingSheet, scoringGame, historyGame, detailGame, tierlistView, tierlistHub, statsOpen, playersOpen, settingsOpen, zoomImage }
  const viewRef = useRef(view)
  viewRef.current = view

  // ═══ Bouton « retour » Android (PWA installée) — modèle FIABLE ═══
  // Recherche confirmée : Chrome IGNORE au « retour » toute entrée pushState créée SANS activation
  // utilisateur (« intervention anti-piégeage »). Donc on NE re-pousse JAMAIS une sentinelle dans le
  // handler de retour (elle serait sautée → sortie de l'app). À la place : UNE entrée d'historique par
  // couche ouverte, poussée dans l'effet qui SUIT le tap d'ouverture (l'activation utilisateur est
  // encore « fraîche » → entrée respectée) ; chaque retour ferme UNE couche ; l'historique reste
  // équilibré (1 ouverture = 1 entrée = 1 retour). À la racine, le retour laisse quitter (normal Android).
  // scoreExitConfirm est un garde ANTI-PERTE, pas une vraie couche : on l'EXCLUT du compte (il ne
  // s'ouvre pas sur un tap mais EN RÉPONSE À UN RETOUR — il ne peut donc pas pousser d'entrée fiable).
  // Les entrées que ces retours consomment sont comptées comme une DETTE et remboursées au premier
  // geste de l'utilisateur (voir detteRef / armeRemboursement plus bas).
  const layerCount = Object.entries(uiRef.current).filter(([k, v]) => v && k !== 'scoreExitConfirm' && k !== 'sheetExitConfirm').length
  const depthRef = useRef(0) // nb d'entrées d'historique poussées pour les couches ouvertes
  const ignoreBackRef = useRef(0) // popstate synthétiques (resynchro) à ignorer
  const backClosingRef = useRef(false) // la baisse de layerCount en cours vient d'un « retour »
  // ⚠️ DETTE D'ENTRÉES. Un « retour » consomme TOUJOURS une entrée d'historique, même quand il ne
  // ferme aucune couche — c'est le cas du garde anti-perte (l'ouvrir, puis le refermer). L'ancien
  // drapeau booléen ne savait compter qu'UNE entrée : deux retours d'affilée en perdaient deux, et
  // le troisième quittait l'app AVEC LA SAISIE EN COURS — exactement ce que le garde existe pour
  // empêcher. On COMPTE donc les entrées dues, et on les rembourse.
  const detteRef = useRef(0)
  const remboursementArmeRef = useRef(false)

  // Rembourse les entrées dues. ⚠️ UNIQUEMENT sur un geste utilisateur : un pushState sans activation
  // est marqué « skippable » par Chrome et sauté au retour suivant (cf. le bloc ci-dessus) — il ne
  // protégerait donc rien. Or l'utilisateur qui voit le garde va toucher l'écran pour répondre : c'est
  // là qu'on restaure la profondeur perdue, avant qu'un second retour ne puisse faire sortir de l'app.
  const armeRemboursement = useCallback(() => {
    if (remboursementArmeRef.current) return
    remboursementArmeRef.current = true
    const rembourse = () => {
      window.removeEventListener('pointerdown', rembourse, true)
      window.removeEventListener('keydown', rembourse, true)
      remboursementArmeRef.current = false
      while (detteRef.current > 0) {
        detteRef.current--
        window.history.pushState({ kalyx: 'layer' }, '')
      }
    }
    window.addEventListener('pointerdown', rembourse, true)
    window.addEventListener('keydown', rembourse, true)
  }, [])

  // Synchronise le nb d'entrées d'historique avec le nb de couches ouvertes.
  useEffect(() => {
    const diff = layerCount - depthRef.current
    depthRef.current = layerCount
    if (diff > 0) {
      // Couche ouverte → 1 entrée par couche (l'effet suit le tap → activation présente).
      for (let i = 0; i < diff; i++) window.history.pushState({ kalyx: 'layer' }, '')
    } else if (diff < 0 && !backClosingRef.current) {
      // Couche fermée par un BOUTON (pas par « retour ») → consomme l'entrée orpheline pour rester équilibré.
      // On PAYE D'ABORD AVEC LA DETTE : ces entrées-là ont déjà été consommées par un « retour »
      // stérile, il ne faut pas les consommer une seconde fois.
      let du = -diff
      const parDette = Math.min(detteRef.current, du)
      detteRef.current -= parDette
      du -= parDette
      if (du > 0) {
        // ⚠️⚠️ +1 ET NON +du : `history.go(-N)` recule bien de N entrées mais n'émet qu'UN SEUL
        // popstate (mesuré : go(-2) → 1 popstate, état passé de {t:3} à {t:1}). Compter N ignorés
        // laissait un popstate fantôme À VIE : le retour suivant était avalé, puis celui d'après
        // quittait l'app avec un écran ouvert.
        ignoreBackRef.current += 1
        window.history.go(-du)
      }
    }
    backClosingRef.current = false
  }, [layerCount])

  // Change de vue en mémorisant la vue actuelle (pour le retour). Pousse 1 entrée (on est dans le tap
  // de la barre de navigation → activation présente → entrée respectée par Chrome).
  const goToView = useCallback((v) => {
    if (v === viewRef.current) return
    viewHistoryRef.current.push(viewRef.current)
    window.history.pushState({ kalyx: 'view' }, '')
    setView(v)
  }, [])

  // Ferme la couche du dessus (ordre de priorité). Renvoie true si quelque chose a été fermé.
  // Fermeture d'une saisie de partie : si elle est EN COURS (contenu non enregistré), on demande
  // confirmation au lieu de fermer — pour ne rien perdre. Sinon on ferme directement. Appelé aussi
  // bien par le bouton ← (dans ScoreSheet) que par le bouton RETOUR d'Android (via closeTopLayer).
  const requestCloseScoring = useCallback(() => {
    if (scoringDirtyRef.current) setScoreExitConfirm(true)
    else setScoringGame(null)
  }, [])

  // Même chose pour l'éditeur de fiche. ⚠️ L'intention en attente (« je voulais noter une
  // partie ») est abandonnée : renoncer à la fiche, c'est renoncer à ce qu'elle permettait.
  const requestCloseSheet = useCallback(() => {
    if (sheetDirtyRef.current) setSheetExitConfirm(true)
    else { intentionFicheRef.current = null; setEditingSheet(null) }
  }, [])

  const closeTopLayer = useCallback(() => {
    const s = uiRef.current
    // ⚠️ L'écran des avatars REMPLACE tout le rendu (return anticipé) : rien ne peut être
    // au-dessus de lui, il se ferme donc en PREMIER. Il n'est une couche que lorsqu'il a été
    // rouvert VOLONTAIREMENT (choixCompte) — au tout premier lancement il n'y a rien derrière
    // où revenir, et aucun tap ne l'a ouvert, donc aucune entrée fiable à pousser.
    if (s.choixCompte) setChoixCompte(false)
    // L'image en grand est au-dessus de tout → on la ferme en premier.
    else if (s.zoomImage) setZoomImage(null)
    // Les fenêtres de code sont rendues APRÈS les confirmations, à z-index égal → elles sont
    // au-dessus. Sans branche ici, le retour fermait l'écran DERRIÈRE le voile (les Réglages),
    // laissant la fenêtre seule à l'écran, puis quittait l'app.
    // ⚠️ `codeAsk` peut aussi s'ouvrir TOUT SEUL au 1er lancement (effet, sans tap) : Chrome saute
    // alors l'entrée poussée. Ce n'est pas une régression — sans couche, ce retour quittait déjà
    // l'app. Ouverte par un tap (Réglages → Autoriser), elle se ferme correctement.
    else if (s.codeAsk) { codeDismissedRef.current = true; setCodeAsk(false) }
    else if (s.codeChange) setCodeChange(false)
    // Les confirmations s'ouvrent PAR-DESSUS (form, réglages…) → on les ferme d'abord.
    else if (s.confirming) setConfirming(null)
    else if (s.moving) setMoving(null)
    else if (s.confirmingOwner) setConfirmingOwner(null)
    else if (s.confirmingTag) setConfirmingTag(null)
    else if (s.importing) setImporting(null)
    else if (s.restoring) setRestoring(null)
    else if (s.confirmingPlay) setConfirmingPlay(null)
    else if (s.confirmingTierlist) setConfirmingTierlist(false)
    else if (s.editing) { if (formCloseRef.current) formCloseRef.current(); else setEditing(null) } // ferme AVEC l'anim (glissé bas)
    else if (s.showFilters) { if (filterCloseRef.current) filterCloseRef.current(); else setShowFilters(false) }
    else if (s.chwaziOpen) setChwaziOpen(false)
    // Retour pendant le garde de l'éditeur → on referme le garde (on reste dans la fiche).
    else if (s.sheetExitConfirm) { setSheetExitConfirm(false); detteRef.current += 1; armeRemboursement(); return 'garde' }
    else if (s.editingSheet) {
      // Fiche MODIFIÉE → on demande au lieu de fermer. Ce retour a consommé l'entrée de
      // l'éditeur : on la note en dette, remboursée au premier geste (cf. armeRemboursement).
      if (sheetDirtyRef.current) { setSheetExitConfirm(true); detteRef.current += 1; armeRemboursement(); return 'garde' }
      intentionFicheRef.current = null
      setEditingSheet(null)
    }
    // Retour pendant le garde → on referme le garde (on reste dans la saisie). Renvoie 'garde' :
    // cette branche ne fait pas varier layerCount (cf. le handler popstate).
    else if (s.scoreExitConfirm) { setScoreExitConfirm(false); detteRef.current += 1; armeRemboursement(); return 'garde' }
    else if (s.scoringGame) {
      // Saisie EN COURS → on affiche le garde au lieu de fermer. Ce retour a consommé l'entrée de la
      // saisie ; on le note pour rééquilibrer à la résolution (Annuler = restaure ; Quitter = déjà consommée).
      if (scoringDirtyRef.current) { setScoreExitConfirm(true); detteRef.current += 1; armeRemboursement(); return 'garde' }
      setScoringGame(null)
    }

    else if (s.historyGame) setHistoryGame(null) // gamePlays idem (rechargé à l'ouverture)
    else if (s.detailGame) setDetailGame(null) // la fiche jeu : les sous-écrans (ci-dessus) se ferment d'abord
    else if (s.tierlistView) setTierlistView(null) // une tierlist s'ouvre PAR-DESSUS le menu
    else if (s.tierlistHub) setTierlistHub(false)
    // ⚠️ ORDRE = L EMPILEMENT DU RENDU, du plus haut au plus bas :
    //   compteOuvert > playersOpen > settingsOpen > statsOpen.
    // Les Stats VIVENT SOUS les écrans pleins (le menu Compte et les Réglages ne les ferment
    // plus). Les fermer en premier revenait à fermer une couche INVISIBLE : le retour ne
    // changeait rien à l écran, il fallait appuyer deux fois.
    else if (s.compteOuvert) { setCompteOuvert(false); setAjoutCompte(false) }
    else if (s.playersOpen) setPlayersOpen(false) // s'ouvre PAR-DESSUS les Réglages
    else if (s.settingsOpen) setSettingsOpen(false)
    else if (s.statsOpen) setStatsOpen(false)
    else return false
    return true
  }, [armeRemboursement])

  // Chaque « retour » ferme UNE couche (ordre de priorité) ou rejoue la vue précédente. On NE re-pousse
  // JAMAIS d'entrée ici (voir le bloc plus haut : ce serait sauté par Chrome → sortie de l'app). Quand
  // une couche est fermée, on marque `backClosingRef` pour que l'effet de synchro ne re-consomme pas
  // l'entrée (le « retour » l'a déjà consommée). À la racine (rien à fermer), on laisse quitter.
  useEffect(() => {
    const onPop = () => {
      if (ignoreBackRef.current > 0) { ignoreBackRef.current--; return } // « retour » synthétique (resynchro) → ignorer
      const ferme = closeTopLayer()
      // ⚠️ Les deux branches du GARDE anti-perte ne changent pas `layerCount` (scoreExitConfirm en
      // est exclu) → l'effet de synchro ne se rejoue pas et ne désarmerait jamais le drapeau, qui
      // ferait sauter le `go(-1)` de la prochaine vraie fermeture par bouton.
      if (ferme) { backClosingRef.current = ferme !== 'garde'; return }
      if (viewHistoryRef.current.length > 0) setView(viewHistoryRef.current.pop())
      // sinon : racine → on ne fait rien, le « retour » quitte l'app (comportement Android normal)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [closeTopLayer])

  // Restaure l'écran ouvert avant l'actualisation (fiche jeu / réglages / joueurs / hub) dès que les
  // jeux sont chargés. On marque restauré TOUT DE SUITE (→ la mémorisation repart) sans attendre
  // l'historique : celui-ci a besoin des fiches de score et est différé plus bas, pour ne jamais
  // bloquer le reste ni la mémorisation (cas table absente / hors ligne où scoresheets reste null).
  const restoredRef = useRef(false)
  const pendingHistoryRef = useRef(null)
  // `booting` = true tant qu'un écran mémorisé n'a pas été réappliqué → on masque la collection
  // pendant ce court instant (sinon flash de l'accueil avant que la fiche/l'écran ne recouvre).
  const [booting, setBooting] = useState(() => {
    if (!isReload) return false // démarrage à froid → Collection direct, pas de restauration d'écran
    const p = loadPage()
    return !!(p && (p.detail || p.history || p.settings || p.players || p.tierlistHub))
  })
  useEffect(() => {
    if (restoredRef.current || games === null) return
    restoredRef.current = true
    // On ne restaure l'écran ouvert QU'À l'actualisation ; au démarrage à froid (« quitter et revenir »)
    // on reste sur la Collection en haut.
    const page = isReload ? loadPage() : null
    // Démarrage à froid : on est reparti sur la Collection, donc l'écran mémorisé de la
    // session précédente ne vaut plus rien. Sans cet effacement il survit (l'effet de
    // mémorisation ne se rejoue pas, ses dépendances n'ayant pas bougé) et la PREMIÈRE
    // actualisation rouvrirait les Réglages qu'on vient justement de ne pas restaurer.
    if (!page) savePage({})
    if (page) {
      if (page.detail) { const g = games.find((x) => x.id === page.detail); if (g) setDetailGame(g) }
      if (page.settings) setSettingsOpen(true)
      if (page.players) { setSettingsOpen(true); handleOpenPlayers() }
      if (page.tierlistHub) handleOpenTierlists()
      if (page.history) pendingHistoryRef.current = { id: page.history, view: page.historyView || 'stats' }
    }
    // On garde `booting` (→ squelettes neutres derrière) le temps que l'écran restauré glisse en
    // place, pour ne PAS laisser apparaître la vraie collection pendant l'animation (flash évité).
    setTimeout(() => setBooting(false), 320)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games])

  // Historique différé : restauré dès que les fiches de score sont chargées (table présente). Si la
  // table est absente / hors ligne (scoresheets reste null), on ne restaure pas l'historique (mais le
  // reste — fiche comprise, qui est en dessous — a bien été restauré).
  useEffect(() => {
    const ph = pendingHistoryRef.current
    if (!ph || games === null || scoresheets === null) return
    pendingHistoryRef.current = null
    const g = games.find((x) => x.id === ph.id)
    if (g && scoresheets[g.id]) openHistory(g, ph.view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresheets, games])

  // Mémorise l'écran courant (après la restauration, pour ne pas écraser l'état à restaurer).
  useEffect(() => {
    if (!restoredRef.current) return
    savePage({
      detail: detailGame?.id || null,
      history: historyGame?.id || null,
      historyView,
      settings: settingsOpen,
      players: playersOpen,
      tierlistHub,
    })
  }, [detailGame, historyGame, historyView, settingsOpen, playersOpen, tierlistHub])

  // Liste des propriétaires déjà utilisés (un jeu peut en avoir plusieurs).
  const owners = useMemo(() => {
    const set = new Set()
    ;(games ?? []).forEach((g) => parseOwners(g.owner).forEach((o) => set.add(o)))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [games])

  // Propriétaires proposés dans les formulaires/filtres = liste gérée ∪ ceux sur les jeux.
  const allOwners = useMemo(() => {
    const set = new Set([...(ownersList ?? []).map((o) => o.name), ...owners])
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [ownersList, owners])

  // Garde-fou : si le filtre propriétaire mémorisé référence un propriétaire qui
  // n'existe plus (supprimé), on le retire (évite une collection vide inexpliquée).
  useEffect(() => {
    // On attend d'avoir des jeux chargés : avec 0 jeu (hors ligne sans cache), `allOwners`
    // serait incomplet et on effacerait à tort le filtre propriétaire mémorisé.
    if (games === null || games.length === 0) return
    setFilters((f) => {
      if (!f.owners.length) return f
      const valid = f.owners.filter((o) => allOwners.includes(o))
      return valid.length === f.owners.length ? f : { ...f, owners: valid }
    })
  }, [allOwners, games])

  // Correspondance nom -> ligne owners (pour les initiales + couleur des bulles).
  const ownerMap = useMemo(() => {
    const m = {}
    ;(ownersList ?? []).forEach((o) => {
      m[o.name] = o
    })
    return m
  }, [ownersList])

  // Tags : liste proposée (gérée ∪ ceux déjà sur les jeux) + correspondance nom -> ligne.
  const allTags = useMemo(() => {
    const set = new Set((tagsList ?? []).map((t) => t.name))
    ;(games ?? []).forEach((g) => parseTags(g.tags).forEach((t) => set.add(t)))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [tagsList, games])
  const tagMap = useMemo(() => {
    const m = {}
    ;(tagsList ?? []).forEach((t) => {
      m[t.name] = t
    })
    return m
  }, [tagsList])

  // Jeu affiché dans la fiche : TOUJOURS dérivé du tableau `games` (pas un instantané figé)
  // → la fiche reflète les modifications (nom, image, joueurs…) faites depuis « Modifier ».
  // Repli sur l'instantané le temps d'un rendu transitoire (la suppression ferme la fiche).
  const detailGameLive = useMemo(
    () => (detailGame ? (games ?? []).find((g) => g.id === detailGame.id) || detailGame : null),
    [detailGame, games]
  )

  // Fermeture ANIMÉE des écrans plein écran : chaque écran reste monté (avec la classe .closing →
  // il glisse vers la droite) le temps de l'animation, puis se démonte. `useExitLayer` mémorise la
  // dernière valeur pour que l'écran garde ses données pendant la sortie, et respecte reduced-motion.
  const detailLayer = useExitLayer(detailGameLive)
  const historyLayer = useExitLayer(historyGame)
  const tlHubLayer = useExitLayer(tierlistHub)
  const tlViewLayer = useExitLayer(tierlistView)
  const scoringLayer = useExitLayer(scoringGame)
  const editSheetLayer = useExitLayer(editingSheet)

  // Changement d'onglet de l'accueil : `key={tabKey}` remonte le contenu → sur Collection/Wishlist les
  // cartes rejouent leur petite arrivée (léger mouvement vers le haut) = repère « on a changé d'onglet ».
  // (Stats a son propre repère : l'anecdote du jour se déplie — cf. Stats.jsx.)
  const tabKey = statsOpen ? 'stats' : view

  // Statut affiché selon l'onglet (Collection ou Wishlist).
  const listStatus = view === 'wishlist' ? 'wishlist' : 'collection'
  // La grille est désormais offerte AUSSI en wishlist : le glissé y donne les deux actions
  // (BoardGameGeek, vers la collection) et la tuile porte son crayon d'édition — l'obstacle
  // qui l'avait fait interdire (« on ne pourrait plus modifier ces jeux ») est levé.
  const layout = layouts[listStatus] || 'liste'
  const grille = layout === 'grille'
  // Le tri par prix n'a de sens que dans la Wishlist.
  const sortOptions = [
    ...SORT_OPTIONS,
    // La collection donne accès aux tris liés aux parties ; la wishlist au tri par prix.
    ...(view === 'wishlist'
      ? [{ value: 'price', label: 'Prix' }]
      : [
          { value: 'plays', label: 'Parties jouées' },
          { value: 'lastplayed', label: 'Dernière partie' },
        ]),
  ].sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  // Jeux de la vue courante, filtrés (recherche + filtres) puis triés.
  const visible = useMemo(() => {
    const q = norm(search)
    let list = (games ?? []).filter(
      (g) => g.status === listStatus && passesFilters(g, filters, q, view === 'wishlist', view !== 'wishlist')
    )

    // Tri
    if (sort === 'random') return [...list].sort((a, b) => shuffleRank(a.id, shuffleSeed) - shuffleRank(b.id, shuffleSeed))
    if (sort === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))
    else if (sort === 'players') list = [...list].sort((a, b) => (a.players_min ?? 99) - (b.players_min ?? 99) || (a.players_max ?? 99) - (b.players_max ?? 99))
    else if (sort === 'complexity') list = [...list].sort((a, b) => (a.complexity ?? 99) - (b.complexity ?? 99))
    else if (sort === 'duration') list = [...list].sort((a, b) => (a.duration_max ?? a.duration_min ?? 9999) - (b.duration_max ?? b.duration_min ?? 9999))
    else if (sort === 'price') list = [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    else if (sort === 'plays') list = [...list].sort((a, b) => (playMeta[a.id]?.count || 0) - (playMeta[b.id]?.count || 0) || (a.name || '').localeCompare(b.name || '', 'fr'))
    // Dernière partie : les jeux jamais joués (pas de date) en dernier (ordre croissant).
    else if (sort === 'lastplayed') list = [...list].sort((a, b) => (playMeta[a.id]?.last || '').localeCompare(playMeta[b.id]?.last || '') || (a.name || '').localeCompare(b.name || '', 'fr'))
    if (sortDir === 'desc') list.reverse()
    return list
  }, [games, search, sort, sortDir, shuffleSeed, filters, listStatus, view, playMeta])

  // Largeur de la 1re colonne (joueurs/idéal) des cartes = largeur du jeu qui en prend le
  // plus → toutes les cartes partagent cette largeur (colonnes alignées).
  // ⚠️ On ne recalcule QUE quand les jeux ou l'onglet changent, pas à chaque filtrage :
  // lire les largeurs force le navigateur à refaire toute la mise en page (~20 ms mesurés
  // sur 89 cartes), ce qui rendait la frappe dans la recherche saccadée. Contrepartie
  // assumée : après un filtrage, la colonne garde la largeur calculée sur la liste
  // complète — au pire quelques pixels de trop, invisibles à l'usage.
  const listRef = useRef(null)
  // ── La grande lettre pendant le défilement ────────────────────────────────────────────
  // L'ascenseur existe sur TOUT tri dès que la liste est longue (retour user) ; seul le
  // contenu de sa poignée change : la lettre en tri par nom, la durée en tri par durée…
  // En aléatoire rien n'est affichable → la poignée reste NUE, mais l'ascenseur demeure.
  // Sous 30 cartes on voit la liste entière en deux gestes — un repère n'apprend rien (ce
  // garde couvre aussi la wishlist, qui en compte neuf). La grille y a droit : l'observateur
  // suit des NŒUDS, et les tuiles sont les enfants de la liste au même titre que les cartes.
  // Le sens décroissant marche sans rien faire : les groupes restent contigus.
  const lettreRef = useRef(null)
  const ascActif = !statsOpen && !settingsOpen && !compteOuvert && visible.length >= 30
  const ancresAsc = useMemo(() => {
    if (!ascActif) return null
    const etiquette = etiquetteDeTri(sort, playMeta)
    if (!etiquette) return null
    const m = new Map()
    let prec = null
    visible.forEach((g, i) => {
      const l = etiquette(g)
      if (l !== prec) { m.set(i, l); prec = l }
    })
    return m
  }, [visible, ascActif, sort, playMeta])
  useLettreDefilement(listRef, ancresAsc, visible.length, lettreRef)
  useLayoutEffect(() => {
    const list = listRef.current
    // En grille il n'y a aucune cellule à aligner : on sort avant de payer le reflow.
    // `layout` est dans les dépendances pour que la mesure se refasse au retour en liste.
    if (!list || grille) return
    // On mesure à largeur libre (chaque cellule prend sa largeur naturelle)…
    list.style.setProperty('--meta-left', 'max-content')
    let max = 0
    list.querySelectorAll('.m-players, .m-ideal').forEach((el) => {
      const w = el.getBoundingClientRect().width
      if (w > max) max = w
    })
    // …puis on fixe la colonne à ce maximum (repli 1fr si liste vide).
    list.style.setProperty('--meta-left', max ? `${Math.ceil(max)}px` : 'minmax(0, 1fr)')
    // statsOpen/settingsOpen : le <main> est démonté puis remonté en fermant ces écrans →
    // il faut recalculer, sinon la 1re colonne retombe sur son repli (colonne étirée).
    // ⚠️ `booting` : pendant la restauration d'écran, la liste n'affiche que des SQUELETTES — la
    // colonne serait mesurée sur eux et ne serait jamais recalculée une fois les vraies cartes là.
  }, [games, listStatus, statsOpen, settingsOpen, compteOuvert, grille, booting])

  // Scénarios déjà utilisés pour ce jeu (auto-complétion du champ scénario).
  const scenarioNames = useMemo(
    () => [...new Set((gamePlays || []).map((p) => (p.scenario || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [gamePlays]
  )

  // Jeux (tous statuts) filtrés par la recherche + les mêmes filtres, pour les Stats.
  // computeStats sépare ensuite collection / wishlist. Le prix est ignoré ici.
  // La recherche est ignorée sur les Stats (le champ n'y est plus affiché) : une saisie
  // résiduelle faite en Collection ne doit pas filtrer les stats en silence.
  const statsGames = useMemo(() => {
    return (games ?? []).filter((g) => passesFilters(g, filters, '', false))
  }, [games, filters])

  // Y a-t-il au moins un jeu en collection (indépendamment des filtres) ? Sert à
  // distinguer « collection vide » de « aucun jeu ne correspond aux filtres » dans les Stats.
  const hasCollection = useMemo(() => (games ?? []).some((g) => g.status !== 'wishlist'), [games])

  // Nombre de filtres actifs (pour la pastille du bouton Filtres).
  const activeFilterCount =
    (filters.owners.length ? 1 : 0) +
    ((statsOpen || view !== 'wishlist') && filters.tags.length ? 1 : 0) +
    (filters.players.length ? 1 : 0) +
    (filters.duration != null ? 1 : 0) +
    (!statsOpen && view === 'wishlist' && (filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX) ? 1 : 0) +
    (filters.complexity.length ? 1 : 0)
  // Pastille du bouton flottant : on NE compte PAS le propriétaire (filtre « passif » persistant).
  const badgeCount = activeFilterCount - (filters.owners.length ? 1 : 0)

  // Réinitialise les filtres en gardant le propriétaire (utilisé par la liste ET les tierlists).
  const resetFilters = useCallback(() => setFilters((f) => ({ ...EMPTY_FILTERS, owners: f.owners })), [])

  // Puces des filtres ACTIFS (sous la recherche) : on voit ce qui filtre et on l'enlève d'un tap.
  const activeChips = useMemo(() => {
    const chips = []
    // LE COMPTE. On ne répète PAS le nom du compte actif quand il est seul coché : c est
    // l état normal, il est déjà dit par l avatar de la barre du haut — une puce qui ne
    // quitte jamais l écran cesse d être une information. En revanche, regarder AUTRE CHOSE
    // que ses jeux doit se voir : d où « Tous les comptes » quand le filtre est vide (ou
    // qu ils sont tous cochés, ce qui revient au même), et le nom des comptes sinon.
    const sonCompteSeul = compte && filters.owners.length === 1 && filters.owners[0] === compte
    const tousLesComptes = allOwners.length > 0 && (filters.owners.length === 0 || filters.owners.length === allOwners.length)
    if (sonCompteSeul) {
      // rien : induit
    } else if (tousLesComptes) {
      chips.push({
        key: 'o:tous',
        label: 'Tous les comptes',
        // Le × ramène chez soi. Sans compte actif il n y a nulle part où revenir : la puce
        // devient un simple état, pas une commande.
        remove: compte ? () => setFilters((f) => ({ ...f, owners: [compte] })) : null,
      })
    } else {
      filters.owners.forEach((o) =>
        chips.push({
          key: 'o:' + o,
          label: o,
          // ⚠️ Retirer la DERNIÈRE étiquette de compte ramène CHEZ SOI, pas à « tous les
          // comptes » : dans une logique de comptes, l'état de repos est sa propre collection,
          // et c'est justement celui qui ne porte aucune étiquette. Voir tout le monde reste
          // possible, mais c'est un choix qu'on fait — pas là où l'on retombe.
          remove: () =>
            setFilters((f) => {
              const reste = f.owners.filter((x) => x !== o)
              return { ...f, owners: reste.length || !compte ? reste : [compte] }
            }),
        })
      )
    }
    if (statsOpen || view !== 'wishlist') {
      filters.tags.forEach((t) =>
        chips.push({ key: 't:' + t, label: t, remove: () => setFilters((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) })) })
      )
    }
    if (filters.players.length) {
      const list = [...filters.players].sort((a, b) => a - b).map((n) => (n >= 12 ? '12+' : n)).join(', ')
      chips.push({
        key: 'pl',
        label: (filters.playerOptimal ? 'Idéal ' : '') + list + ' j.',
        remove: () => setFilters((f) => ({ ...f, players: [], playerOptimal: false })),
      })
    }
    if (filters.duration != null) {
      chips.push({ key: 'dur', label: `≤ ${filters.duration} min`, remove: () => setFilters((f) => ({ ...f, duration: null })) })
    }
    filters.complexity.forEach((b) => {
      const lbl = b === 'simple' ? 'Simple' : b === 'moyen' ? 'Moyen' : 'Corsé'
      chips.push({ key: 'c:' + b, label: lbl, remove: () => setFilters((f) => ({ ...f, complexity: f.complexity.filter((x) => x !== b) })) })
    })
    if (!statsOpen && view === 'wishlist' && (filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX)) {
      const [lo, hi] = filters.priceRange
      chips.push({ key: 'price', label: `${lo}–${hi >= PRICE_MAX ? '150+' : hi} €`, remove: () => setFilters((f) => ({ ...f, priceRange: [PRICE_MIN, PRICE_MAX] })) })
    }
    return chips
  }, [filters, statsOpen, view, compte, allOwners])

  // ⚠️ Une seule fois par mois, et seulement quand il y a vraiment une liste à l'écran :
  // pas pendant le chargement (les squelettes bougeraient), pas sous un écran plein, pas si
  // l'utilisateur a demandé moins d'animations. On note la date AVANT de jouer : même si
  // l'animation est interrompue, on ne la rejouera pas au prochain lancement.
  // ⚠️ `layerCount` est dans les DÉPENDANCES, pas seulement dans la garde : c'est ce qui permet
  // au rappel de se jouer en REVENANT des Réglages — donc juste après le bouton « Vérifier les
  // mises à jour », qui le réarme. Un état qui garde un effet doit être dans ses dépendances si
  // l'effet doit rejouer quand cet état retombe.
  useEffect(() => {
    // ⚠️ La date est notée AVANT de jouer : il faut donc être certain qu'une carte est
    // réellement visible, sinon le rappel est BRÛLÉ POUR 30 JOURS sans avoir été vu.
    // `visible` et non `games` : un filtre mémorisé ou la wishlist vide laissent la liste
    // pleine de jeux mais l'écran vide. `layerCount` couvre les 26 couches d'un coup (la
    // liste reste MONTÉE sous un écran plein) et se maintiendra tout seul si une couche
    // s'ajoute. `compte === undefined` : au tout premier lancement l'écran des avatars
    // REMPLACE le rendu sans être une couche — et c'est justement le nouvel arrivant qui a
    // le plus besoin de découvrir le geste.
    if (booting || games === null || !visible.length) return
    if (layerCount || compte === undefined) return
    // ⚠️ HORS LIGNE, ON NE BRÛLE PAS LE MOIS : les deux actions du geste tombent (BoardGameGeek
    // et « nouvelle partie » exigent le réseau), la démonstration ne montrerait donc que deux
    // panneaux gris « Hors ligne » — et le rappel serait consommé pour 30 jours sans avoir rien
    // appris. `online` est en DÉPENDANCE, pas seulement dans la garde : il rejouera à la
    // reconnexion.
    if (!online) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = Date.now()
    if (t - rappelDu() < RAPPEL_DELAI) return
    noteRappel(t)
    setRappelGlisse(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, games, visible, layerCount, compte, online])

  // ⚠️ Le retrait vit dans SON PROPRE effet. Placé dans celui du dessus, son nettoyage était
  // déclenché au rafraîchissement suivant de `games` (cache puis réseau) : le minuteur était
  // annulé, la garde du mois empêchait de le réarmer, et la classe restait posée À VIE.
  useEffect(() => {
    if (!rappelGlisse) return
    // ⚠️ UNE SEULE source de vérité : `DEMO_TOTAL` vient du hook qui joue la démonstration.
    // La marge de 200 ms garantit qu'on ne coupe jamais son dernier retour — à cet instant la
    // carte est déjà au repos, la marge ne coûte donc rien à l'œil.
    const fin = setTimeout(() => setRappelGlisse(false), DEMO_TOTAL + 200)
    return () => clearTimeout(fin)
  }, [rappelGlisse])

  const currentCount = (games ?? []).filter((g) => g.status === listStatus).length

  // Les puces de filtres actifs, prêtes à rendre (au-dessus de la liste, ou dans l'onglet
  // Stats sous l'anecdote/Tierlists). null s'il n'y a aucune puce.
  const activeChipsEl =
    activeChips.length > 0 ? (
      <div className="active-filters">
        {activeChips.map((c) =>
          c.remove ? (
            <button key={c.key} type="button" className="active-chip" onClick={c.remove} aria-label={`Retirer le filtre ${c.label}`}>
              <span>{c.label}</span>
              <span className="active-chip-x">×</span>
            </button>
          ) : (
            <span key={c.key} className="active-chip active-chip-fixe">{c.label}</span>
          )
        )}
      </div>
    ) : null

  // Compte affiché sur le bouton du menu de filtres. Sur Stats on ne compte QUE la
  // collection (statsGames inclut la wishlist pour la tuile dédiée → « 75 » là où la
  // Collection dit « 67 », c'était perçu comme un bug).
  const filterShownCount = statsOpen ? statsGames.filter((g) => g.status !== 'wishlist').length : visible.length

  async function handleSave(formValues) {
    setSaving(true)
    setError(null)
    try {
      const payload = cleanGameInput(formValues)
      if (editing && editing !== 'new') {
        const updated = await updateGame(editing.id, payload)
        setGames((gs) => (gs ?? []).map((g) => (g.id === updated.id ? updated : g)))
      } else {
        const created = await addGame(payload)
        setGames((gs) => [...(gs ?? []), created])
      }
      return true // succès → GameForm ferme en glissant vers le bas (animateClose)
    } catch (e) {
      setError(messageUtilisateur(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirming) return
    setDeletingBusy(true)
    setError(null)
    try {
      await deleteGame(confirming.id)
      setGames((gs) => (gs ?? []).filter((g) => g.id !== confirming.id))
      setConfirming(null)
      setEditing(null) // ferme aussi le formulaire d'édition si ouvert
      setDetailGame((d) => (d && d.id === confirming.id ? null : d)) // ferme la fiche du jeu supprimé
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setDeletingBusy(false)
    }
  }

  // Renvoie true si la création a abouti. ⚠️ L'appelant en a besoin : l'écran des avatars REMPLACE
  // le rendu (return anticipé), donc ni le toast ni le bandeau d'erreur n'y sont montés — y aller
  // après un échec rendait la panne 100 % silencieuse.
  async function handleAddOwner(name, initials, color, avatar) {
    try {
      await addOwner(name, initials, color, avatar)
      reloadOwners()
      return true
    } catch (e) {
      setError(messageUtilisateur(e))
      return false
    }
  }
  async function handleUpdateOwner(id, patch) {
    try {
      await updateOwner(id, patch)
      reloadOwners()
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleRenameOwner(id, oldName, newName, patch) {
    try {
      const n = await renameOwner(id, oldName, newName, patch)
      // ⚠️ Le compte actif est mémorisé PAR SON NOM (comme tout le reste : la table owners,
      // les tierlists, le CSV games.owner). Le renommer sans suivre laisserait l appareil sur
      // un compte qui n existe plus — avatar sans couleur, et surtout un filtre propriétaire
      // qui ne correspond à AUCUN jeu : la collection se viderait sans un mot.
      if (oldName === compte) {
        setCompte(newName)
        saveCompte(newName)
        setFilters((f) => ({ ...f, owners: f.owners.map((o) => (o === oldName ? newName : o)) }))
      }
      reloadOwners()
      loadGames() // recharge les jeux : le nom propagé dans games.owner doit s'afficher
      showToast(n ? `« ${newName} » : ${n} jeu${n > 1 ? 'x' : ''} mis à jour.` : `Renommé en « ${newName} ».`)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleConfirmDeleteOwner() {
    if (!confirmingOwner) return
    setDeletingOwnerBusy(true)
    setError(null)
    try {
      const supprime = confirmingOwner.name
      await deleteOwner(confirmingOwner.id)
      // Même raison qu au renommage : rester « sur » un compte supprimé laisse un filtre
      // mort. On revient à toute la collection et on redemande qui regarde.
      if (supprime === compte) {
        setCompte(null)
        saveCompte(null)
        setFilters((f) => ({ ...f, owners: f.owners.filter((o) => o !== supprime) }))
        setCompteOuvert(false)
        setChoixCompte(true)
      }
      reloadOwners()
      setConfirmingOwner(null)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setDeletingOwnerBusy(false)
    }
  }

  // --- Tags (même logique que les propriétaires) ---
  async function handleAddTag(name, initials, color) {
    try {
      await addTag(name, initials, color)
      reloadTags()
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleUpdateTag(id, patch) {
    try {
      await updateTag(id, patch)
      reloadTags()
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleRenameTag(id, oldName, newName, patch) {
    try {
      const n = await renameTag(id, oldName, newName, patch)
      reloadTags()
      loadGames() // recharge les jeux : le nom propagé dans games.tags doit s'afficher
      showToast(n ? `« ${newName} » : ${n} jeu${n > 1 ? 'x' : ''} mis à jour.` : `Renommé en « ${newName} ».`)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleConfirmDeleteTag() {
    if (!confirmingTag) return
    setDeletingTagBusy(true)
    setError(null)
    try {
      await deleteTag(confirmingTag.id)
      reloadTags()
      setConfirmingTag(null)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setDeletingTagBusy(false)
    }
  }

  // --- Sauvegarde / restauration ---
  async function handleExport() {
    setError(null)
    const dateStr = new Date().toISOString().slice(0, 10)
    try {
      // Relit les parties et les fiches en base → la sauvegarde contient TOUT.
      const n = await downloadBackup(games ?? [], ownersList ?? [], tagsList ?? [], dateStr)
      showToast(`Sauvegarde téléchargée : ${n.games} jeux, ${n.plays} parties, ${n.sheets} fiches, ${n.tierlists} tierlists.`)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  // Export tableur : 2 fichiers CSV (jeux, parties) ouvrables dans Excel / LibreOffice.
  async function handleExportCsv() {
    setError(null)
    const dateStr = new Date().toISOString().slice(0, 10)
    try {
      const n = await downloadCsv(games ?? [], ownersList ?? [], tagsList ?? [], dateStr)
      showToast(`2 fichiers tableur téléchargés : ${n.games} jeux et ${n.lignesParties} lignes de parties.`)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }

  async function handleImportFile(file) {
    setError(null)
    showToast('')
    try {
      const text = await file.text()
      const parsed = parseBackup(text) // { games, owners }
      setImporting(parsed)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }
  async function handleConfirmImport() {
    if (!importing) return
    setImportBusy(true)
    setError(null)
    try {
      const res = await importBackup(importing)
      await loadGames()
      reloadOwners()
      reloadTags()
      refreshHistory(historyGame)
      fetchScoresheets().then((m) => setScoresheets(m || {})).catch(() => {})
      reloadTierlists()
      setImporting(null)
      const extra = res.plays ? ` et ${res.plays} partie${res.plays > 1 ? 's' : ''}` : ''
      showToast(`Import réussi : ${res.games} jeu${res.games > 1 ? 'x' : ''}${extra}.`)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setImportBusy(false)
    }
  }

  // --- Sauvegardes automatiques (Supabase) ---
  const reloadBackups = useCallback(async () => {
    try {
      const list = await fetchBackups() // null si table absente
      setBackupsList(list)
    } catch {
      /* silencieux : la sauvegarde ne doit jamais casser l'app */
    }
  }, [])

  // Sauvegarde automatique au chargement (une fois), si le délai de la fréquence est écoulé.
  useEffect(() => {
    if (autoBackupRef.current) return
    // On attend que jeux + owners + tags aient répondu (owners/tags peuvent valoir null si
    // la table est absente : on utilise donc les drapeaux « chargé », pas la valeur null).
    if (!online || games === null || !ownersLoaded || !tagsLoaded) return
    autoBackupRef.current = true
    ;(async () => {
      try {
        const res = await maybeAutoBackup(backupFreq, games, ownersList ?? [], tagsList ?? [])
        // Garde-fou : chute brutale du nombre de jeux → sauvegarde refusée, on alerte.
        // Mieux vaut une sauvegarde ancienne mais saine qu'un instantané de l'accident.
        if (res && res.skipped === 'drop') {
          setError(
            `Sauvegarde automatique suspendue : votre collection est passée de ${res.before} à ${res.after} jeux ` +
              `(${res.lost} de moins). Si c'est normal, sauvegardez à la main dans Réglages. Sinon, vos anciennes ` +
              `sauvegardes sont intactes : vous pouvez restaurer.`
          )
        }
      } catch {
        /* silencieux */
      }
      reloadBackups()
    })()
  }, [online, games, ownersLoaded, tagsLoaded, ownersList, tagsList, backupFreq, reloadBackups])

  // Autorisation de l'appareil : à la 1re ouverture (en ligne), si aucun code n'est encore
  // enregistré, on propose de saisir le code d'accès. La lecture marche sans, seules les
  // écritures en ont besoin. On ne redemande pas si l'utilisateur a cliqué « Plus tard ».
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  useEffect(() => {
    if (isLocalHost || authorized || codeDismissedRef.current) return
    if (!isConfigured || !online || games === null) return
    setCodeAsk(true)
  }, [online, games, authorized, isLocalHost])

  const handleSetBackupFreq = (v) => {
    setBackupFreq(v)
    saveBackupFreq(v)
  }

  async function handleBackupNow() {
    setBackupBusy(true)
    setError(null)
    try {
      const ok = await createBackup(games ?? [], ownersList ?? [], tagsList ?? [], 'manual')
      if (ok === null) setError("Les sauvegardes ne sont pas encore activées sur votre base.")
      else {
        await reloadBackups()
        showToast('Sauvegarde enregistrée.')
      }
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setBackupBusy(false)
    }
  }

  // Ouvre l'écran d'un jeu (si fiche de score existe) : `view` = 'stats' (Statistiques) ou
  // 'plays' (Historique des parties). Sinon → éditeur pour créer la fiche d'abord.
  function openHistory(g, view = 'stats') {
    if (scoresheets && scoresheets[g.id]) {
      setHistoryView(view)
      setHistoryGame(g)
      setGamePlays(null)
      fetchPlays(g.id).then((p) => setGamePlays(p || [])).catch(() => setGamePlays([]))
    } else {
      // ⚠️ On RETIENT ce qu'on voulait faire : sans ça, on créait la fiche et on retombait
      // sur la liste, sans son historique — il fallait tout recommencer.
      intentionFicheRef.current = { but: 'historique', id: g.id, view }
      setEditingSheet(g)
    }
  }

  // « Nouvelle partie » directement depuis une carte (menu de glissement). Si le jeu a une
  // fiche → on ouvre la saisie ; sinon → on ouvre l'éditeur pour créer la fiche d'abord.
  function handleNewPlayFromCard(g) {
    if (scoresheets && scoresheets[g.id]) {
      setEditingPlay(null)
      setScoringGame(g)
    } else {
      // Même mur, même mémoire : la fiche enregistrée, on enchaîne sur la partie voulue.
      intentionFicheRef.current = { but: 'partie', id: g.id }
      setEditingSheet(g)
    }
  }

  // Recharge les parties du jeu affiché + la liste des noms.
  const refreshHistory = (g) => {
    if (g) fetchPlays(g.id).then((p) => setGamePlays(p || [])).catch(() => {})
    fetchPlayerNames().then(setPlayerNames).catch(() => {})
    fetchPlayMeta().then(setPlayMeta).catch(() => {})
  }

  // Écran Joueurs : liste de tous les joueurs enregistrés (chargée à l'ouverture).
  function handleOpenPlayers() {
    setPlayersOpen(true)
    setPlayerRoster(null)
    fetchPlayerRoster().then(setPlayerRoster).catch(() => setPlayerRoster([]))
  }

  // Renomme un joueur dans TOUTES les parties, puis rafraîchit ce qui l'affiche.
  async function handleRenamePlayer(from, to) {
    setRenamingPlayer(true)
    try {
      const n = await renamePlayer(from, to)
      setPlayerRoster(await fetchPlayerRoster())
      fetchPlayerNames().then(setPlayerNames).catch(() => {})
      if (historyGame) refreshHistory(historyGame)
      showToast(n ? `« ${to} » : ${n} partie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour.` : 'Aucune partie à mettre à jour.')
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setRenamingPlayer(false)
    }
  }

  // Enregistre une fiche (création ou modification) et met à jour l'état local.
  async function handleSaveSheet(gameId, template, renames) {
    await saveScoresheet(gameId, template)
    setScoresheets((m) => ({ ...(m || {}), [gameId]: template }))
    // Une catégorie renommée doit l'être aussi dans les parties déjà enregistrées,
    // sinon leurs scores restent rangés sous l'ancien nom (stats incohérentes).
    if (renames && renames.length) {
      const n = await renameCategories(gameId, renames)
      if (n) {
        showToast(`Fiche enregistrée · ${n} partie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour.`)
        if (historyGame && historyGame.id === gameId) refreshHistory(historyGame)
      }
    }
    // L'éditeur s'était interposé devant ce qu'on voulait vraiment faire : on y va.
    const veut = intentionFicheRef.current
    intentionFicheRef.current = null
    if (veut && veut.id === gameId) {
      const jeu = (games || []).find((g) => g.id === gameId)
      if (jeu && veut.but === 'partie') {
        setEditingPlay(null)
        setScoringGame(jeu)
      } else if (jeu && veut.but === 'historique') {
        setHistoryView(veut.view || 'stats')
        setHistoryGame(jeu)
        setGamePlays(null)
        fetchPlays(jeu.id).then((p) => setGamePlays(p || [])).catch(() => setGamePlays([]))
      }
    }
  }

  // Ouvre une partie existante pour l'éditer (depuis l'historique).
  function handleEditPlay(pl) {
    if (!historyGame) return
    setEditingPlay(pl)
    setScoringGame(historyGame)
  }

  // Enregistre une partie (nouvelle OU édition) → retour à l'historique.
  async function handleSavePlay(play) {
    if (!scoringGame) return
    setSavingPlay(true)
    setError(null)
    try {
      const wasEditing = !!editingPlay
      let inserted = null
      if (wasEditing) await updatePlay(editingPlay.id, play)
      else inserted = await savePlay(scoringGame.id, play)
      const g = scoringGame
      setScoringGame(null)
      // ⚠️ On NE remet PAS `editingPlay` à null ici : la feuille reste montée 240 ms pour glisser
      // dehors (useExitLayer) et se rendrait VIERGE pendant toute sa sortie. Elle est réinitialisée
      // à la prochaine ouverture.
      // Nouvelle partie → on revient sur la FICHE du jeu (déjà ouverte dessous ; sinon on l'ouvre).
      // Édition depuis l'historique → on revient sur l'historique (déjà ouvert dessous), rafraîchi.
      if (wasEditing) {
        if (historyGame) refreshHistory(historyGame)
      } else if (!detailGame) {
        setDetailGame(g)
      }
      // Met à jour le résumé « N parties · dernière le … » de la fiche.
      fetchPlayMeta().then(setPlayMeta).catch(() => {})
      // ⚠️ AUCUN fait sur une ÉDITION : corriger une faute de frappe n'est pas jouer une
      // partie, et le fait se rejouerait à chaque correction.
      let fait = null
      if (!wasEditing && inserted?.id) {
        try {
          const parties = await fetchPlays(g.id)
          const f = faitNotable({
            jeu: g,
            parties: parties || [],
            nouvelleId: inserted.id,
            template: scoresheets?.[g.id],
            dejaDit: faitsDuJourRef.current,
          })
          if (f) {
            fait = f
            setDernierFait({ gameId: g.id, titre: f.titre, sous: f.sous })
          }
        } catch {
          // Un fait est un bonus : il ne doit JAMAIS faire échouer un enregistrement.
        }
      }
      const message = wasEditing ? 'Partie modifiée.' : 'Partie enregistrée.'
      // 5 200 ms pour un fait : deux lignes demandent deux fixations du regard. Et on atterrit
      // sur la fiche, où la même information reste lisible — le toast n'est pas la dernière chance.
      showToast(message, fait ? { fait, ms: 5200 } : undefined)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setSavingPlay(false)
    }
  }

  // ---- Tierlists ----
  // Jeux de la collection, MUTUALISÉS par nom (un même jeu en double → un seul chip). Les
  // tierlists ne manipulent que ces « représentants ». `repById` mappe tout id (doublon
  // compris) vers son représentant, pour remapper les classements enregistrés.
  const nonWishlist = useMemo(() => (games ?? []).filter((g) => g.status !== 'wishlist'), [games])
  const collectionGames = useMemo(() => dedupeByName(nonWishlist), [nonWishlist])
  const repById = useMemo(() => repIdMap(nonWishlist), [nonWishlist])
  const collectionIds = useMemo(() => collectionGames.map((g) => g.id), [collectionGames])
  // Ids de jeux valides (représentants) → sert à retirer des classements les jeux supprimés.
  const validTlIds = useMemo(() => new Set(collectionIds), [collectionIds])

  // ---- Le périmètre des ANECDOTES : les jeux du COMPTE ACTIF ----
  // Une anecdote parle de NOTRE collection ; elle n a pas à raconter les jeux d un autre
  // foyer, même quand on les regarde. Le périmètre suit le compte et PAS les filtres :
  // s il les suivait, l anecdote du jour changerait en cours de route au moindre réglage,
  // alors que tout le mécanisme repose sur « même jour = même anecdote ».
  // ⚠️ On passe par les REPRÉSENTANTS : un jeu possédé par les deux foyers n en a qu un,
  // porteur du nom du premier exemplaire — lire le propriétaire du seul représentant en
  // priverait l autre compte de ses propres jeux.
  const idsAnec = useMemo(() => {
    if (!compte) return null // aucun compte choisi → toute la collection
    const s = new Set()
    nonWishlist.forEach((g) => {
      const proprios = parseOwners(g.owner)
      // ⚠️ Un jeu SANS propriétaire est à tout le monde : les filtres le montrent à tous
      // (filtering.js le laisse toujours passer), il doit donc compter pour tous.
      if (!proprios.length || proprios.includes(compte)) s.add(repById.get(g.id) ?? g.id)
    })
    return s
  }, [compte, nonWishlist, repById])
  const gamesAnec = useMemo(
    () => (idsAnec ? collectionGames.filter((g) => idsAnec.has(g.id)) : collectionGames),
    [idsAnec, collectionGames]
  )
  const playsAnec = useMemo(
    () => (idsAnec && allPlays ? allPlays.filter((p) => idsAnec.has(repById.get(p.game_id) ?? p.game_id)) : allPlays),
    [idsAnec, allPlays, repById]
  )
  const reloadTierlists = () => fetchTierlists().then(setTierlists).catch(() => setTierlists(null))
  // Le « verdict de la table » de la fiche a besoin des tierlists : jusqu'ici elles n'étaient
  // chargées qu'à l'ouverture des Stats ou du hub. Une seule fois (garde sur tierlistsLues).
  // ⚠️ Le drapeau n'est posé QU'EN CAS DE SUCCÈS : cet effet est à un seul coup (sa garde lit
  // le drapeau), contrairement à celui des Stats qui se rejoue à chaque visite de l'onglet —
  // un échec réseau au premier tap condamnerait le verdict pour toute la session.
  useEffect(() => {
    if (!detailGame || tierlistsLues) return
    fetchTierlists()
      .then((tl) => { setTierlists(tl); setTierlistsLues(true) })
      .catch(() => {})
  }, [detailGame, tierlistsLues])
  // ⚠️ Sur detailLayer.value, PAS sur detailGameLive : ce dernier tombe à null dès le tap sur
  // retour, alors que la feuille reste montée le temps de glisser dehors — le bloc se
  // démonterait à la première frame de la sortie et tout le bas de fiche sauterait.
  const verdictFiche = useMemo(
    () => (detailLayer.value ? verdictDeLaTable(tierlists, detailLayer.value.id, repById) : []),
    [tierlists, detailLayer.value, repById]
  )
  // Les anecdotes tirées des TIERLISTS (qui aime quoi). Graine FIXE : les textes doivent
  // être stables d'un jour à l'autre, c'est le parcours ci-dessous qui apporte la variété.
  // ⚠️⚠️ ELLES RESTENT COMMUNES À TOUS LES COMPTES, sur TOUTE la collection. Les tierlists
  // sont un menu à part, sans lien avec le compte (décision du cadrage) : elles parlent des
  // PERSONNES, pas d'un foyer. Et le périmètre y est un paramètre de CALCUL, pas seulement
  // d'affichage — `gameIds` sert de filtre à remapRanking, donc le restreindre fausserait
  // aussi « le plus enthousiaste » ou « goûts proches », mesurés sur une collection amputée.
  const tierAnecdotes = useMemo(() => {
    if (!tierlists || !tierlists.length) return []
    const nameById = new Map(collectionGames.map((g) => [g.id, g.name]))
    return computeAnecdoteList(tierlists, collectionIds, repById, nameById, 1).flat().map((a) => a.text)
  }, [tierlists, collectionGames, collectionIds, repById])
  // Toute la matière disponible : les parties (qui joue à quoi, qui gagne, quand) + les goûts.
  const anecPool = useMemo(
    () =>
      allPlays && tierlistsLues
        ? buildAnecdotes({
            plays: playsAnec,
            games: gamesAnec,
            // Les anecdotes qui parlent de PERSONNES se calculent sur tout (cf. la §1 de
            // anecdotes.js) : un superlatif restreint à un foyer désigne quelqu un d autre.
            playsTous: allPlays,
            repById,
            tierAnecdotes,
            // Le sens du score de chaque jeu : sans lui, « Record à Odin » couronnerait le
            // PIRE score de la table (cette fiche est en « le plus petit score gagne »).
            // ⚠️ Indexée par le REPRÉSENTANT : les parties sont remappées vers lui, donc une
            // fiche posée sur le second exemplaire d un jeu possédé en double serait perdue
            // (repli silencieux sur « le plus haut gagne » → record inversé à Odin).
            scoringById: scoresheets
              ? new Map(Object.entries(scoresheets).map(([id, t]) => [repById.get(id) ?? id, t?.scoring || 'high']))
              : null,
          })
        : [],
    // ⚠️ `scoresheets` EN DÉPENDANCE : sans lui le sens du score restait figé à sa valeur du
    // premier calcul (souvent null → tout en « le plus haut gagne »).
    [allPlays, playsAnec, gamesAnec, tierlistsLues, repById, tierAnecdotes, scoresheets]
  )
  // L'anecdote du jour. Ce n'est PAS un tirage : les anecdotes sont mélangées une fois par
  // cycle puis servies une par jour → chacune passe exactement une fois avant que la
  // première revienne (donc pas de répétition en un mois tant qu'il y en a au moins 30).
  const anecShown = useMemo(() => (anecPool.length >= ANEC_MIN ? anecdoteDuJour(anecPool) : null), [anecPool])
  function handleOpenTierlists() {
    setTierlistHub(true)
    reloadTierlists()
  }
  function handleOpenGlobalTierlist() {
    const { ranking, unranked } = computeGlobalTierlist(tierlists || [], collectionIds, repById)
    setTierlistView({ mode: 'global', title: 'Tierlist globale', ranking, unranked, player: '', id: null })
  }
  function handleOpenTierlist(tl) {
    // Remappe vers les représentants (mutualise les doublons de nom) + retire les jeux supprimés.
    setTierlistView({ mode: 'view', title: tl.player, ranking: remapRanking(tl.ranking, repById, validTlIds), unranked: [], player: tl.player, id: tl.id })
  }
  function handleCreateTierlist() {
    setTierlistView({ mode: 'edit', title: '', ranking: emptyRanking(), unranked: [], player: '', id: null })
  }
  async function handleSaveTierlist(payload) {
    const row = await upsertTierlist(payload)
    reloadTierlists()
    return row
  }
  async function handleConfirmDeleteTierlist() {
    if (!tierlistView?.id) { setConfirmingTierlist(false); setTierlistView(null); return }
    try {
      await deleteTierlist(tierlistView.id)
      setConfirmingTierlist(false)
      setTierlistView(null)
      reloadTierlists()
      showToast('Tierlist supprimée.')
    } catch (e) {
      setError(messageUtilisateur(e))
      setConfirmingTierlist(false)
    }
  }

  async function handleConfirmDeletePlay() {
    if (!confirmingPlay) return
    setError(null)
    try {
      await deletePlay(confirmingPlay.id)
      setConfirmingPlay(null)
      refreshHistory(historyGame)
    } catch (e) {
      setError(messageUtilisateur(e))
    }
  }

  async function handleConfirmRestore() {
    if (!restoring) return
    setRestoreBusy(true)
    setError(null)
    try {
      // Filet de sécurité : on photographie l'état ACTUEL avant de revenir en arrière,
      // pour pouvoir annuler la restauration elle-même. (Marquée « manuelle » → la
      // rotation des sauvegardes automatiques ne l'effacera pas.)
      await createBackup(games ?? [], ownersList ?? [], tagsList ?? [], 'manual').catch(() => null)
      const res = await restoreBackup(restoring.id)
      await loadGames()
      reloadOwners()
      reloadTags()
      refreshHistory(historyGame)
      fetchScoresheets().then((m) => setScoresheets(m || {})).catch(() => {})
      reloadBackups()
      setRestoring(null)
      showToast(`Sauvegarde restaurée : ${res.games} jeux, ${res.plays} parties. Une sauvegarde de l'état précédent a été créée.`)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setRestoreBusy(false)
    }
  }

  async function handleConfirmMove() {
    if (!moving) return
    setMovingBusy(true)
    setError(null)
    try {
      const updated = await updateGame(moving.id, { status: 'collection' })
      setGames((gs) => (gs ?? []).map((g) => (g.id === updated.id ? updated : g)))
      setMoving(null)
    } catch (e) {
      setError(messageUtilisateur(e))
    } finally {
      setMovingBusy(false)
    }
  }

  // Valeur du tri en cours, affichée sous le nom en vue grille : la tuile n'a pas de
  // ligne d'infos, sans ça on trierait sur une donnée invisible.
  const tileSortLabel = (g) => {
    if (sort === 'lastplayed') return playMeta[g.id]?.last ? formatDay(playMeta[g.id].last) : 'Jamais jouée'
    if (sort === 'plays') {
      const n = playMeta[g.id]?.count
      return n ? `${n} partie${n > 1 ? 's' : ''}` : 'Jamais jouée'
    }
    if (sort === 'players') return g.players || (g.players_min ? `${g.players_min}-${g.players_max || g.players_min} j.` : null)
    if (sort === 'duration') {
      const d = g.duration_max ?? g.duration_min
      return d ? (d >= 60 ? `${Math.round((d / 60) * 10) / 10} h` : `${d} min`) : null
    }
    if (sort === 'complexity') return g.complexity ? `${Number(g.complexity).toFixed(1)} / 5` : null
    return null
  }

  const countLabel = `${visible.length} jeu${visible.length > 1 ? 'x' : ''}`

  // Nom de l'écran courant : sert au grand titre ET au titre condensé de la barre du haut.
  // Même ordre de priorité que le rendu : le menu Compte passe devant tout.
  const screenTitle = compteOuvert
    ? ajoutCompte
      ? 'Nouveau compte'
      : 'Compte'
    : settingsOpen
    ? playersOpen
      ? 'Joueurs'
      : 'Réglages'
    : statsOpen
      ? 'Statistiques'
      : view === 'wishlist'
        ? 'Wishlist'
        : 'Collection'

  // Barre du haut + FAB qui s'effacent en descendant, réapparaissent en remontant
  // (plus de place sur petit écran ; les FAB ne recouvrent plus les cartes du bas).
  // `scrolled` (dès les premiers pixels) sert au chrome qui s'efface : la barre du haut
  // n'a un filet — et ne montre le nom de l'écran — que quand du contenu passe dessous.
  const [hideBars, setHideBars] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 6)
      if (y < 48) { setHideBars(false); lastY = y; return } // tout en haut → toujours visible
      const dy = y - lastY
      if (dy > 6) setHideBars(true)
      else if (dy < -6) setHideBars(false)
      lastY = y
    }
    onScroll() // état correct dès le montage (restauration d'écran, rechargement en cours de page)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // L'ÉCRAN DE DÉMARRAGE : au tout premier lancement (aucun choix mémorisé) ou quand on
  // l'a rouvert depuis les Réglages. Il attend que les comptes soient VRAIMENT chargés,
  // sinon il s'afficherait vide une fraction de seconde. Sous deux comptes il n'a rien à
  // demander : on ne fait pas choisir entre une seule porte.
  const comptesChoisissables = ownersList ?? []
  // Dès que la table est là, la vue mémorisée suit — changement de compte, renommage,
  // nouvel avatar : tout passe par ici, il n'y a pas d'autre endroit à tenir à jour.
  useEffect(() => {
    if (!ownersLoaded) return
    saveCompteVue(compte ? comptesChoisissables.find((c) => c.name === compte) || null : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersLoaded, ownersList, compte])
  // La ligne complète du compte actif (avatar, couleur) : le nom seul ne suffit pas — d'où le
  // repli sur la vue mémorisée tant que la table n'est pas arrivée, et seulement ensuite sur
  // le nom nu (premier lancement d'un appareil, ou compte tout juste créé).
  const compteLigne = compte
    ? comptesChoisissables.find((c) => c.name === compte) ||
      (compteVue && compteVue.name === compte ? compteVue : { name: compte })
    : null
  // ⚠️ `!ajoutCompte` : au TOUT PREMIER lancement, `compte === undefined` reste vrai après le tap sur
  // « Ajouter un compte » → l'écran des avatars continuait de s'afficher et le formulaire de création
  // n'apparaissait JAMAIS, tout en poussant une entrée d'historique pour une couche jamais rendue.
  // ⚠️ Le seuil de 2 ne vaut que pour la question AUTOMATIQUE du premier lancement (« on ne fait pas
  // choisir entre une seule porte »). L'appliquer aussi à l'ouverture VOLONTAIRE enfermait l'app :
  // en supprimant un compte sur deux, l'écran des avatars ne paraissait plus jamais — or il héberge
  // le SEUL « Ajouter un compte », et « Choisir un compte » n'avait plus aucun effet.
  const montreEcranComptes =
    !ajoutCompte &&
    (choixCompte || compte === undefined) &&
    ownersLoaded &&
    (choixCompte || comptesChoisissables.length >= 2)

  if (montreEcranComptes) {
    return (
      <EcranComptes
        comptes={comptesChoisissables}
        jeux={games ?? []}
        compteActif={compte ?? null}
        online={online}
        onChoisir={choisirCompte}
        onAjouter={() => { setChoixCompte(false); setAjoutCompte(true); setCompteOuvert(true) }}
        onFermer={choixCompte ? () => setChoixCompte(false) : undefined}
      />
    )
  }

  return (
    <div className={`app ${hideBars ? 'bars-hidden' : ''} ${scrolled ? 'scrolled' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" width="32" height="32" />
          {/* Le nom de l'app cède la place au nom de l'écran dès qu'on défile : le grand
              titre est alors sorti de l'écran, et « Kalyx » n'apprend rien à personne. */}
          <span className="brand-swap">
            <span className="brand-name">Kalyx</span>
            {/* Redite visuelle du titre de l'écran (déjà annoncé par le <h1> ou l'en-tête
                de l'écran ouvert) → masqué aux lecteurs d'écran pour ne pas l'énoncer 2×. */}
            <span className="brand-screen" aria-hidden="true">
              {screenTitle}
            </span>
          </span>
        </div>
        <div className="topbar-right">
          {/* Un état normal ne s'annonce pas : rien quand tout va bien. Hors ligne, la
              bannière explicative est déjà là en haut de page → la pastille ne prend le
              relais qu'une fois qu'on a défilé (sinon l'info s'affiche deux fois). */}
          {!online && scrolled && (
            <span className="net net-off">
              <i /> Hors ligne
            </span>
          )}

          {/* Ajouter un jeu : une action délibérée et occasionnelle — elle cède la zone du
              pouce à Chwazi et monte ici. Absente des Stats, où elle n'a pas de sens. */}
          {!statsOpen && !settingsOpen && !compteOuvert && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setEditing('new')}
              disabled={!online || games === null}
              title={online ? 'Ajouter un jeu' : 'Indisponible hors ligne'}
              aria-label="Ajouter un jeu"
            >
              <PlusIcon size={20} />
            </button>
          )}
          {/* Le compte a sa propre porte, à côté des réglages : c'est une identité, pas
              un paramètre. Les Réglages ne parlent plus de comptes du tout. */}
          <button
            type="button"
            className={`icon-btn ${compteOuvert ? 'active' : ''}`}
            onClick={() => {
              // ⚠️ On NE ferme PAS les Stats : le menu Compte est une SURCOUCHE (le rendu le
              // teste avant), et le refermer doit ramener là où l on était. Le fermer ici
              // faisait retomber le bac sur la vue de dessous (« la tap bar revient vers
              // wishlist sans raison ») — et déséquilibrait l historique : la couche s ouvrait
              // sans pousser d entrée (net 0) mais en consommait une en se refermant.
              setCompteOuvert((v) => !v)
              setSettingsOpen(false)
              setPlayersOpen(false) // sinon la couche resterait comptée, invisible
            }}
            aria-label="Compte"
          >
            {compteLigne ? <Avatar compte={compteLigne} jeux={games ?? []} taille={22} /> : <PlayersIcon size={20} />}
          </button>
          <button
            type="button"
            className={`icon-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => {
              // Même raison qu au-dessus : refermer les Réglages ramène à l écran d où l on
              // vient, Stats compris.
              setSettingsOpen((s) => !s)
              setCompteOuvert(false)
              setPlayersOpen(false) // idem : refermer les Réglages referme leur sous-écran
            }}
            aria-label="Réglages"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </header>

      {!online && (
        <p className="banner">Hors ligne : lecture seule. Reconnectez-vous pour ajouter ou modifier.</p>
      )}
      {error && <p className="banner banner-err">{error}</p>}
      {ascActif && <Ascenseur ref={lettreRef} cle={ancresAsc ? sort : null} />}

      {toast && (
        <div className={`toast${toast.fait ? ' toast-fait' : ''}`} role="status" onClick={() => setToast(null)}>
          <span className="toast-ico" aria-hidden="true">
            {toast.fait ? <CrownIcon size={18} /> : <CheckIcon size={16} />}
          </span>
          {toast.fait ? (
            <span className="toast-corps">
              <span className="toast-titre">{toast.fait.titre}</span>
              <span className="toast-sous">{[toast.fait.sous, toast.texte].filter(Boolean).join(' · ')}</span>
            </span>
          ) : (
            toast.texte
          )}
        </div>
      )}

      {compteOuvert ? (
        <EcranCompte
          compte={compteLigne}
          jeux={games ?? []}
          online={online}
          creation={ajoutCompte}
          // ⚠️ On ne ferme RIEN : l'écran des avatars est une couche par-dessus, et le retour doit
          // ramener là où l'on était — c'est-à-dire ici, le menu Compte.
          onChangerCompte={() => setChoixCompte(true)}
          onEnregistrer={(nom, ini, couleur, avatar, origine) => {
            if (!origine) {
              // Une création qui se contente de refermer le formulaire laisse l'écran sur le compte
              // PRÉCÉDENT, sans un mot : on annonce, et on ramène là où l'on voit tous les comptes.
              // ⚠️ Seulement SI ELLE A ABOUTI — sinon on reste ici, où le bandeau d'erreur est monté.
              handleAddOwner(nom, ini, couleur, avatar).then((ok) => {
                if (!ok) return
                showToast(`Compte « ${nom} » créé.`)
                setCompteOuvert(false)
                setChoixCompte(true)
              })
              setAjoutCompte(false)
              return
            }
            else if (nom !== origine.name) handleRenameOwner(origine.id, origine.name, nom, { initials: ini, color: couleur, avatar })
            else handleUpdateOwner(origine.id, { initials: ini, color: couleur, avatar })
            setAjoutCompte(false)
          }}
          onAnnulerCreation={() => setAjoutCompte(false)}
          onSupprimer={(c) => setConfirmingOwner(c)}
          onClose={() => { setCompteOuvert(false); setAjoutCompte(false) }}
        />
      ) : settingsOpen && playersOpen ? (
        <Suspense fallback={null}>
          <PlayersManager
            roster={playerRoster}
            busy={renamingPlayer}
            online={online}
            onRename={handleRenamePlayer}
            onClose={() => setPlayersOpen(false)}
          />
        </Suspense>
      ) : settingsOpen ? (
        <Suspense fallback={null}>
          <Settings
            tags={tagsList}
            onAddTag={handleAddTag}
            onUpdateTag={handleUpdateTag}
            onRenameTag={handleRenameTag}
            onDeleteTag={(tag) => setConfirmingTag(tag)}
            onExport={handleExport}
            onExportCsv={handleExportCsv}
            onImportFile={handleImportFile}
            backupFreq={backupFreq}
            onSetBackupFreq={handleSetBackupFreq}
            backups={backupsList}
            backupBusy={backupBusy}
            onBackupNow={handleBackupNow}
            onRestore={(b) => {
              setRestoring(b)
              // On calcule ce qui serait détruit AVANT de demander confirmation.
              setRestorePlan(null)
              restorePreview(b.id)
                .then(setRestorePlan)
                .catch(() => setRestorePlan({ games: 0, plays: 0, sheets: 0, names: [], owners: [], tags: [] }))
            }}
            onOpenPlayers={handleOpenPlayers}
            onRejouerIndice={reArmeRappel}
            onEnterCode={() => setCodeAsk(true)}
            onChangeCode={() => setCodeChange(true)}
            deviceAuthorized={authorized}
            online={online}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : (
        <>
      {/* Titre d'écran (comme « Ta bibliothèque » chez Spotify) : grand, à gauche, avec le
          compteur en sous-titre discret — l'écran principal n'avait aucun titre avant. */}
      <div className="screen-head">
        <div className="screen-head-text">
          <h1 className="screen-title">{screenTitle}</h1>
          {!statsOpen && games !== null && <p className="screen-count">{countLabel}</p>}
        </div>
        {/* Bascule liste / grille : on montre l’icône de la vue vers laquelle on va.
            Absente en wishlist, où la grille est interdite. */}
        {!statsOpen && (
          <button
            type="button"
            className="layout-btn"
            onClick={() => {
              const v = layout === 'grille' ? 'liste' : 'grille'
              setLayouts((l) => ({ ...l, [listStatus]: v }))
              saveLayout(listStatus, v)
            }}
            title={layout === 'grille' ? 'Afficher en liste' : 'Afficher en grille'}
            aria-label={layout === 'grille' ? 'Afficher en liste' : 'Afficher en grille'}
          >
            {layout === 'grille' ? <ListIcon size={20} /> : <GridIcon size={20} />}
          </button>
        )}
      </div>
      {/* Ligne 1 : recherche + tri côte à côte. Le tri est à DROITE de la recherche pour
          libérer toute la ligne 2 aux puces de filtres (qui doivent toutes rester visibles).
          MASQUÉE sur l'onglet Stats (chercher un jeu n'y a pas de sens — retour user) ;
          le menu de filtres (bouton flottant) y reste disponible. */}
      {!statsOpen && (
      <div className="controls">
        <div className="input-clear search-wrap">
          <input
            className="search"
            type="text"
            enterKeyHint="search"
            placeholder="Rechercher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Entrée → on retire le focus, ce qui masque le clavier sur mobile.
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
          {search && (
            <button type="button" className="clear-btn" onClick={() => setSearch('')} aria-label="Effacer la recherche">×</button>
          )}
        </div>
        {!statsOpen && (
          <div className="sortwrap">
            <SortMenu
              value={sort}
              options={sortOptions}
              onChange={(v) => {
                setSort(v)
                if (v === 'random') setShuffleSeed((s) => s + 1) // reclic sur "Aléatoire" → nouveau mélange
              }}
            />
            {sort === 'random' ? (
              // En tri aléatoire : le bouton devient un dé pour re-mélanger à volonté.
              <button
                type="button"
                className="sortdir sortdir-die"
                onClick={() => setShuffleSeed((s) => s + 1)}
                title="Re-mélanger"
                aria-label="Re-mélanger"
              >
                <DieIcon size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="sortdir"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                title={sortDir === 'asc' ? 'Croissant (cliquer pour décroissant)' : 'Décroissant (cliquer pour croissant)'}
                aria-label="Sens du tri"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* Ligne 2 : les puces de filtres actifs (toutes visibles, elles passent à la ligne).
          Le compteur de jeux vit désormais sous le titre d'écran. Sur l'onglet Stats, les
          puces descendent SOUS l'anecdote et le bouton Tierlists (rendues par <Stats/>). */}
      {!statsOpen && activeChipsEl && <div className="controls-row2">{activeChipsEl}</div>}

      {/* Filtres en MENU FLOTTANT (ouvert par le bouton flottant) : bloque l'arrière-plan. */}
      {showFilters && (
        <FilterSheet
          resetCount={activeFilterCount - (filters.owners.length ? 1 : 0)}
          visibleLabel={
            filterShownCount === 0 ? 'Aucun jeu' : filterShownCount === 1 ? 'Voir le jeu' : `Voir les ${filterShownCount} jeux`
          }
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
          closeRef={filterCloseRef}
        >
          <Filters
            owners={allOwners}
            tags={allTags}
            filters={filters}
            setFilters={setFilters}
            showPrice={!statsOpen && view === 'wishlist'}
            showTags={statsOpen || view !== 'wishlist'}
          />
        </FilterSheet>
      )}

      <div className="view-swap" key={tabKey}>
      {statsOpen ? (
        <Suspense fallback={null}>
          <Stats
            games={games === null ? null : statsGames}
            hasCollection={hasCollection}
            playerOverall={playerOverall}
            onOpenTierlists={handleOpenTierlists}
            anecdote={anecShown}
            chips={activeChipsEl}
            onFilter={(patch, label) => {
              // On applique le filtre SANS changer de vue (les Stats se mettent à jour d'elles-mêmes)
              // et on confirme par un toast.
              setFilters((f) => ({ ...f, ...patch }))
              showToast(label ? `Filtre appliqué : ${label}` : 'Filtre appliqué')
            }}
          />
        </Suspense>
      ) : (
      <main className={`list${grille ? ' list-grid' : ''}`} ref={listRef}>
        {games === null || booting ? (
          Array.from({ length: grille ? 9 : 5 }).map((_, i) =>
            grille ? <div key={i} className="gtile-skeleton sk" /> : <SkeletonCard key={i} />
          )
        ) : visible.length === 0 ? (
          <div className="empty">
            <p className="empty-emoji">🎲</p>
            <p>
              {currentCount > 0
                ? 'Aucun jeu ne correspond à votre recherche ou à vos filtres.'
                : !online
                ? 'Hors ligne — reconnectez-vous une fois pour charger votre liste.'
                : view === 'wishlist'
                ? 'Votre wishlist est vide pour l’instant.'
                : 'Aucun jeu pour l’instant.'}
            </p>
            {currentCount === 0 && online && (
              <p className="muted">Touchez le bouton + pour ajouter un jeu à {view === 'wishlist' ? 'votre wishlist' : 'votre collection'}.</p>
            )}
          </div>
        ) : (
          visible.map((g, i) =>
            grille ? (
              <GameTile
                key={g.id}
                game={g}
                index={i}
                // Le rappel mensuel du geste : la PREMIÈRE tuile seulement — toute la grille
                // qui ondule serait une démonstration, pas un rappel.
                demo={rappelGlisse && i === 0}
                online={online}
                onBgg={
                  g.bgg_id && online
                    ? () => window.open(`https://boardgamegeek.com/boardgame/${g.bgg_id}`, '_blank', 'noopener')
                    : undefined
                }
                onNewPlay={view !== 'wishlist' && online ? () => handleNewPlayFromCard(g) : undefined}
                onMove={view === 'wishlist' ? () => setMoving(g) : undefined}
                onEdit={view === 'wishlist' ? () => setEditing(g) : undefined}
                ownerMap={ownerMap}
                tagMap={tagMap}
                compte={compte ?? null}
                onCardClick={
                  !online
                    ? undefined
                    : view === 'wishlist'
                    ? () => window.open(philibertSearchUrl(g.name), '_blank', 'noopener')
                    : () => setDetailGame(g)
                }
                metaLine={tileSortLabel(g)}
              />
            ) : (
            <GameCard
              key={g.id}
              game={g}
              index={i}
              demo={rappelGlisse && i === 0}
              online={online}
              // ⚠️ Le crayon n existe QU EN WISHLIST : en collection le tap ouvre la fiche, qui
              // porte déjà « Éditer ». Passer onEdit partout le faisait apparaître en collection
              // dès que « Nouvelle partie » manquait — hors ligne, par exemple.
              onEdit={view === 'wishlist' ? () => setEditing(g) : undefined}
              onMove={view === 'wishlist' ? () => setMoving(g) : undefined}
              // Liens/fonctions réseau désactivés hors ligne (BGG, Philibert, fiches de score).
              onBgg={g.bgg_id && online ? () => window.open(`https://boardgamegeek.com/boardgame/${g.bgg_id}`, '_blank', 'noopener') : undefined}
              onNewPlay={view !== 'wishlist' && online ? () => handleNewPlayFromCard(g) : undefined}
              onCardClick={
                !online
                  ? undefined
                  : view === 'wishlist'
                  ? () => window.open(philibertSearchUrl(g.name), '_blank', 'noopener')
                  : () => setDetailGame(g) // collection → la « fiche jeu » (hub : partie, historique, édition, BGG…)
              }
              compte={compte ?? null}
              onImageClick={(url) => setZoomImage(url)}
              // Quand on trie par une info absente des cartes, on l'affiche dessus.
              metaLine={
                sort === 'lastplayed'
                  ? <><ClockIcon size={13} /> {playMeta[g.id]?.last ? `Dernière partie : ${formatDay(playMeta[g.id].last)}` : 'Jamais jouée'}</>
                  : sort === 'plays'
                  ? <><DieIcon size={13} /> {playMeta[g.id]?.count ? `${playMeta[g.id].count} partie${playMeta[g.id].count > 1 ? 's' : ''} jouée${playMeta[g.id].count > 1 ? 's' : ''}` : 'Jamais jouée'}</>
                  : null
              }
              ownerMap={ownerMap}
              tagMap={tagMap}
              hasSheet={!!(scoresheets && scoresheets[g.id])}
            />
            )
          )
        )}
      </main>
      )}
      </div>

      {/* Filtre = bouton principal en bas (partout où filtrer a un sens : liste ET stats). Marche hors ligne. */}
      <button
        className="fab fab-filter"
        onClick={() => setShowFilters(true)}
        title="Filtrer les jeux"
        aria-label="Filtrer les jeux"
      >
        <FilterIcon size={22} color="currentColor" />
        {badgeCount > 0 && <span className="fab-badge">{badgeCount}</span>}
      </button>
      {/* Chwazi prend la place du « + » : la meilleure zone de l'écran revient à ce qu'on
          fait le plus souvent. Contrairement aux autres boutons flottants, il ne s'efface
          PAS au défilement — c'est justement en parcourant sa collection qu'on se demande
          qui commence (même exemption que les filtres des écrans plein écran). */}
      <button
        className="fab fab-chwazi"
        onClick={() => { enterFullscreen(); setChwaziOpen(true) }}
        title="Chwazi — qui commence ?"
        aria-label="Chwazi"
      >
        <ChwaziIcon size={34} />
      </button>
        </>
      )}

      {/* Fiche jeu (hub) : rendue AVANT les sous-écrans (form, historique, saisie, zoom) pour
          qu'ils s'empilent au-dessus (même z-index → l'ordre du DOM décide). */}
      {detailLayer.mounted && (
        <GameDetail
          game={detailLayer.value}
          closing={detailLayer.closing}
          online={online}
          hasSheet={Boolean(scoresheets?.[detailLayer.value.id])}
          playCount={playMeta[detailLayer.value.id]?.count ?? 0}
          lastPlayedLabel={playMeta[detailLayer.value.id]?.last ? formatDay(playMeta[detailLayer.value.id].last) : null}
          ownerMap={ownerMap}
          tagMap={tagMap}
          fait={dernierFait?.gameId === detailLayer.value.id ? dernierFait : null}
          verdict={verdictFiche}
          siblings={visible}
          onNavigate={(g) => setDetailGame((d) => (d ? g : d))} // naviguer exige une fiche OUVERTE
          onClose={() => setDetailGame(null)}
          onNewPlay={() => handleNewPlayFromCard(detailLayer.value)}
          onStats={() => openHistory(detailLayer.value, 'stats')}
          onHistory={() => openHistory(detailLayer.value, 'plays')}
          onCreateSheet={() => setEditingSheet(detailLayer.value)}
          onEdit={() => setEditing(detailLayer.value)}
          onBgg={detailLayer.value.bgg_id && online ? () => window.open(`https://boardgamegeek.com/boardgame/${detailLayer.value.bgg_id}`, '_blank', 'noopener') : undefined}
        />
      )}

      {editing && (
        <GameForm
          game={editing === 'new' ? null : editing}
          owners={allOwners}
          tags={allTags}
          existingGames={games ?? []}
          saving={saving}
          defaultStatus={listStatus}
          defaultOwner={compte ?? null}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' ? () => setConfirming(editing) : undefined}
          closeRef={formCloseRef}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Supprimer ce jeu ?"
          message={(() => {
            // Les parties et la fiche sont supprimées en cascade par la base : on le dit.
            const n = playMeta[confirming.id]?.count || 0
            const sheet = Boolean(scoresheets?.[confirming.id])
            const plusieurs = n + (sheet ? 1 : 0) > 1 // « parties » et « fiche » sont féminins
            return (
              <>
                <strong>{confirming.name}</strong> sera définitivement retiré de la base.
                {(n > 0 || sheet) && (
                  <>
                    {' '}⚠️ {n > 0 && <>ses <strong>{n} partie{n > 1 ? 's' : ''} enregistrée{n > 1 ? 's' : ''}</strong></>}
                    {n > 0 && sheet ? ' et ' : ''}
                    {sheet && <>sa <strong>fiche de score</strong></>}
                    {plusieurs ? ' seront supprimées' : ' sera supprimée'} aussi.
                  </>
                )}
              </>
            )
          })()}
          confirmLabel="Supprimer"
          busy={deletingBusy}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirmingOwner && (
        <ConfirmDialog
          title="Supprimer ce compte ?"
          message={<><strong>{confirmingOwner.name}</strong> sera retiré de la liste des comptes. Les jeux qui lui sont associés ne seront pas supprimés.</>}
          confirmLabel="Supprimer"
          busy={deletingOwnerBusy}
          onConfirm={handleConfirmDeleteOwner}
          onCancel={() => setConfirmingOwner(null)}
        />
      )}

      {confirmingTag && (
        <ConfirmDialog
          title="Supprimer ce tag ?"
          message={<><strong>{confirmingTag.name}</strong> sera retiré de la liste des tags. Les jeux qui le portent ne seront pas supprimés.</>}
          confirmLabel="Supprimer"
          busy={deletingTagBusy}
          onConfirm={handleConfirmDeleteTag}
          onCancel={() => setConfirmingTag(null)}
        />
      )}

      {moving && (
        <ConfirmDialog
          title="Déplacer vers la collection ?"
          message={<><strong>{moving.name}</strong> passera de votre wishlist à votre collection.</>}
          confirmLabel="Déplacer"
          danger={false}
          busy={movingBusy}
          onConfirm={handleConfirmMove}
          onCancel={() => setMoving(null)}
        />
      )}

      {importing && (
        <ConfirmDialog
          title="Importer cette sauvegarde ?"
          message={
            <>
              <strong>{importing.games.length}</strong> jeu{importing.games.length > 1 ? 'x' : ''}
              {importing.owners.length > 0 && <> et <strong>{importing.owners.length}</strong> compte{importing.owners.length > 1 ? 's' : ''}</>} vont être importés.
              Les jeux déjà présents (même identifiant) seront mis à jour.
            </>
          }
          confirmLabel="Importer"
          danger={false}
          busy={importBusy}
          onConfirm={handleConfirmImport}
          onCancel={() => setImporting(null)}
        />
      )}

      {restoring && (
        <ConfirmDialog
          title="Restaurer cette sauvegarde ?"
          message={
            <>
              L'état de cette sauvegarde (<strong>{restoring.games_count}</strong> jeu{restoring.games_count > 1 ? 'x' : ''})
              va <strong>remplacer</strong> votre collection actuelle.
              {restorePlan == null ? (
                <> Vérification de ce qui sera supprimé…</>
              ) : restorePlan.games === 0 ? (
                <> Aucun jeu ne sera supprimé.</>
              ) : (
                <>
                  {' '}⚠️ <strong>{restorePlan.games} jeu{restorePlan.games > 1 ? 'x' : ''}</strong> ajouté{restorePlan.games > 1 ? 's' : ''} depuis
                  {restorePlan.plays > 0 && <>, avec <strong>{restorePlan.plays} partie{restorePlan.plays > 1 ? 's' : ''} enregistrée{restorePlan.plays > 1 ? 's' : ''}</strong></>}
                  {restorePlan.sheets > 0 && <> et {restorePlan.sheets} fiche{restorePlan.sheets > 1 ? 's' : ''} de score</>}
                  {' '}: tout cela sera supprimé.
                  {restorePlan.names.length > 0 && <> ({restorePlan.names.slice(0, 5).join(', ')}{restorePlan.names.length > 5 ? '…' : ''})</>}
                </>
              )}
              {/* Les comptes et tags supprimés sont maintenant NOMMÉS : la phrase générique
                  ne disait ni combien ni lesquels. */}
              {restorePlan != null && (restorePlan.owners?.length || restorePlan.tags?.length) ? (
                <>
                  {' '}Seront aussi retirés :{' '}
                  <strong>{[...(restorePlan.owners ?? []), ...(restorePlan.tags ?? [])].join(', ')}</strong>.
                </>
              ) : (
                <> Les comptes et tags absents de cette sauvegarde seront aussi retirés.</>
              )}
              {' '}Une sauvegarde de l'état actuel sera créée avant, pour pouvoir revenir en arrière.
            </>
          }
          confirmLabel="Restaurer"
          busy={restoreBusy}
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoring(null)}
        />
      )}

      {confirmingPlay && (
        <ConfirmDialog
          title="Supprimer cette partie ?"
          message={<>Cette partie sera retirée de l'historique et des statistiques.</>}
          confirmLabel="Supprimer"
          onConfirm={handleConfirmDeletePlay}
          onCancel={() => setConfirmingPlay(null)}
        />
      )}

      {confirmingTierlist && (
        <ConfirmDialog
          title="Supprimer cette tierlist ?"
          message={<>La tierlist{tierlistView?.player ? <> de <b>{tierlistView.player}</b></> : ''} sera définitivement supprimée.</>}
          confirmLabel="Supprimer"
          onConfirm={handleConfirmDeleteTierlist}
          onCancel={() => setConfirmingTierlist(false)}
        />
      )}

      <NavBar
        // Un écran plein par-dessus le bac ⇒ aucun onglet actif : le bac ne décrit plus ce
        // qu on regarde. (Les Stats restent marquées si elles sont l écran DE DESSOUS.)
        view={compteOuvert || settingsOpen ? null : statsOpen ? 'stats' : view}
        onChange={(v) => {
          // Un tap sur le bac remonte TOUJOURS en haut de la page — y compris sur Stats, qui
          // n'y avait jamais eu droit (sa branche sortait avant le scroll). En douceur quand
          // on est déjà sur l'écran (c'est le geste « retour en haut »), sec quand on en
          // change (le contenu est remplacé, une glissade n'aurait rien à suivre).
          const dejaLa =
            v === 'stats'
              ? statsOpen && !settingsOpen && !compteOuvert
              : !statsOpen && !settingsOpen && !compteOuvert && v === view
          window.scrollTo({ top: 0, behavior: dejaLa ? 'smooth' : 'auto' })
          // ⚠️ Le bac ferme TOUT écran plein, pas seulement les Réglages : le menu Compte et
          // l écran Joueurs sont rendus dans la même branche du rendu. Sans ça, taper un
          // onglet depuis le menu Compte ne faisait RIEN à l écran (la navigation avait bien
          // lieu, mais derrière l écran resté ouvert). Et `playersOpen` laissé à true rouvrait
          // les Réglages directement sur l écran Joueurs, la fois suivante.
          const fermeLesEcransPleins = () => {
            setCompteOuvert(false)
            setAjoutCompte(false)
            setPlayersOpen(false)
            setSettingsOpen(false)
          }
          if (v === 'stats') {
            setStatsOpen(true)
            fermeLesEcransPleins()
            return
          }
          fermeLesEcransPleins()
          setStatsOpen(false)
          if (v === view) return
          goToView(v)
        }}
      />

      {chwaziOpen && (
        <Suspense fallback={null}>
          <Chwazi onClose={() => setChwaziOpen(false)} />
        </Suspense>
      )}

      {historyLayer.mounted && (
        <Suspense fallback={null}>
          <GameHistory
            key={historyLayer.value.id}
            game={historyLayer.value}
            closing={historyLayer.closing}
            plays={gamePlays}
            template={scoresheets?.[historyLayer.value.id]}
            online={online}
            view={historyView}
            onEditPlay={online ? handleEditPlay : undefined}
            onEditSheet={() => setEditingSheet(historyLayer.value)}
            onDeletePlay={(pl) => setConfirmingPlay(pl)}
            onClose={() => setHistoryGame(null)}
          />
        </Suspense>
      )}

      {tlHubLayer.mounted && (
        <Suspense fallback={null}>
          <TierlistHub
            tierlists={tierlists}
            online={online}
            closing={tlHubLayer.closing}
            onOpenGlobal={handleOpenGlobalTierlist}
            onOpenTierlist={handleOpenTierlist}
            onCreate={handleCreateTierlist}
            onClose={() => setTierlistHub(false)}
          />
        </Suspense>
      )}

      {tlViewLayer.mounted && (
        <Suspense fallback={null}>
          <TierlistView
            key={tlViewLayer.value.mode + (tlViewLayer.value.id || 'new')}
            mode={tlViewLayer.value.mode}
            title={tlViewLayer.value.title}
            initialRanking={tlViewLayer.value.ranking}
            unranked={tlViewLayer.value.unranked}
            initialPlayer={tlViewLayer.value.player}
            closing={tlViewLayer.closing}
            filters={filters}
            setFilters={setFilters}
            onResetFilters={resetFilters}
            savedId={tlViewLayer.value.id}
            games={collectionGames}
            allOwners={allOwners}
            allTags={allTags}
            playerNames={playerNames}
            online={online}
            onClose={() => setTierlistView(null)}
            onSave={handleSaveTierlist}
            onDelete={() => setConfirmingTierlist(true)}
          />
        </Suspense>
      )}

      {scoringLayer.mounted && scoresheets && scoresheets[scoringLayer.value.id] && (
        <Suspense fallback={null}>
          <ScoreSheet
            key={scoringLayer.value.id + '-' + (editingPlay ? editingPlay.id : 'new')}
            game={scoringLayer.value}
            closing={scoringLayer.closing}
            template={scoresheets[scoringLayer.value.id]}
            initialPlay={editingPlay}
            playerNames={playerNames}
            scenarioNames={scenarioNames}
            dirtyRef={scoringDirtyRef}
            saving={savingPlay}
            onSavePlay={handleSavePlay}
            onEdit={() => setEditingSheet(scoringLayer.value)}
            onClose={requestCloseScoring}
          />
        </Suspense>
      )}

      {scoreExitConfirm && (
        <ConfirmDialog
          title="Quitter sans enregistrer ?"
          message="La partie en cours de saisie sera perdue."
          confirmLabel="Quitter"
          // Les deux boutons n'ont plus de comptabilité à faire : le `pointerdown` de ce tap a déjà
          // remboursé la dette (écouteur en CAPTURE, donc avant le clic). « Quitter » ferme la saisie et
          // la synchro consomme son entrée normalement ; « Annuler » ne change aucune couche.
          onConfirm={() => {
            setScoreExitConfirm(false)
            setScoringGame(null)
          }}
          onCancel={() => setScoreExitConfirm(false)}
        />
      )}

      {editSheetLayer.mounted && (
        <Suspense fallback={null}>
          <ScoreSheetEditor
            key={editSheetLayer.value.id}
            game={editSheetLayer.value}
            closing={editSheetLayer.closing}
            template={scoresheets ? scoresheets[editSheetLayer.value.id] : null}
            online={online}
            onSave={handleSaveSheet}
            dirtyRef={sheetDirtyRef}
            onClose={requestCloseSheet}
          />
        </Suspense>
      )}

      {sheetExitConfirm && (
        <ConfirmDialog
          title="Quitter sans enregistrer ?"
          message="La fiche en cours ne sera pas enregistrée."
          confirmLabel="Quitter"
          onConfirm={() => {
            setSheetExitConfirm(false)
            intentionFicheRef.current = null
            setEditingSheet(null)
          }}
          onCancel={() => setSheetExitConfirm(false)}
        />
      )}

      {zoomImage && <ImageZoom src={zoomImage} onClose={() => setZoomImage(null)} />}

      {codeAsk && (
        <CodeDialog
          onDone={() => {
            setAuthorized(true)
            setCodeAsk(false)
            showToast('Appareil autorisé.')
          }}
          onClose={() => {
            codeDismissedRef.current = true
            setCodeAsk(false)
          }}
        />
      )}

      {codeChange && (
        <ChangeCodeDialog
          onDone={() => {
            setCodeChange(false)
            showToast('Code changé. Les autres appareils devront le re-saisir.')
          }}
          onClose={() => setCodeChange(false)}
        />
      )}
    </div>
  )
}
