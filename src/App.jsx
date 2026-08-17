import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from 'react'
import lazyRetry from './lib/lazyRetry'
import { isConfigured, hasCode } from './lib/supabase'
import { fetchGames, addGame, updateGame, deleteGame, cleanGameInput, parseOwners, parseTags } from './lib/games'
import { saveGamesCache, loadGamesCache } from './lib/cache'
import { fetchOwners, addOwner, updateOwner, renameOwner, deleteOwner } from './lib/owners'
import { fetchTags, addTag, updateTag, renameTag, deleteTag } from './lib/tags'
import { downloadBackup, downloadCsv, parseBackup, importBackup, fetchBackups, createBackup, maybeAutoBackup, restoreBackup, restorePreview } from './lib/backup'
import { philibertSearchUrl } from './lib/philibert'
import { EMPTY_FILTERS, PRICE_MIN, PRICE_MAX, norm, passesFilters } from './lib/filtering'
import { useExitLayer } from './lib/useExitLayer'
import { fetchScoresheets, saveScoresheet } from './lib/scoresheets'
import { fetchTierlists, upsertTierlist, deleteTierlist, computeGlobalTierlist, computeAnecdoteList, emptyRanking, dedupeByName, repIdMap, remapRanking } from './lib/tierlists'
import { fetchPlays, savePlay, updatePlay, deletePlay, fetchPlayerNames, fetchPlayMeta, renameCategories, fetchPlayerRoster, fetchPlayerOverall, renamePlayer } from './lib/plays'
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
import { enterFullscreen } from './lib/fullscreen'
import NavBar from './components/NavBar'
import { SettingsIcon, ChwaziIcon, FilterIcon } from './components/icons'


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
  const savedView = loadView() // onglet mémorisé (localStorage), lu une seule fois au montage
  const [view, setView] = useState(savedView === 'wishlist' ? 'wishlist' : 'collection') // 'collection' | 'wishlist'
  const [settingsOpen, setSettingsOpen] = useState(false) // écran Réglages (engrenage en haut à droite)
  const [playersOpen, setPlayersOpen] = useState(false) // écran Joueurs (renommage global)
  const [playerRoster, setPlayerRoster] = useState(null) // [{name, games}] | null = en cours
  const [renamingPlayer, setRenamingPlayer] = useState(false)
  const [statsOpen, setStatsOpen] = useState(savedView === 'stats') // écran Stats
  const [playerOverall, setPlayerOverall] = useState(null) // [{name, games, wins, winRate}] tous jeux | null
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
    fetchPlayerOverall(games).then(setPlayerOverall).catch(() => setPlayerOverall([]))
    // Les tierlists alimentent l'anecdote du jour affichée en haut des Stats → on les charge
    // à l'ouverture de l'onglet (et pas seulement en ouvrant le hub Tierlists).
    fetchTierlists().then(setTierlists).catch(() => setTierlists(null))
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
  const [toast, setToast] = useState('') // message de confirmation éphémère (toast en bas)
  const toastTimer = useRef(null)
  // Affiche un toast qui disparaît tout seul (visible même par-dessus les overlays).
  const showToast = useCallback((msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (msg) toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])
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
  const [tagsLoaded, setTagsLoaded] = useState(false)
  const [scoresheets, setScoresheets] = useState(null) // { game_id: template }, ou null si table absente
  const [scoringGame, setScoringGame] = useState(null) // jeu en cours de notation (nouvelle partie OU édition) | null
  const [scoreExitConfirm, setScoreExitConfirm] = useState(false) // confirmation « quitter la saisie ? » (garde anti-perte)
  const scoringDirtyRef = useRef(false) // la saisie en cours a-t-elle du contenu non enregistré ? (rapporté par ScoreSheet)
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
  const reloadOwners = useCallback(() => {
    fetchOwners().then((v) => {
      setOwnersList(v)
      setOwnersLoaded(true)
    })
  }, [])
  const reloadTags = useCallback(() => {
    fetchTags().then((v) => {
      setTagsList(v)
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
  // Fermetures ANIMÉES exposées par les feuilles à poignée (formulaire, menu de filtres) : le bouton
  // retour Android passe par elles pour fermer AVEC l'animation (glissé vers le bas) au lieu de couper net.
  const formCloseRef = useRef(null)
  const filterCloseRef = useRef(null)
  const uiRef = useRef({})
  uiRef.current = { editing, confirming, confirmingOwner, confirmingTag, moving, importing, restoring, confirmingPlay, confirmingTierlist, scoreExitConfirm, showFilters, chwaziOpen, editingSheet, scoringGame, historyGame, detailGame, tierlistView, tierlistHub, statsOpen, playersOpen, settingsOpen, zoomImage }
  const viewRef = useRef(view)
  viewRef.current = view

  // ═══ Bouton « retour » Android (PWA installée) — modèle FIABLE ═══
  // Recherche confirmée : Chrome IGNORE au « retour » toute entrée pushState créée SANS activation
  // utilisateur (« intervention anti-piégeage »). Donc on NE re-pousse JAMAIS une sentinelle dans le
  // handler de retour (elle serait sautée → sortie de l'app). À la place : UNE entrée d'historique par
  // couche ouverte, poussée dans l'effet qui SUIT le tap d'ouverture (l'activation utilisateur est
  // encore « fraîche » → entrée respectée) ; chaque retour ferme UNE couche ; l'historique reste
  // équilibré (1 ouverture = 1 entrée = 1 retour). À la racine, le retour laisse quitter (normal Android).
  // scoreExitConfirm est un garde ANTI-PERTE, pas une vraie couche : on l'EXCLUT du compte (sinon
  // « Quitter » fermerait 2 couches d'un coup → go(-2), qui n'émet qu'UN popstate et déséquilibre
  // ignoreBackRef). L'entrée consommée par le retour qui a affiché le garde est gérée à part
  // (scoringEntryConsumedRef) : restaurée si on reste (Annuler), ou « déjà consommée » si on quitte.
  const layerCount = Object.entries(uiRef.current).filter(([k, v]) => v && k !== 'scoreExitConfirm').length
  const depthRef = useRef(0) // nb d'entrées d'historique poussées pour les couches ouvertes
  const ignoreBackRef = useRef(0) // popstate synthétiques (resynchro) à ignorer
  const backClosingRef = useRef(false) // la baisse de layerCount en cours vient d'un « retour »
  const scoringEntryConsumedRef = useRef(false) // le retour qui a ouvert le garde a déjà consommé l'entrée de la saisie

  // Synchronise le nb d'entrées d'historique avec le nb de couches ouvertes.
  useEffect(() => {
    const diff = layerCount - depthRef.current
    depthRef.current = layerCount
    if (diff > 0) {
      // Couche ouverte → 1 entrée par couche (l'effet suit le tap → activation présente).
      for (let i = 0; i < diff; i++) window.history.pushState({ kalyx: 'layer' }, '')
    } else if (diff < 0 && !backClosingRef.current) {
      // Couche fermée par un BOUTON (pas par « retour ») → consomme l'entrée orpheline pour rester équilibré.
      ignoreBackRef.current += -diff
      window.history.go(diff)
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
    else if (s.confirmingTierlist) setConfirmingTierlist(false)
    else if (s.editing) { if (formCloseRef.current) formCloseRef.current(); else setEditing(null) } // ferme AVEC l'anim (glissé bas)
    else if (s.showFilters) { if (filterCloseRef.current) filterCloseRef.current(); else setShowFilters(false) }
    else if (s.chwaziOpen) setChwaziOpen(false)
    else if (s.editingSheet) setEditingSheet(null)
    else if (s.scoreExitConfirm) setScoreExitConfirm(false) // retour pendant le garde → on referme le garde (on reste dans la saisie)
    else if (s.scoringGame) {
      // Saisie EN COURS → on affiche le garde au lieu de fermer. Ce retour a consommé l'entrée de la
      // saisie ; on le note pour rééquilibrer à la résolution (Annuler = restaure ; Quitter = déjà consommée).
      if (scoringDirtyRef.current) { setScoreExitConfirm(true); scoringEntryConsumedRef.current = true }
      else setScoringGame(null)
    }

    else if (s.historyGame) setHistoryGame(null) // gamePlays idem (rechargé à l'ouverture)
    else if (s.detailGame) setDetailGame(null) // la fiche jeu : les sous-écrans (ci-dessus) se ferment d'abord
    else if (s.tierlistView) setTierlistView(null) // une tierlist s'ouvre PAR-DESSUS le menu
    else if (s.tierlistHub) setTierlistHub(false)
    else if (s.statsOpen) setStatsOpen(false)
    else if (s.playersOpen) setPlayersOpen(false) // s'ouvre PAR-DESSUS les Réglages
    else if (s.settingsOpen) setSettingsOpen(false)
    else return false
    return true
  }, [])

  // Chaque « retour » ferme UNE couche (ordre de priorité) ou rejoue la vue précédente. On NE re-pousse
  // JAMAIS d'entrée ici (voir le bloc plus haut : ce serait sauté par Chrome → sortie de l'app). Quand
  // une couche est fermée, on marque `backClosingRef` pour que l'effet de synchro ne re-consomme pas
  // l'entrée (le « retour » l'a déjà consommée). À la racine (rien à fermer), on laisse quitter.
  useEffect(() => {
    const onPop = () => {
      if (ignoreBackRef.current > 0) { ignoreBackRef.current--; return } // « retour » synthétique (resynchro) → ignorer
      if (closeTopLayer()) { backClosingRef.current = true; return }
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
    const p = loadPage()
    return !!(p && (p.detail || p.history || p.settings || p.players || p.tierlistHub))
  })
  useEffect(() => {
    if (restoredRef.current || games === null) return
    restoredRef.current = true
    const page = loadPage()
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
    // statsOpen/settingsOpen : le <main> est démonté puis remonté en fermant ces écrans →
    // il faut recalculer, sinon la 1re colonne retombe sur son repli (colonne étirée).
  }, [games, listStatus, statsOpen, settingsOpen])

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
    (!statsOpen && view === 'wishlist' && (filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX) ? 1 : 0) +
    (filters.complexity.length ? 1 : 0)
  // Pastille du bouton flottant : on NE compte PAS le propriétaire (filtre « passif » persistant).
  const badgeCount = activeFilterCount - (filters.owners.length ? 1 : 0)

  // Réinitialise les filtres en gardant le propriétaire (utilisé par la liste ET les tierlists).
  const resetFilters = useCallback(() => setFilters((f) => ({ ...EMPTY_FILTERS, owners: f.owners })), [])

  // Puces des filtres ACTIFS (sous la recherche) : on voit ce qui filtre et on l'enlève d'un tap.
  const activeChips = useMemo(() => {
    const chips = []
    filters.owners.forEach((o) =>
      chips.push({ key: 'o:' + o, label: o, remove: () => setFilters((f) => ({ ...f, owners: f.owners.filter((x) => x !== o) })) })
    )
    if (statsOpen || view !== 'wishlist') {
      filters.tags.forEach((t) =>
        chips.push({ key: 't:' + t, label: '🏷️ ' + t, remove: () => setFilters((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) })) })
      )
    }
    if (filters.players.length) {
      const list = [...filters.players].sort((a, b) => a - b).map((n) => (n >= 12 ? '12+' : n)).join(', ')
      chips.push({
        key: 'pl',
        label: `${filters.playerOptimal ? '⭐' : '👥'} ${list}`,
        remove: () => setFilters((f) => ({ ...f, players: [], playerOptimal: false })),
      })
    }
    if (filters.duration != null) {
      chips.push({ key: 'dur', label: `🕑 ≤ ${filters.duration} min`, remove: () => setFilters((f) => ({ ...f, duration: null })) })
    }
    filters.complexity.forEach((b) => {
      const lbl = b === 'simple' ? 'Simple' : b === 'moyen' ? 'Moyen' : 'Corsé'
      chips.push({ key: 'c:' + b, label: '🧠 ' + lbl, remove: () => setFilters((f) => ({ ...f, complexity: f.complexity.filter((x) => x !== b) })) })
    })
    if (!statsOpen && view === 'wishlist' && (filters.priceRange[0] !== PRICE_MIN || filters.priceRange[1] !== PRICE_MAX)) {
      const [lo, hi] = filters.priceRange
      chips.push({ key: 'price', label: `💶 ${lo}–${hi >= PRICE_MAX ? '150+' : hi} €`, remove: () => setFilters((f) => ({ ...f, priceRange: [PRICE_MIN, PRICE_MAX] })) })
    }
    return chips
  }, [filters, statsOpen, view])

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
      return true // succès → GameForm ferme en glissant vers le bas (animateClose)
    } catch (e) {
      setError(e.message)
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
  async function handleRenameOwner(id, oldName, newName, patch) {
    try {
      const n = await renameOwner(id, oldName, newName, patch)
      reloadOwners()
      loadGames() // recharge les jeux : le nom propagé dans games.owner doit s'afficher
      showToast(n ? `« ${newName} » : ${n} jeu${n > 1 ? 'x' : ''} mis à jour.` : `Renommé en « ${newName} ».`)
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
  async function handleRenameTag(id, oldName, newName, patch) {
    try {
      const n = await renameTag(id, oldName, newName, patch)
      reloadTags()
      loadGames() // recharge les jeux : le nom propagé dans games.tags doit s'afficher
      showToast(n ? `« ${newName} » : ${n} jeu${n > 1 ? 'x' : ''} mis à jour.` : `Renommé en « ${newName} ».`)
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
      showToast(`Sauvegarde téléchargée : ${n.games} jeux, ${n.plays} parties, ${n.sheets} fiches, ${n.tierlists} tierlists.`)
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
      showToast(`2 fichiers tableur téléchargés : ${n.games} jeux et ${n.lignesParties} lignes de parties.`)
    } catch (e) {
      setError(e.message)
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
      setError(e.message)
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
      if (ok === null) setError("Lance d'abord la migration des sauvegardes (voir README).")
      else {
        await reloadBackups()
        showToast('Sauvegarde enregistrée.')
      }
    } catch (e) {
      setError(e.message)
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
        showToast(`Fiche enregistrée · ${n} partie${n > 1 ? 's' : ''} mise${n > 1 ? 's' : ''} à jour.`)
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
      const wasEditing = !!editingPlay
      if (wasEditing) await updatePlay(editingPlay.id, play)
      else await savePlay(scoringGame.id, play)
      const g = scoringGame
      setScoringGame(null)
      setEditingPlay(null)
      // Nouvelle partie → on revient sur la FICHE du jeu (déjà ouverte dessous ; sinon on l'ouvre).
      // Édition depuis l'historique → on revient sur l'historique (déjà ouvert dessous), rafraîchi.
      if (wasEditing) {
        if (historyGame) refreshHistory(historyGame)
      } else if (!detailGame) {
        setDetailGame(g)
      }
      // Met à jour le résumé « N parties · dernière le … » de la fiche.
      fetchPlayMeta().then(setPlayMeta).catch(() => {})
      showToast(wasEditing ? 'Partie modifiée.' : 'Partie enregistrée.')
    } catch (e) {
      setError(e.message)
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
  const reloadTierlists = () => fetchTierlists().then(setTierlists).catch(() => setTierlists(null))
  // « Anecdote du jour » : une graine calculée à partir de la DATE (locale). Même jour →
  // même graine pour tout le monde → même anecdote sur tous les appareils. Change chaque jour.
  const daySeed = useMemo(() => {
    const d = new Date()
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    let h = 2166136261 // FNV-1a
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }, [])
  // Anecdotes groupées par TYPE (recalculées quand les tierlists/la collection/le jour changent).
  const anecGroups = useMemo(() => {
    if (!tierlists || !tierlists.length) return []
    const nameById = new Map(collectionGames.map((g) => [g.id, g.name]))
    return computeAnecdoteList(tierlists, collectionIds, repById, nameById, daySeed)
  }, [tierlists, collectionGames, collectionIds, repById, daySeed])
  // L'anecdote du jour : choix DÉTERMINISTE (graine du jour) d'un TYPE (groupe) puis d'une
  // anecdote dedans → chaque type a la même chance, et le résultat est identique pour tous.
  const anecShown = useMemo(() => {
    if (!anecGroups.length) return null
    const g = anecGroups[daySeed % anecGroups.length]
    return g[((daySeed >>> 7) % g.length + g.length) % g.length]
  }, [anecGroups, daySeed])
  function handleOpenTierlists() {
    setTierlistHub(true)
    reloadTierlists()
  }
  function handleOpenGlobalTierlist() {
    const { ranking, unranked } = computeGlobalTierlist(tierlists || [], collectionIds, repById)
    setTierlistView({ mode: 'global', title: '🌍 Tierlist globale', ranking, unranked, player: '', id: null })
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
      setError(e.message)
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
      showToast(`Sauvegarde restaurée : ${res.games} jeux, ${res.plays} parties. Une sauvegarde de l'état précédent a été créée.`)
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
      {toast && (
        <div className="toast" role="status" onClick={() => setToast('')}>
          <span className="toast-ico">✅</span> {toast}
        </div>
      )}

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
            onRenameOwner={handleRenameOwner}
            onDeleteOwner={(owner) => setConfirmingOwner(owner)}
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
              restorePreview(b.id).then(setRestorePlan).catch(() => setRestorePlan({ games: 0, plays: 0, sheets: 0, names: [] }))
            }}
            onOpenPlayers={handleOpenPlayers}
            onEnterCode={() => setCodeAsk(true)}
            onChangeCode={() => setCodeChange(true)}
            deviceAuthorized={authorized}
            online={online}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : (
        <>
      {/* Ligne 1 : recherche + tri côte à côte. Le tri est à DROITE de la recherche pour
          libérer toute la ligne 2 aux puces de filtres (qui doivent toutes rester visibles). */}
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
                🎲
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

      {/* Ligne 2 : les puces de filtres actifs (toutes visibles, elles passent à la ligne),
          ou le compteur de jeux s'il n'y a aucun filtre actif. */}
      {(!statsOpen || activeChips.length > 0) && (
        <div className="controls-row2">
          {activeChips.length > 0 ? (
            <div className="active-filters">
              {activeChips.map((c) => (
                <button key={c.key} type="button" className="active-chip" onClick={c.remove} aria-label={`Retirer le filtre ${c.label}`}>
                  <span>{c.label}</span>
                  <span className="active-chip-x">×</span>
                </button>
              ))}
            </div>
          ) : (
            !statsOpen && <span className="count">{games === null ? '' : countLabel}</span>
          )}
        </div>
      )}

      {/* Filtres en MENU FLOTTANT (ouvert par le bouton flottant) : bloque l'arrière-plan. */}
      {showFilters && (
        <FilterSheet
          resetCount={activeFilterCount - (filters.owners.length ? 1 : 0)}
          visibleLabel={`Voir les ${statsOpen ? statsGames.length : visible.length} jeu${(statsOpen ? statsGames.length : visible.length) > 1 ? 'x' : ''}`}
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
            games={statsGames}
            hasCollection={hasCollection}
            playerOverall={playerOverall}
            onOpenTierlists={handleOpenTierlists}
            anecdote={anecShown}
            onFilter={(patch, label) => {
              // On applique le filtre SANS changer de vue (les Stats se mettent à jour d'elles-mêmes)
              // et on confirme par un toast.
              setFilters((f) => ({ ...f, ...patch }))
              showToast(label ? `Filtre appliqué : ${label}` : 'Filtre appliqué')
            }}
          />
        </Suspense>
      ) : (
      <main className="list" ref={listRef}>
        {games === null || booting ? (
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
                  : () => setDetailGame(g) // collection → la « fiche jeu » (hub : partie, historique, édition, BGG…)
              }
              onImageClick={(url) => setZoomImage(url)}
              // « Nouvelle partie » RETIRÉ du menu de glissement → uniquement sur la fiche jeu.
              // Quand on trie par une info absente des cartes, on l'affiche dessus.
              metaLine={
                sort === 'lastplayed'
                  ? playMeta[g.id]?.last
                    ? `🕓 Dernière partie : ${formatDay(playMeta[g.id].last)}`
                    : '🕓 Jamais jouée'
                  : sort === 'plays'
                  ? playMeta[g.id]?.count
                    ? `🎲 ${playMeta[g.id].count} partie${playMeta[g.id].count > 1 ? 's' : ''} jouée${playMeta[g.id].count > 1 ? 's' : ''}`
                    : '🎲 Jamais jouée'
                  : null
              }
              ownerMap={ownerMap}
              tagMap={tagMap}
              hasSheet={!!(scoresheets && scoresheets[g.id])}
            />
          ))
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
      {/* Ajouter = bouton plus petit, au-dessus du filtre (liste seulement). */}
      {!statsOpen && (
        <button
          className="fab fab-add-above"
          onClick={() => setEditing('new')}
          disabled={!online || games === null}
          title={online ? 'Ajouter un jeu' : 'Indisponible hors ligne'}
          aria-label="Ajouter un jeu"
        >
          +
        </button>
      )}
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
          siblings={visible}
          onNavigate={(g) => setDetailGame(g)}
          onClose={() => setDetailGame(null)}
          onZoomImage={(url) => setZoomImage(url)}
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
              {' '}Les propriétaires et tags absents de cette sauvegarde seront aussi retirés.
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
        view={statsOpen ? 'stats' : settingsOpen ? null : view}
        onChange={(v) => {
          const overlayOpen = statsOpen || settingsOpen
          if (v === 'stats') {
            setStatsOpen(true)
            setSettingsOpen(false)
            return
          }
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
          onConfirm={() => {
            setScoreExitConfirm(false)
            setScoringGame(null)
            // Si le garde a été ouvert par le RETOUR Android, l'entrée de la saisie a déjà été consommée
            // → on marque « fermé par retour » pour que la synchro ne re-consomme pas l'entrée de la fiche dessous.
            if (scoringEntryConsumedRef.current) { backClosingRef.current = true; scoringEntryConsumedRef.current = false }
          }}
          onCancel={() => {
            setScoreExitConfirm(false)
            // On RESTE dans la saisie : si le retour avait consommé l'entrée, on la restaure (sur ce TAP →
            // activation présente → entrée respectée par Chrome), pour que le prochain retour reprotège la saisie.
            if (scoringEntryConsumedRef.current) { window.history.pushState({ kalyx: 'scoring' }, ''); scoringEntryConsumedRef.current = false }
          }}
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
            onClose={() => setEditingSheet(null)}
          />
        </Suspense>
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
