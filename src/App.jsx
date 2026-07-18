import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { isConfigured } from './lib/supabase'
import { fetchGames, addGame, updateGame, deleteGame, cleanGameInput, parseOwners, parseTags, effectivePlayersSet, effectiveBestSet, extensionNames } from './lib/games'
import { saveGamesCache, loadGamesCache } from './lib/cache'
import { fetchOwners, addOwner, updateOwner, deleteOwner } from './lib/owners'
import { fetchTags, addTag, updateTag, deleteTag } from './lib/tags'
import { downloadBackup, downloadCsv, parseBackup, importBackup, fetchBackups, createBackup, maybeAutoBackup, restoreBackup, restorePreview } from './lib/backup'
import { philibertSearchUrl } from './lib/philibert'
import { fetchScoresheets, saveScoresheet } from './lib/scoresheets'
import { fetchPlays, savePlay, updatePlay, deletePlay, fetchPlayerNames, fetchPlayCounts, renameCategories, fetchPlayerRoster, fetchPlayerOverall, renamePlayer } from './lib/plays'
import GameCard from './components/GameCard'
import GameForm from './components/GameForm'
import ConfirmDialog from './components/ConfirmDialog'
import SortMenu from './components/SortMenu'
import Filters from './components/Filters'
import ImageZoom from './components/ImageZoom'
// Écrans lourds ou rarement ouverts : chargés à la demande (allège le bundle de départ ;
// le scanner embarque ZXing, ~470 Ko, inutile tant qu'on ne scanne pas).
const Settings = lazy(() => import('./components/Settings'))
const PlayersManager = lazy(() => import('./components/PlayersManager'))
const Stats = lazy(() => import('./components/Stats'))
const Chwazi = lazy(() => import('./components/Chwazi'))
const BarcodeScanner = lazy(() => import('./components/BarcodeScanner'))
const ScoreSheet = lazy(() => import('./components/ScoreSheet'))
const ScoreSheetEditor = lazy(() => import('./components/ScoreSheetEditor'))
const GameHistory = lazy(() => import('./components/GameHistory'))
import SkeletonCard from './components/SkeletonCard'
import { enterFullscreen } from './lib/fullscreen'
import NavBar from './components/NavBar'
import { SettingsIcon, ChwaziIcon, BarcodeIcon } from './components/icons'

// Bornes du slider de prix (doit correspondre à Filters.jsx).
const PRICE_MIN = 0
const PRICE_MAX = 150
const EMPTY_FILTERS = {
  owners: [],
  tags: [], // tags cochés
  tagsOnly: false, // si vrai : n'afficher que les jeux ayant l'un des tags cochés
  players: [], // cases cochées (nombres de joueurs), vide = pas de filtre
  playerOptimal: false,
  duration: null, // seuil "moins de X min" choisi (15|30|60) ou null
  priceRange: [PRICE_MIN, PRICE_MAX],
  complexity: [],
}

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

// Bucket de complexité d'un jeu (pour le filtre).
function complexityBucket(c) {
  if (c == null) return null
  const n = Number(c)
  return n < 2 ? 'simple' : n < 3 ? 'moyen' : 'complexe'
}

// Enlève les accents et met en minuscules, pour une recherche tolérante.
// (̀-ͯ = les marques d'accent que NFD sépare des lettres)
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s) => (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase()

// Un jeu passe-t-il la recherche + les filtres ? (prédicat partagé entre la liste
// Collection/Wishlist et l'onglet Stats, pour que les deux réagissent aux MÊMES filtres.)
// `includePrice` : n'applique le filtre prix que dans la Wishlist (sans objet ailleurs).
function passesFilters(g, filters, q, includePrice, applyTags = true) {
  // Recherche : nom OU noms d'extensions.
  if (q && !(norm(g.name).includes(q) || norm(extensionNames(g.extensions).join(' ')).includes(q))) return false

  // Propriétaire (les jeux sans propriétaire restent toujours visibles).
  if (filters.owners.length) {
    const os = parseOwners(g.owner)
    if (!(os.length === 0 || os.some((o) => filters.owners.includes(o)))) return false
  }

  // Tags : masqués par défaut (voir la logique détaillée plus bas dans le composant).
  // Ignoré en wishlist (les jeux à acheter n'ont pas de tag → le filtre n'a pas de sens).
  if (applyTags) {
    if (filters.tagsOnly && filters.tags.length) {
      if (!parseTags(g.tags).some((t) => filters.tags.includes(t))) return false
    } else {
      const ts = parseTags(g.tags)
      if (!(ts.length === 0 || ts.some((t) => filters.tags.includes(t)))) return false
    }
  }

  // Pour chaque filtre : un jeu SANS valeur dans ce champ reste TOUJOURS affiché.
  if (filters.players.length) {
    const set = filters.playerOptimal ? effectiveBestSet(g) : effectivePlayersSet(g)
    if (!(set.length === 0 || set.some((v) => filters.players.includes(v)))) return false
  }
  if (filters.duration != null) {
    const dur = g.duration_max ?? g.duration_min
    if (!(dur == null || dur <= filters.duration)) return false
  }
  if (filters.complexity.length) {
    const b = complexityBucket(g.complexity)
    if (!(b == null || filters.complexity.includes(b))) return false
  }
  if (includePrice) {
    const [prlo, prhi] = filters.priceRange
    if (prlo !== PRICE_MIN || prhi !== PRICE_MAX) {
      const hiCap = prhi >= PRICE_MAX ? Infinity : prhi
      if (!(g.price == null || (g.price >= prlo && g.price <= hiCap))) return false
    }
  }
  return true
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

const SORT_OPTIONS = [
  { value: 'name', label: 'Nom' },
  { value: 'random', label: 'Aléatoire' },
  { value: 'players', label: 'Joueurs' },
  { value: 'complexity', label: 'Complexité' },
  { value: 'duration', label: 'Durée' },
]

export default function App() {
  const [games, setGames] = useState(null) // null = en cours de chargement
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
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
  const [view, setView] = useState(() => (loadView() === 'wishlist' ? 'wishlist' : 'collection')) // 'collection' | 'wishlist'
  const [settingsOpen, setSettingsOpen] = useState(false) // écran Réglages (engrenage en haut à droite)
  const [playersOpen, setPlayersOpen] = useState(false) // écran Joueurs (renommage global)
  const [playerRoster, setPlayerRoster] = useState(null) // [{name, games}] | null = en cours
  const [renamingPlayer, setRenamingPlayer] = useState(false)
  const [statsOpen, setStatsOpen] = useState(() => loadView() === 'stats') // écran Stats
  const [playerOverall, setPlayerOverall] = useState(null) // [{name, games, wins, winRate}] tous jeux | null
  // On mémorise l'onglet (stats/collection/wishlist) pour y revenir après une actualisation.
  useEffect(() => {
    saveView(statsOpen ? 'stats' : view)
  }, [view, statsOpen])
  // Stats générales par joueur (toutes parties) : (re)chargées quand on ouvre l'onglet Stats.
  // On passe les jeux déjà en mémoire → évite de re-télécharger la liste à chaque visite.
  useEffect(() => {
    if (!statsOpen) return
    fetchPlayerOverall(games).then(setPlayerOverall).catch(() => setPlayerOverall([]))
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
  const [notice, setNotice] = useState('') // message de confirmation (vert)
  // Sauvegardes automatiques (table `backups` Supabase)
  const [backupFreq, setBackupFreq] = useState(loadBackupFreq)
  const [backupsList, setBackupsList] = useState(null) // liste des sauvegardes, ou null si table absente
  const [restoring, setRestoring] = useState(null) // sauvegarde à restaurer (confirmation) | null
  const [restorePlan, setRestorePlan] = useState(null) // ce que la restauration détruirait | null = en cours
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const autoBackupRef = useRef(false) // pour ne lancer la sauvegarde auto qu'une fois par chargement
  const [scanOpen, setScanOpen] = useState(false) // scanner de code-barres
  const [scanBusy, setScanBusy] = useState(false)
  const [scanPrefill, setScanPrefill] = useState(null) // champs pré-remplis après un scan
  const [zoomImage, setZoomImage] = useState(null) // image affichée en grand (lightbox)
  const [ownersList, setOwnersList] = useState(null) // lignes de la table owners, ou null si absente
  const [tagsList, setTagsList] = useState(null) // lignes de la table tags, ou null si absente
  const [scoresheets, setScoresheets] = useState(null) // { game_id: template }, ou null si table absente
  const [scoringGame, setScoringGame] = useState(null) // jeu en cours de notation (nouvelle partie OU édition) | null
  const [editingPlay, setEditingPlay] = useState(null) // partie en cours d'édition | null (= nouvelle partie)
  const [editingSheet, setEditingSheet] = useState(null) // jeu dont on édite/crée la fiche | null
  const [historyGame, setHistoryGame] = useState(null) // jeu dont on regarde l'historique | null
  const [gamePlays, setGamePlays] = useState(null) // parties du jeu affiché (null = chargement)
  const [playerNames, setPlayerNames] = useState([]) // noms déjà utilisés (auto-complétion)
  const [playCounts, setPlayCounts] = useState({}) // { game_id: nb de parties } (tri)
  const [savingPlay, setSavingPlay] = useState(false)
  const [confirmingPlay, setConfirmingPlay] = useState(null) // partie à supprimer | null

  // Charger les listes gérées (tables owners + tags + fiches de score).
  const reloadOwners = useCallback(() => {
    fetchOwners().then(setOwnersList)
  }, [])
  const reloadTags = useCallback(() => {
    fetchTags().then(setTagsList)
  }, [])
  useEffect(() => {
    reloadOwners()
    reloadTags()
    fetchScoresheets().then(setScoresheets).catch(() => setScoresheets(null))
    fetchPlayerNames().then(setPlayerNames).catch(() => {})
    fetchPlayCounts().then(setPlayCounts).catch(() => {})
  }, [reloadOwners, reloadTags])

  // Charge les jeux : depuis Supabase si possible (et on met en cache), sinon
  // depuis le cache local (hors ligne). Pas de message d'erreur technique.
  const loadGames = useCallback(() => {
    if (!isConfigured) {
      setError('Base non configurée (voir le README).')
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
          setError('Impossible de charger les jeux. Réessaie.')
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
  const uiRef = useRef({})
  uiRef.current = { editing, confirming, confirmingOwner, confirmingTag, moving, importing, restoring, confirmingPlay, scanOpen, chwaziOpen, editingSheet, scoringGame, historyGame, statsOpen, playersOpen, settingsOpen, zoomImage }
  const viewRef = useRef(view)
  viewRef.current = view

  // Nombre de "couches" ouvertes (fenêtres/onglets superposés).
  const layerCount =
    (editing ? 1 : 0) + (confirming ? 1 : 0) + (moving ? 1 : 0) + (confirmingOwner ? 1 : 0) + (confirmingTag ? 1 : 0) +
    (importing ? 1 : 0) + (restoring ? 1 : 0) + (confirmingPlay ? 1 : 0) + (scanOpen ? 1 : 0) + (chwaziOpen ? 1 : 0) +
    (editingSheet ? 1 : 0) + (scoringGame ? 1 : 0) + (historyGame ? 1 : 0) + (statsOpen ? 1 : 0) +
    (playersOpen ? 1 : 0) + (settingsOpen ? 1 : 0) + (zoomImage ? 1 : 0)
  const layerRef = useRef(0)

  // Change de vue en mémorisant la vue actuelle + une entrée d'historique (pour le retour).
  const goToView = useCallback((v) => {
    if (v === viewRef.current) return
    viewHistoryRef.current.push(viewRef.current)
    window.history.pushState({ kalyx: 'view' }, '')
    setView(v)
  }, [])

  // Ferme la couche du dessus (ordre de priorité). Renvoie true si quelque chose a été fermé.
  const closeTopLayer = useCallback(() => {
    const s = uiRef.current
    // L'image en grand est au-dessus de tout → on la ferme en premier.
    if (s.zoomImage) setZoomImage(null)
    // Les confirmations s'ouvrent PAR-DESSUS (form, réglages…) → on les ferme d'abord.
    else if (s.confirming) setConfirming(null)
    else if (s.moving) setMoving(null)
    else if (s.confirmingOwner) setConfirmingOwner(null)
    else if (s.confirmingTag) setConfirmingTag(null)
    else if (s.importing) setImporting(null)
    else if (s.restoring) setRestoring(null)
    else if (s.confirmingPlay) setConfirmingPlay(null)
    else if (s.editing) setEditing(null)
    else if (s.scanOpen) setScanOpen(false)
    else if (s.chwaziOpen) setChwaziOpen(false)
    else if (s.editingSheet) setEditingSheet(null)
    else if (s.scoringGame) { setScoringGame(null); setEditingPlay(null) }
    else if (s.historyGame) { setHistoryGame(null); setGamePlays(null) }
    else if (s.statsOpen) setStatsOpen(false)
    else if (s.playersOpen) setPlayersOpen(false) // s'ouvre PAR-DESSUS les Réglages
    else if (s.settingsOpen) setSettingsOpen(false)
    else return false
    return true
  }, [])

  // À l'OUVERTURE d'une couche, on ajoute UNE entrée d'historique (consommée par le retour).
  // On ne pousse qu'à l'ouverture (pas à chaque retour) → évite le throttle pushState de Firefox.
  useEffect(() => {
    for (let i = layerRef.current; i < layerCount; i++) window.history.pushState({ kalyx: 'layer' }, '')
    layerRef.current = layerCount
  }, [layerCount])

  // Bouton "retour" du téléphone : ferme la couche du dessus, sinon revient à la vue
  // précédente ; à la racine on remet une entrée pour ne jamais quitter l'app.
  useEffect(() => {
    window.history.pushState({ kalyx: 'guard' }, '')
    const onPop = () => {
      if (closeTopLayer()) return // couche fermée : l'entrée poussée à l'ouverture est consommée
      if (viewHistoryRef.current.length > 0) {
        setView(viewHistoryRef.current.pop())
        return // l'entrée de vue est consommée
      }
      window.history.pushState({ kalyx: 'guard' }, '') // racine : on ne quitte pas
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [closeTopLayer])

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
    if (games === null) return
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

  // Statut affiché selon l'onglet (Collection ou Wishlist).
  const listStatus = view === 'wishlist' ? 'wishlist' : 'collection'
  // Le tri par prix n'a de sens que dans la Wishlist.
  const sortOptions = [
    ...SORT_OPTIONS,
    view === 'wishlist' ? { value: 'price', label: 'Prix' } : { value: 'plays', label: 'Parties jouées' },
  ].sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  // Jeux de la vue courante, filtrés (recherche + filtres) puis triés.
  const visible = useMemo(() => {
    const q = norm(search)
    let list = (games ?? []).filter(
      (g) => g.status === listStatus && passesFilters(g, filters, q, view === 'wishlist', view !== 'wishlist')
    )

    // Tri
    if (sort === 'random') return [...list].sort((a, b) => shuffleRank(a.id, shuffleSeed) - shuffleRank(b.id, shuffleSeed))
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    else if (sort === 'players') list = [...list].sort((a, b) => (a.players_min ?? 99) - (b.players_min ?? 99) || (a.players_max ?? 99) - (b.players_max ?? 99))
    else if (sort === 'complexity') list = [...list].sort((a, b) => (a.complexity ?? 99) - (b.complexity ?? 99))
    else if (sort === 'duration') list = [...list].sort((a, b) => (a.duration_max ?? a.duration_min ?? 9999) - (b.duration_max ?? b.duration_min ?? 9999))
    else if (sort === 'price') list = [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    else if (sort === 'plays') list = [...list].sort((a, b) => (playCounts[a.id] || 0) - (playCounts[b.id] || 0) || a.name.localeCompare(b.name, 'fr'))
    if (sortDir === 'desc') list.reverse()
    return list
  }, [games, search, sort, sortDir, shuffleSeed, filters, listStatus, view, playCounts])

  // Largeur de la 1re colonne (joueurs/idéal) des cartes = largeur du jeu qui en prend le
  // plus → toutes les cartes partagent cette largeur (colonnes alignées).
  // ⚠️ On ne recalcule QUE quand les jeux ou l'onglet changent, pas à chaque filtrage :
  // lire les largeurs force le navigateur à refaire toute la mise en page (~20 ms mesurés
  // sur 89 cartes), ce qui rendait la frappe dans la recherche saccadée. Contrepartie
  // assumée : après un filtrage, la colonne garde la largeur calculée sur la liste
  // complète — au pire quelques pixels de trop, invisibles à l'usage.
  const listRef = useRef(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    // On mesure à largeur libre (chaque cellule prend sa largeur naturelle)…
    list.style.setProperty('--meta-left', 'max-content')
    let max = 0
    list.querySelectorAll('.m-players, .m-ideal').forEach((el) => {
      const w = el.getBoundingClientRect().width
      if (w > max) max = w
    })
    // …puis on fixe la colonne à ce maximum (repli 1fr si liste vide).
    list.style.setProperty('--meta-left', max ? `${Math.ceil(max)}px` : 'minmax(0, 1fr)')
  }, [games, listStatus])

  // Scénarios déjà utilisés pour ce jeu (auto-complétion du champ scénario).
  const scenarioNames = useMemo(
    () => [...new Set((gamePlays || []).map((p) => (p.scenario || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [gamePlays]
  )

  // Jeux (tous statuts) filtrés par la recherche + les mêmes filtres, pour les Stats.
  // computeStats sépare ensuite collection / wishlist. Le prix est ignoré ici.
  const statsGames = useMemo(() => {
    const q = norm(search)
    return (games ?? []).filter((g) => passesFilters(g, filters, q, false))
  }, [games, search, filters])

  // Y a-t-il au moins un jeu en collection (indépendamment des filtres) ? Sert à
  // distinguer « collection vide » de « aucun jeu ne correspond aux filtres » dans les Stats.
  const hasCollection = useMemo(() => (games ?? []).some((g) => g.status !== 'wishlist'), [games])

  // Nombre de filtres actifs (pour la pastille du bouton Filtres).
  const activeFilterCount =
    (filters.owners.length ? 1 : 0) +
    ((statsOpen || view !== 'wishlist') && filters.tags.length ? 1 : 0) +
    (filters.players.length ? 1 : 0) +
    (filters.duration != null ? 1 : 0) +
    (view === 'wishlist' && (filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX) ? 1 : 0) +
    (filters.complexity.length ? 1 : 0)

  const currentCount = (games ?? []).filter((g) => g.status === listStatus).length

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
      setEditing(null)
    } catch (e) {
      setError(e.message)
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
    } catch (e) {
      setError(e.message)
    } finally {
      setDeletingBusy(false)
    }
  }

  async function handleAddOwner(name, initials, color) {
    try {
      await addOwner(name, initials, color)
      reloadOwners()
    } catch (e) {
      setError(e.message)
    }
  }
  async function handleUpdateOwner(id, patch) {
    try {
      await updateOwner(id, patch)
      reloadOwners()
    } catch (e) {
      setError(e.message)
    }
  }
  async function handleConfirmDeleteOwner() {
    if (!confirmingOwner) return
    setDeletingOwnerBusy(true)
    setError(null)
    try {
      await deleteOwner(confirmingOwner.id)
      reloadOwners()
      setConfirmingOwner(null)
    } catch (e) {
      setError(e.message)
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
      setError(e.message)
    }
  }
  async function handleUpdateTag(id, patch) {
    try {
      await updateTag(id, patch)
      reloadTags()
    } catch (e) {
      setError(e.message)
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
      setError(e.message)
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
      setNotice(`Sauvegarde téléchargée : ${n.games} jeux, ${n.plays} parties, ${n.sheets} fiches de score.`)
    } catch (e) {
      setError(e.message)
    }
  }
  // Export tableur : 2 fichiers CSV (jeux, parties) ouvrables dans Excel / LibreOffice.
  async function handleExportCsv() {
    setError(null)
    const dateStr = new Date().toISOString().slice(0, 10)
    try {
      const n = await downloadCsv(games ?? [], ownersList ?? [], tagsList ?? [], dateStr)
      setNotice(`2 fichiers tableur téléchargés : ${n.games} jeux et ${n.lignesParties} lignes de parties.`)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleImportFile(file) {
    setError(null)
    setNotice('')
    try {
      const text = await file.text()
      const parsed = parseBackup(text) // { games, owners }
      setImporting(parsed)
    } catch (e) {
      setError(e.message)
    }
  }
  // Code-barres détecté → on cherche le jeu sur Philibert puis on ouvre le formulaire pré-rempli.
  const handleDetected = useCallback(
    async (code) => {
      setScanBusy(true)
      setError(null)
      try {
        const r = await fetch(`/api/price?name=${encodeURIComponent(code)}`)
        const data = await r.json()
        if (data && data.found && (data.name || data.image)) {
          setScanPrefill({
            name: data.name || '',
            image_url: data.image || '',
            price: data.price != null ? String(data.price) : '',
          })
          setNotice('')
        } else {
          setScanPrefill(null)
          setNotice('Jeu introuvable pour ce code — ajoute-le à la main.')
        }
      } catch {
        setScanPrefill(null)
        setNotice('Recherche impossible — ajoute le jeu à la main.')
      } finally {
        setScanBusy(false)
        setScanOpen(false)
        setEditing('new')
      }
    },
    []
  )

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
      setImporting(null)
      const extra = res.plays ? ` et ${res.plays} partie${res.plays > 1 ? 's' : ''}` : ''
      setNotice(`Import réussi : ${res.games} jeu${res.games > 1 ? 'x' : ''}${extra}.`)
    } catch (e) {
      setError(e.message)
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
    if (!online || games === null || ownersList === null || tagsList === null) return
    autoBackupRef.current = true
    ;(async () => {
      try {
        const res = await maybeAutoBackup(backupFreq, games, ownersList, tagsList)
        // Garde-fou : chute brutale du nombre de jeux → sauvegarde refusée, on alerte.
        // Mieux vaut une sauvegarde ancienne mais saine qu'un instantané de l'accident.
        if (res && res.skipped === 'drop') {
          setError(
            `⚠️ Sauvegarde automatique suspendue : ta collection est passée de ${res.before} à ${res.after} jeux ` +
              `(${res.lost} de moins). Si c'est normal, sauvegarde à la main dans Réglages. Sinon, tes anciennes ` +
              `sauvegardes sont intactes : tu peux restaurer.`
          )
        }
      } catch {
        /* silencieux */
      }
      reloadBackups()
    })()
  }, [online, games, ownersList, tagsList, backupFreq, reloadBackups])

  const handleSetBackupFreq = (v) => {
    setBackupFreq(v)
    saveBackupFreq(v)
  }

  async function handleBackupNow() {
    setBackupBusy(true)
    setError(null)
    try {
      const ok = await createBackup(games ?? [], ownersList ?? [], tagsList ?? [], 'manual')
      if (ok === null) setError("Lance d'abord la migration des sauvegardes (voir README).")
      else {
        await reloadBackups()
        setNotice('Sauvegarde enregistrée.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBackupBusy(false)
    }
  }

  // Clic sur une carte : ouvre l'historique des parties si le jeu a une fiche,
  // sinon l'éditeur (pour créer la fiche d'abord).
  function handleGameClick(g) {
    if (scoresheets && scoresheets[g.id]) {
      setHistoryGame(g)
      setGamePlays(null)
      fetchPlays(g.id).then((p) => setGamePlays(p || [])).catch(() => setGamePlays([]))
    } else {
      setEditingSheet(g)
    }
  }

  // Recharge les parties du jeu affiché + la liste des noms.
  const refreshHistory = (g) => {
    if (g) fetchPlays(g.id).then((p) => setGamePlays(p || [])).catch(() => {})
    fetchPlayerNames().then(setPlayerNames).catch(() => {})
    fetchPlayCounts().then(setPlayCounts).catch(() => {})
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
      setNotice(n ? `« ${to} » : ${n} partie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour.` : 'Aucune partie à mettre à jour.')
    } catch (e) {
      setError(e.message)
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
        setNotice(`Fiche enregistrée · ${n} partie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour.`)
        if (historyGame && historyGame.id === gameId) refreshHistory(historyGame)
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
      if (editingPlay) await updatePlay(editingPlay.id, play)
      else await savePlay(scoringGame.id, play)
      const g = scoringGame
      setScoringGame(null)
      setEditingPlay(null)
      refreshHistory(historyGame || g)
      setNotice(editingPlay ? 'Partie modifiée.' : 'Partie enregistrée.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingPlay(false)
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
      setError(e.message)
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
      setNotice(`Sauvegarde restaurée : ${res.games} jeux, ${res.plays} parties. Une sauvegarde de l'état précédent a été créée.`)
    } catch (e) {
      setError(e.message)
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
      setError(e.message)
    } finally {
      setMovingBusy(false)
    }
  }

  const countLabel = `${visible.length} jeu${visible.length > 1 ? 'x' : ''}`

  // Barre du haut + FAB qui s'effacent en descendant, réapparaissent en remontant
  // (plus de place sur petit écran ; les FAB ne recouvrent plus les cartes du bas).
  const [hideBars, setHideBars] = useState(false)
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y < 48) { setHideBars(false); lastY = y; return } // tout en haut → toujours visible
      const dy = y - lastY
      if (dy > 6) setHideBars(true)
      else if (dy < -6) setHideBars(false)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={`app ${hideBars ? 'bars-hidden' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" width="32" height="32" />
          <span>Kalyx</span>
        </div>
        <div className="topbar-right">
          <span className={`net ${online ? 'net-on' : 'net-off'}`}>
            <i /> {online ? 'En ligne' : 'Hors ligne'}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              enterFullscreen() // dans le geste de tap → masque la barre système dès l'entrée
              setChwaziOpen(true)
            }}
            aria-label="Chwazi"
          >
            <ChwaziIcon size={22} />
          </button>
          <button
            type="button"
            className={`icon-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => {
              setSettingsOpen((s) => !s)
              setStatsOpen(false)
            }}
            aria-label="Réglages"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </header>

      {!online && (
        <p className="banner">📴 Hors ligne : lecture seule. Reconnecte-toi pour ajouter ou modifier.</p>
      )}
      {error && <p className="banner banner-err">⚠️ {error}</p>}
      {notice && <p className="banner banner-ok" onClick={() => setNotice('')}>✅ {notice}</p>}

      {settingsOpen && playersOpen ? (
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
            owners={ownersList}
            onAddOwner={handleAddOwner}
            onUpdateOwner={handleUpdateOwner}
            onDeleteOwner={(owner) => setConfirmingOwner(owner)}
            tags={tagsList}
            onAddTag={handleAddTag}
            onUpdateTag={handleUpdateTag}
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
              restorePreview(b.id).then(setRestorePlan).catch(() => setRestorePlan({ games: 0, plays: 0, sheets: 0, names: [] }))
            }}
            onOpenPlayers={handleOpenPlayers}
            online={online}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : (
        <>
      <div className="controls">
        <div className="input-clear search-wrap">
          <input
            className="search"
            type="text"
            enterKeyHint="search"
            placeholder="Rechercher un jeu…"
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
          <button type="button" className="clear-btn" onClick={() => setSearch('')} aria-label="Effacer la recherche">×</button>
        </div>
      </div>

      <div className="controls-row2">
        <div className="row2-left">
          <button
            type="button"
            className={`filter-toggle ${activeFilterCount ? 'active' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            Filtres
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
            <span className={`filter-chev ${showFilters ? 'up' : ''}`}>▾</span>
          </button>
          {!statsOpen && <span className="count">{games === null ? '' : countLabel}</span>}
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
            <button
              type="button"
              className="sortdir"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              disabled={sort === 'random'}
              title={sortDir === 'asc' ? 'Croissant (cliquer pour décroissant)' : 'Décroissant (cliquer pour croissant)'}
              aria-label="Sens du tri"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        )}
      </div>

      {showFilters && (
        <Filters
          owners={allOwners}
          tags={allTags}
          filters={filters}
          setFilters={setFilters}
          showPrice={!statsOpen && view === 'wishlist'}
          showTags={statsOpen || view !== 'wishlist'}
          onReset={() => setFilters((f) => ({ ...EMPTY_FILTERS, owners: f.owners }))}
        />
      )}

      {statsOpen ? (
        <Suspense fallback={null}>
          <Stats games={statsGames} ownerMap={ownerMap} hasCollection={hasCollection} playerOverall={playerOverall} />
        </Suspense>
      ) : (
      <main className="list" ref={listRef}>
        {games === null ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : visible.length === 0 ? (
          <div className="empty">
            <p className="empty-emoji">🎲</p>
            <p>
              {currentCount > 0
                ? 'Aucun jeu ne correspond à ta recherche ou à tes filtres.'
                : !online
                ? 'Hors ligne — reconnecte-toi une fois pour charger ta liste.'
                : view === 'wishlist'
                ? 'Ta wishlist est vide pour l’instant.'
                : 'Aucun jeu pour l’instant.'}
            </p>
            {currentCount === 0 && online && (
              <p className="muted">Touche le bouton + pour ajouter un jeu à {view === 'wishlist' ? 'ta wishlist' : 'ta collection'}.</p>
            )}
          </div>
        ) : (
          visible.map((g, i) => (
            <GameCard
              key={g.id}
              game={g}
              index={i}
              online={online}
              onEdit={() => setEditing(g)}
              onMove={view === 'wishlist' ? () => setMoving(g) : undefined}
              // Liens/fonctions réseau désactivés hors ligne (BGG, Philibert, fiches de score).
              onBgg={g.bgg_id && online ? () => window.open(`https://boardgamegeek.com/boardgame/${g.bgg_id}`, '_blank', 'noopener') : undefined}
              onCardClick={
                !online
                  ? undefined
                  : view === 'wishlist'
                  ? () => window.open(philibertSearchUrl(g.name), '_blank', 'noopener')
                  : () => handleGameClick(g)
              }
              onImageClick={(url) => setZoomImage(url)}
              ownerMap={ownerMap}
              tagMap={tagMap}
              hasSheet={!!(scoresheets && scoresheets[g.id])}
            />
          ))
        )}
      </main>
      )}

      {!statsOpen && (
        <>
          <button
            className="fab fab-scan"
            onClick={() => setScanOpen(true)}
            disabled={!online || games === null}
            title={online ? 'Scanner un code-barres' : 'Indisponible hors ligne'}
            aria-label="Scanner un code-barres"
          >
            <BarcodeIcon size={22} />
          </button>
          <button
            className="fab"
            onClick={() => {
              setScanPrefill(null)
              setEditing('new')
            }}
            disabled={!online || games === null}
            title={online ? 'Ajouter un jeu' : 'Indisponible hors ligne'}
          >
            +
          </button>
        </>
      )}
        </>
      )}

      {editing && (
        <GameForm
          game={editing === 'new' ? null : editing}
          owners={allOwners}
          tags={allTags}
          existingGames={games ?? []}
          saving={saving}
          defaultStatus={listStatus}
          prefill={editing === 'new' ? scanPrefill : null}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' ? () => setConfirming(editing) : undefined}
        />
      )}

      {scanOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner busy={scanBusy} onDetected={handleDetected} onClose={() => setScanOpen(false)} />
        </Suspense>
      )}

      {confirming && (
        <ConfirmDialog
          title="Supprimer ce jeu ?"
          message={(() => {
            // Les parties et la fiche sont supprimées en cascade par la base : on le dit.
            const n = playCounts[confirming.id] || 0
            const sheet = Boolean(scoresheets[confirming.id])
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
          title="Supprimer ce propriétaire ?"
          message={<><strong>{confirmingOwner.name}</strong> sera retiré de la liste des propriétaires. Les jeux qui lui sont associés ne seront pas supprimés.</>}
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
          message={<><strong>{moving.name}</strong> passera de ta wishlist à ta collection.</>}
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
              {importing.owners.length > 0 && <> et <strong>{importing.owners.length}</strong> propriétaire{importing.owners.length > 1 ? 's' : ''}</>} vont être importés.
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
              va <strong>remplacer</strong> ta collection actuelle.
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

      <NavBar
        view={statsOpen ? 'stats' : settingsOpen ? null : view}
        onChange={(v) => {
          if (v === 'stats') {
            setStatsOpen(true)
            setSettingsOpen(false)
            return
          }
          const overlayOpen = statsOpen || settingsOpen
          setSettingsOpen(false)
          setStatsOpen(false)
          if (v === view) {
            // On est déjà sur cet onglet : on remonte en haut de la liste.
            if (!overlayOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            return
          }
          goToView(v)
        }}
      />

      {chwaziOpen && (
        <Suspense fallback={null}>
          <Chwazi onClose={() => setChwaziOpen(false)} />
        </Suspense>
      )}

      {historyGame && (
        <Suspense fallback={null}>
          <GameHistory
            game={historyGame}
            plays={gamePlays}
            template={scoresheets?.[historyGame.id]}
            online={online}
            onNewPlay={() => { setEditingPlay(null); setScoringGame(historyGame) }}
            onEditPlay={online ? handleEditPlay : undefined}
            onEditSheet={() => setEditingSheet(historyGame)}
            onDeletePlay={(pl) => setConfirmingPlay(pl)}
            onClose={() => {
              setHistoryGame(null)
              setGamePlays(null)
            }}
          />
        </Suspense>
      )}

      {scoringGame && scoresheets && scoresheets[scoringGame.id] && (
        <Suspense fallback={null}>
          <ScoreSheet
            game={scoringGame}
            template={scoresheets[scoringGame.id]}
            initialPlay={editingPlay}
            playerNames={playerNames}
            scenarioNames={scenarioNames}
            saving={savingPlay}
            onSavePlay={handleSavePlay}
            onEdit={() => setEditingSheet(scoringGame)}
            onClose={() => { setScoringGame(null); setEditingPlay(null) }}
          />
        </Suspense>
      )}

      {editingSheet && (
        <Suspense fallback={null}>
          <ScoreSheetEditor
            game={editingSheet}
            template={scoresheets ? scoresheets[editingSheet.id] : null}
            online={online}
            onSave={handleSaveSheet}
            onClose={() => setEditingSheet(null)}
          />
        </Suspense>
      )}

      {zoomImage && <ImageZoom src={zoomImage} onClose={() => setZoomImage(null)} />}
    </div>
  )
}
