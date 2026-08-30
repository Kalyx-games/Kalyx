import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { vibre } from '../lib/haptique'
import { useCouronnes } from '../lib/couronne'
import { BackIcon, PlayersIcon, ExtIcon, FlagIcon, CrownIcon, PlusIcon, PencilIcon } from './icons'
import { parseExtensions, effectivePlayersSet } from '../lib/games'
import { resolveDefaultExts } from '../lib/scoresheets'
import { fetchDerniereTable } from '../lib/plays'
import NameField from './NameField'

// Fiche de saisie d'une partie. Le type de partie vient du template :
//  • win     : 'competitive' | 'coop'
//  • scoring : 'high' | 'low' | 'none'  (plus haut / plus petit / pas de points)
//  • scenario: booléen → demande un scénario / niveau de difficulté
// En compétitif on note par joueur (table + total), le vainqueur = meilleur score
// (ou le(s) joueur(s) coché(s) si « pas de points »). En coopératif, tout le groupe
// gagne/perd ensemble (+ score de groupe facultatif).

let pid = 0
// `variant` = valeur de la variante par joueur (héros, faction…) choisie pour cette partie.
const makePlayer = (name = '', variant = '') => ({ id: ++pid, name, scores: {}, variant })

let tid = 0
const makeTeamRow = (t = {}) => {
  const size = t.size != null ? t.size : null
  const n = size && size > 0 ? size : 1
  return { id: ++tid, name: t.name || '', size, players: Array.from({ length: n }, () => makePlayer()), score: '', win: false }
}

// Le nom de la colonne quand la fiche n'en définit aucune. ⚠️ Sert AUSSI à décider si le nom
// vaut la peine d'être annoncé : « Colonne : Points » au-dessus d'une colonne unique n'apprend
// rien à personne (mesuré : 18 des 23 fiches à une colonne sont dans ce cas).
const COL_DEFAUT = 'Points'

export default function ScoreSheet({ game, template, initialPlay = null, playerNames = [], joueursFrequents = [], scenarioNames = [], closing = false, dirtyRef, onSavePlay, saving, onEdit, onClose }) {
  const win = template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive')
  const scoring = template?.scoring || 'high'
  // Le « scénario » a été retiré de la création de fiche : on ne le demande plus à la
  // saisie (même pour les anciennes fiches qui avaient l'option cochée — champ inerte).
  const wantScenario = false
  const isCoop = win === 'coop'
  const noPoints = scoring === 'none' // = pas de table de score (branche « désignation »)
  const teamsCfg = template?.teams
  const isTeams = !isCoop && !!teamsCfg?.on
  // Deux variantes indépendantes, chacune optionnelle. Pas gérées en équipes (rare).
  //  · PAR JOUEUR (héros, faction…) → une valeur par joueur, stockée dans players[].variant.
  //  · POUR TOUTE LA PARTIE (carte, mission…) → une seule valeur, recopiée sur chaque joueur
  //    dans players[].playVariant (aucune colonne dédiée → aucune migration).
  // Rétrocompat : une ancienne fiche avec `variant.scope === 'play'` = variante de la partie.
  const legacyPlay = template?.variant?.scope === 'play' ? template.variant : null
  const variantCfg = template?.variant?.label && !legacyPlay ? template.variant : null
  const playVariantCfg = template?.playVariant?.label ? template.playVariant : legacyPlay
  const variantOptions = (variantCfg?.options || []).filter(Boolean)
  const playVariantOptions = (playVariantCfg?.options || []).filter(Boolean)
  const variantPerPlayer = !!variantCfg
  const variantPerPlay = !!playVariantCfg
  // Victoire directe (« pas de points » en plus du score) + déclencheurs nommés.
  // En coop, elle ne sert qu'à noter PAR QUOI le groupe a gagné (pas à désigner un joueur) ;
  // en équipes, l'équipe gagnante est désignée par son 🏆 et le déclencheur dit ce qui a
  // arrêté la partie.
  const hasInstant = template?.instant ?? scoring === 'none'
  // Libellé de repli quand la fiche ne nomme aucun déclencheur (ou qu'on n'en choisit pas).
  const VICTOIRE_DIRECTE = 'Victoire directe'
  const triggers = template?.triggers ?? []
  const predefined = (teamsCfg?.list || []).length > 0
  const cats = template?.categories ?? []
  // TOUTES les extensions du jeu (pas seulement celles qui modifient les points) : on
  // veut pouvoir noter avec lesquelles on a joué (pour les stats). Celles qui modifient
  // le score (template.extensions) pilotent en plus l'affichage des catégories.
  const exts = parseExtensions(game?.extensions)
    .map((e) => e.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  // Édition d'une partie existante : on pré-remplit tout depuis `ip`.
  const ip = initialPlay
  const isEdit = !!ip
  const winnerNamesOf = (play) =>
    new Set((play?.winner || '').split(',').map((s) => s.trim()).filter(Boolean))

  // Extensions cochées par défaut : réglage de la fiche (« toutes »/« aucune ») pour une
  // NOUVELLE partie ; celles de la partie éditée sinon.
  const [activeExts, setActiveExts] = useState(() =>
    new Set(ip ? ip.extensions || [] : resolveDefaultExts(template, exts))
  )
  // Bornes de joueurs du jeu : une nouvelle partie démarre au MIN, et on ne peut ni
  // dépasser le MAX ni descendre sous le MIN. Le MAX tient compte des extensions qui
  // élargissent la plage (ex. Abyss 2-4 → 5 avec extension). Repli 1..8 si non renseigné.
  const effP = effectivePlayersSet(game)
  const minP = Math.max(1, Number(game?.players_min) || (effP.length ? Math.min(...effP) : 1))
  const maxP = Math.max(minP, Math.min(8, effP.length ? Math.max(...effP) : Number(game?.players_max) || 8))
  const [players, setPlayers] = useState(() => {
    if (ip && !isTeams && (ip.players || []).length) {
      return ip.players.map((p) => ({ id: ++pid, name: p.name || '', scores: p.scores || {}, variant: p.variant || '' }))
    }
    // Toujours DEUX joueurs au départ, même pour un jeu jouable en solo : on joue à deux
    // bien plus souvent qu’à un, et le deuxième se retire d’un tap si besoin.
    return Array.from({ length: Math.max(2, minP) }, () => makePlayer())
  })
  const [focusedPlayer, setFocusedPlayer] = useState(null)
  // Parcours de saisie (compétitif à points) : 1 = noms + extensions, 2 = parcours (joueur/item), 3 = récap.
  // Une NOUVELLE partie commence à l'étape 1 ; l'édition d'une partie va direct au récapitulatif.
  const [step, setStep] = useState(isEdit ? 3 : 1)
  const [cardIndex, setCardIndex] = useState(0) // page du parcours affichée (joueur ou item selon le mode)
  const walkRef = useRef(null) // conteneur du parcours (pour le glissé)
  const dotsRef = useRef(null) // la rangée des pointillés (la réglette)
  const swipeRef = useRef({ id: null, x: 0, y: 0, dragging: false })
  const swipedRef = useRef(false) // un glissé vient d'avoir lieu → son clic de fin est ignoré
  // Mode de saisie du parcours multi-catégories : une page par joueur, ou une par catégorie.
  const entry = template?.entry === 'byPlayer' ? 'byPlayer' : 'byItem'
  const navRef = useRef({ goPrev: () => {}, goNext: () => {} }) // maj à chaque rendu → toujours frais
  const navDirRef = useRef(1) // sens du dernier changement de page (animation de glissé)
  // Variante « pour toute la partie » : valeur unique, relue depuis n'importe quel joueur de
  // la partie éditée (stockée à l'identique sur chacun dans playVariant ; repli sur `variant`
  // pour les rares parties enregistrées avant la refonte, quand il n'y a pas de variante joueur).
  const [playVariant, setPlayVariant] = useState(
    () =>
      (ip?.players || []).map((p) => p?.playVariant).find(Boolean) ||
      (!variantPerPlayer ? (ip?.players || []).map((p) => p?.variant).find(Boolean) : '') ||
      ''
  )
  const [scenario, setScenario] = useState(ip?.scenario || '')
  const [notes, setNotes] = useState(ip ? ip.notes || '' : template?.notes || '')
  // Vainqueur forcé en cas d'égalité. À la RÉÉDITION on le retrouve : une partie sans
  // déclencheur dont un seul nom est enregistré vainqueur a forcément été départagée à la
  // main (sinon tous les ex æquo y seraient). Sans cette relecture, un simple
  // ré-enregistrement transformait ce vainqueur unique en N vainqueurs.
  const [forcedWinnerId, setForcedWinnerId] = useState(() => {
    if (!ip || ip.trigger || scoring === 'none' || isTeams) return null
    const wn = winnerNamesOf(ip)
    if (wn.size !== 1) return null
    // …et il faut qu'il y ait EU égalité : sinon un vainqueur net serait pris pour un
    // départage, et la moindre correction de score le recouronnerait en silence.
    const tot = (ip.players || []).map((pl) => Number(pl?.total)).filter(Number.isFinite)
    if (tot.length < 2) return null
    const ex = scoring === 'low' ? Math.min(...tot) : Math.max(...tot)
    if (tot.filter((t) => t === ex).length < 2) return null
    const p = players.find((pl) => wn.has((pl.name || '').trim()))
    return p ? p.id : null
  })
  // Victoire directe (déclencheur) : le déclencheur choisi + (si score) le vainqueur direct.
  const [instantTrigger, setInstantTrigger] = useState(ip?.trigger || null)
  const [instantWinnerId, setInstantWinnerId] = useState(() => {
    if (ip && ip.trigger && scoring !== 'none' && !isTeams) {
      const wn = winnerNamesOf(ip)
      const p = players.find((pl) => wn.has((pl.name || '').trim()))
      return p ? p.id : null
    }
    return null
  })

  // Coopératif
  const [outcome, setOutcome] = useState(ip?.outcome || null) // 'win' | 'loss'

  // Score du groupe DÉTAILLÉ par catégorie (coop avec points). Le détail est conservé
  // dans la partie (sur le 1er joueur, clé `groupScores` — ignorée des stats) → à la
  // réouverture on retrouve la répartition exacte. Repli sur les anciennes parties
  // (sans détail) : le total est remis dans la 1re catégorie.
  const [groupScores, setGroupScores] = useState(() => {
    if (!ip || ip.score == null) return {}
    const stored = (ip.players || []).map((p) => p?.groupScores).find(Boolean)
    if (stored) {
      const out = {}
      Object.entries(stored).forEach(([k, v]) => { out[k] = String(v) })
      return out
    }
    const actEx = ip.extensions || []
    const vis = cats.filter((c) => !c.ext || actEx.includes(c.ext))
    const first = (vis.length ? vis : [{ label: 'Points' }])[0]
    return { [first.label]: String(ip.score) }
  })
  const setGroupScoreCat = (label, value) => setGroupScores((s) => ({ ...s, [label]: value }))
  // Compétitif « pas de points » : id des vainqueurs cochés (reconstruit à l'édition).
  const [winnerIds, setWinnerIds] = useState(() => {
    if (ip && noPoints && !isTeams) {
      const wn = winnerNamesOf(ip)
      return new Set(players.filter((p) => wn.has((p.name || '').trim())).map((p) => p.id))
    }
    return new Set()
  })
  // En équipes
  const [teams, setTeams] = useState(() => {
    if (ip && isTeams) {
      // Reconstruit les équipes à partir des joueurs de la partie (groupés par `team`).
      const groups = []
      ;(ip.players || []).forEach((p) => {
        const key = p.team || '—'
        let g = groups.find((x) => x.name === key)
        if (!g) { g = { name: key, total: p.total, members: [] }; groups.push(g) }
        // ⚠️ L'objet entier, pas le seul nom : sinon rééditer une partie en équipes EFFACE la
        // variante de chaque membre (le héros, la faction…), qui repart vide à l'enregistrement.
        g.members.push({ name: p.name, variant: p.variant || '' })
      })
      const wn = winnerNamesOf(ip)
      return groups.map((g) => ({
        id: ++tid,
        name: g.name === '—' ? '' : g.name,
        size: null,
        players: (g.members.length ? g.members : [{ name: '' }]).map((m) => makePlayer(m.name, m.variant)),
        score: g.total != null ? String(g.total) : '',
        win: g.members.some((m) => wn.has((m.name || '').trim())),
      }))
    }
    const list = teamsCfg?.list || []
    return (list.length ? list : [{}, {}]).map((t) => makeTeamRow(t))
  })
  const setTeamField = (id, field, val) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: val } : t)))
  const toggleTeamWin = (id) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, win: !t.win } : t)))
  const addTeam = () => setTeams((ts) => (ts.length < 8 ? [...ts, makeTeamRow()] : ts))
  const removeTeam = (id) => setTeams((ts) => (ts.length > 1 ? ts.filter((t) => t.id !== id) : ts))
  const addMember = (teamId) =>
    setTeams((ts) =>
      ts.map((t) => {
        if (t.id !== teamId) return t
        const cap = t.size && t.size > 0 ? t.size : 8
        return t.players.length < cap ? { ...t, players: [...t.players, makePlayer()] } : t
      })
    )
  const removeMember = (teamId, pid) =>
    setTeams((ts) =>
      ts.map((t) => (t.id === teamId && t.players.length > 1 ? { ...t, players: t.players.filter((p) => p.id !== pid) } : t))
    )
  const setMemberName = (teamId, pid, name) =>
    setTeams((ts) =>
      ts.map((t) => (t.id === teamId ? { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, name } : p)) } : t))
    )
  // Les membres d'équipe vivent dans `teams`, pas dans `players` : leur variante a son
  // propre setter.
  const setMemberVariant = (teamId, pid, variant) =>
    setTeams((ts) =>
      ts.map((t) => (t.id === teamId ? { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, variant } : p)) } : t))
    )

  // Catégories visibles selon les extensions cochées. Si aucune catégorie n'est
  // définie (et qu'il y a des points), on affiche un champ « Points » par défaut
  // (terminologie de beaucoup de jeux → pas la peine de la recréer à chaque fois).
  const visibleCats = useMemo(() => {
    const cs = cats.filter((c) => !c.ext || activeExts.has(c.ext))
    return cs.length === 0 && !noPoints ? [{ label: COL_DEFAUT }] : cs
  }, [cats, activeExts, noPoints])

  // Coop avec points : total du groupe = somme des catégories saisies.
  const groupTotal = visibleCats.reduce((sum, c) => {
    const n = Number(groupScores[c.label])
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
  const anyGroupScore = visibleCats.some((c) => groupScores[c.label] !== '' && groupScores[c.label] != null)

  const toggleExt = (name) =>
    setActiveExts((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const setScore = (playerId, key, value) =>
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, scores: { ...p.scores, [key]: value } } : p)))
  // Compteur −/+ d'une carte joueur : ajoute delta au score de la catégorie (vide = 0).
  const bump = (playerId, key, delta) =>
    setPlayers((ps) => ps.map((p) => {
      if (p.id !== playerId) return p
      const cur = Number(p.scores[key])
      return { ...p, scores: { ...p.scores, [key]: String((Number.isFinite(cur) ? cur : 0) + delta) } }
    }))
  // ---- Appui maintenu sur −/+ : la valeur monte, puis accélère ----
  // ⚠️ TROIS gardes, chacune pour une raison vécue :
  //  · `tenuRef` fait ignorer le clic de fin de geste — sans lui, une tenue ajoute un point
  //    de trop en se terminant (même famille que le `swipedRef` du glissé, juste à côté) ;
  //  · un PLANCHER à 45 ms : un compteur qu'on n'arrive plus à arrêter est pire qu'un
  //    compteur lent ;
  //  · un cran haptique tous les 5 pas, un plus marqué à chaque dizaine — pas à chaque pas,
  //    sinon ce n'est plus du grain mais un bourdonnement.
  const tenueRef = useRef({ minuteur: null, tenu: false, pas: 0 })
  useEffect(() => () => clearTimeout(tenueRef.current.minuteur), [])
  const arreteTenue = () => {
    clearTimeout(tenueRef.current.minuteur)
    tenueRef.current.minuteur = null
  }
  const demarreTenue = (playerId, key, delta) => {
    const t = tenueRef.current
    t.tenu = false
    t.pas = 0
    const cadences = [260, 180, 120, 90, 70, 55, 45]
    const suivant = (i) => {
      t.minuteur = setTimeout(() => {
        t.tenu = true
        t.pas++
        bump(playerId, key, delta)
        if (t.pas % 10 === 0) vibre('seuil')
        else if (t.pas % 5 === 0) vibre('cran')
        suivant(Math.min(i + 1, cadences.length - 1))
      }, i === -1 ? 380 : cadences[i]) // 380 ms d'armement : un tap normal ne déclenche rien
    }
    suivant(-1)
  }
  const setName = (playerId, name) =>
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, name } : p)))
  const setVariant = (playerId, value) =>
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, variant: value } : p)))
  const addPlayer = () => setPlayers((ps) => (ps.length < maxP ? [...ps, makePlayer()] : ps))
  const removePlayer = (playerId) => {
    setWinnerIds((s) => {
      const n = new Set(s)
      n.delete(playerId)
      return n
    })
    // Si ce joueur était désigné « victoire directe », on annule la désignation : sinon
    // instantWinnerId pointe vers un joueur disparu (couronne fantôme + vainqueur faussé).
    setInstantWinnerId((cur) => (cur === playerId ? null : cur))
    setPlayers((ps) => (ps.length > minP ? ps.filter((p) => p.id !== playerId) : ps))
  }
  const toggleWinner = (playerId) =>
    setWinnerIds((s) => {
      const n = new Set(s)
      if (n.has(playerId)) n.delete(playerId)
      else n.add(playerId)
      return n
    })

  const totalOf = (p) =>
    visibleCats.reduce((sum, c) => {
      const n = Number(p.scores[c.label])
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)

  const totals = players.map(totalOf)
  // ⚠️ « avoir un score » = avoir rempli une case VISIBLE. Compter `p.scores` en entier
  // gardait les catégories masquées par une extension décochée : une feuille vide à l'écran
  // pouvait activer le bouton d'enregistrement et désigner un vainqueur.
  const aUnScore = (p) => visibleCats.some((c) => { const v = p.scores[c.label]; return v !== '' && v != null })
  const anyScore = players.some(aUnScore)
  // Meilleur score selon le sens (plus haut / plus petit). ⚠️ sur TOUS les joueurs : une
  // case vide vaut 0 (c'est ce qu'annonce le « 0 » grisé), et un 0 est un score qui peut
  // gagner — à Odin, vider sa main est justement la victoire.
  const best = anyScore ? (scoring === 'low' ? Math.min(...totals) : Math.max(...totals)) : null
  // Égalité au sommet → on peut FORCER le vainqueur (départage secondaire du jeu).
  const tiedPlayers = best != null ? players.filter((p) => totalOf(p) === best) : []
  const forcedWinner = tiedPlayers.length >= 2 && forcedWinnerId && tiedPlayers.some((p) => p.id === forcedWinnerId) ? forcedWinnerId : null
  const isTopWinner = (p) =>
    instantWinnerId
      ? p.id === instantWinnerId
      : forcedWinner
        ? p.id === forcedWinner
        : // Solo : pas de vainqueur au score (cf. saveScored) → pas de couronne non plus.
          players.length > 1 && best != null && totalOf(p) === best

  // ── Les couronnes du meneur, décantées et mobiles ──────────────────────────────────
  // ⚠️ On passe l'ENSEMBLE des meneurs au hook, égalités comprises : c'est lui, et lui seul,
  // qui décide de ce qui est peint. Une version antérieure gardait deux sources — l'ensemble
  // en direct pendant une égalité, le meneur unique en différé sinon — et l'affichage sautait
  // de l'une à l'autre : à 4-5 → 5-5 → 6-5, les deux couronnes surgissaient d'un coup, puis
  // l'une s'éteignait net, puis la bonne clignotait.
  const listeRef = useRef(null)
  const meneursAffiches = useCouronnes(players.filter(isTopWinner).map((p) => p.id), {
    conteneur: listeRef,
    // Une désignation explicite (victoire directe, départage d'égalité) vient d'un TAP :
    // la différer se lirait comme de la latence.
    immediat: instantWinnerId != null || forcedWinner != null,
  })
  const porteCouronne = (p) => meneursAffiches.has(String(p.id))

  const nameOf = (p, i) => (p.name || '').trim() || `Joueur ${i + 1}`
  const namesOf = () => players.map(nameOf)

  // Une NOUVELLE partie commencée (score saisi ou joueur nommé) est « en cours » : la fermer — que ce
  // soit par le bouton ← OU par le bouton RETOUR d'Android — doit demander confirmation pour ne pas la
  // perdre. Le garde est géré par App (pour couvrir aussi le retour Android) ; on lui signale l'état
  // « en cours » via dirtyRef, et le ← appelle simplement onClose (App décide de confirmer ou fermer).
  const dirtyEntry =
    !initialPlay &&
    (anyScore ||
      instantWinnerId != null ||
      players.some((p) => (p.name || '').trim() !== '') ||
      // En équipes, la saisie ne vit PAS dans `players` : sans ces trois lignes, un retour
      // Android en pleine Belote fermait l'écran sans rien demander.
      teams.some((t) => t.win || t.score.trim() !== '' || t.players.some((p) => (p.name || '').trim() !== '')) ||
      winnerIds.size > 0 ||
      outcome != null ||
      anyGroupScore ||
      // …et le reste de l'écran : les variantes, la note, les extensions cochées.
      // Une partie où l'on n'avait rempli QUE ça se fermait sans un mot.
      // ⚠️ PAS instantTrigger : il est pré-rempli au montage quand la fiche n'a qu'un
      // déclencheur → l'écran serait « sale » dès son ouverture.
      playVariant.trim() !== '' ||
      players.some((p) => (p.variant || '').trim() !== '') ||
      notes !== (template?.notes || '') ||
      [...activeExts].sort().join('|') !== resolveDefaultExts(template, exts).slice().sort().join('|'))
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = dirtyEntry
    return () => {
      if (dirtyRef) dirtyRef.current = false
    }
  }, [dirtyEntry, dirtyRef])
  const scenarioVal = () => (wantScenario ? scenario.trim() || null : null)
  // La note voyage avec la partie ; App la persiste sur la fiche si elle a changé.
  const notesVal = () => notes

  // ----- Enregistrement selon le type -----
  // Ajoute les variantes à un joueur enregistré. Les deux sont indépendantes et peuvent
  // coexister : `variant` = sa valeur par joueur ; `playVariant` = la valeur unique de la
  // partie, recopiée à l'identique sur chaque joueur (pas de colonne dédiée → jsonb players).
  const withVariant = (obj, p) => {
    const out = { ...obj }
    if (variantPerPlayer) {
      const v = (p.variant || '').trim()
      if (v) out.variant = v
    }
    if (variantPerPlay) {
      const pv = playVariant.trim()
      if (pv) out.playVariant = pv
    }
    return out
  }

  const saveCoop = () => {
    if (!outcome) return
    const built = players.map((p, i) => withVariant({ name: nameOf(p, i) }, p))
    // Coop avec points : on conserve le DÉTAIL par catégorie (sinon, à la réouverture,
    // le total écrasait la répartition). Rangé sur le 1er joueur ; les stats l'ignorent
    // (elles lisent `pl.scores`, pas `pl.groupScores`) et se basent sur `score` = total.
    if (!noPoints && anyGroupScore && built[0]) {
      const gs = {}
      visibleCats.forEach((c) => {
        const n = Number(groupScores[c.label])
        gs[c.label] = Number.isFinite(n) ? n : 0
      })
      built[0].groupScores = gs
    }
    onSavePlay({
      win: 'coop',
      players: built,
      outcome,
      scenario: scenarioVal(),
      score: !noPoints && anyGroupScore ? groupTotal : null,
      trigger: outcome === 'win' ? instantTrigger || null : null,
      winner: outcome === 'win' ? built.map((b) => b.name).join(', ') : '',
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }

  const saveNoPoints = () => {
    if (!winnerIds.size) return
    const built = players.map((p, i) => ({ p, name: nameOf(p, i), winner: winnerIds.has(p.id) }))
    const winnerNames = built.filter((b) => b.winner).map((b) => b.name)
    onSavePlay({
      players: built.map((b) => withVariant({ name: b.name }, b.p)),
      winner: winnerNames.join(', '),
      trigger: instantTrigger || null,
      scenario: scenarioVal(),
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }

  const saveScored = () => {
    const built = players.map((p, i) => {
      const scores = {}
      // Case laissée vide = 0 (c'est ce que suggère le « 0 » grisé) → la catégorie compte
      // quand même dans les stats, au lieu d'être absente de la partie.
      visibleCats.forEach((c) => {
        const n = Number(p.scores[c.label])
        scores[c.label] = Number.isFinite(n) ? n : 0
      })
      return withVariant({ name: nameOf(p, i), total: totalOf(p), scores }, p)
    })
    const extreme = scoring === 'low' ? Math.min(...built.map((b) => b.total)) : Math.max(...built.map((b) => b.total))
    // Priorité : victoire directe (déclencheur) → vainqueur forcé (égalité) → score.
    const instantP = instantWinnerId ? players.find((p) => p.id === instantWinnerId) : null
    let winners
    if (instantP) {
      winners = [nameOf(instantP, players.indexOf(instantP))]
    } else if (forcedWinner) {
      const fp = players.find((p) => p.id === forcedWinner)
      winners = [nameOf(fp, players.indexOf(fp))]
    } else if (built.length === 1) {
      // Solo : personne à battre. Sans victoire directe, la partie n'a pas de vainqueur —
      // le seul joueur ne peut pas gagner « contre lui-même » (et gonfler son taux à 100 %).
      winners = []
    } else {
      winners = built.filter((b) => b.total === extreme).map((b) => b.name)
    }
    onSavePlay({
      players: built,
      winner: winners.join(', '),
      // Repli obligatoire : sans trace, la relecture ne saurait plus que la victoire est
      // directe (vainqueur perdu à la réédition, scores nuls comptés dans les moyennes).
      trigger: instantP ? instantTrigger || VICTOIRE_DIRECTE : null,
      scenario: scenarioVal(),
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }

  // Enregistre une partie EN ÉQUIPES. Le score d'équipe est copié sur chaque membre
  // (champ total), et les membres sont taggés avec le nom de leur équipe.
  const saveTeams = () => {
    const data = teams
      .map((t, ti) => {
        const tn = t.name.trim() || `Équipe ${ti + 1}`
        const s = Number(t.score)
        const scoreNum = !noPoints && t.score.trim() !== '' && Number.isFinite(s) ? s : null
        // Seuls les membres réellement nommés comptent (pas de placeholder).
        const members = t.players.filter((p) => (p.name || '').trim()).map((p) => ({ name: p.name.trim(), variant: p.variant || '' }))
        return { tn, scoreNum, members, win: t.win }
      })
      // Équipe non utilisée (aucun membre nommé) → ignorée (ni affichée ni comptée).
      .filter((t) => t.members.length > 0)
    // Une équipe désignée 🏆 l'emporte (sans points, ou victoire directe) ; sinon on
    // départage au score.
    let winnerTeams = data.filter((t) => t.win)
    if (!winnerTeams.length && !noPoints) {
      const scored = data.filter((t) => t.scoreNum != null)
      if (scored.length) {
        const extreme = scoring === 'low' ? Math.min(...scored.map((t) => t.scoreNum)) : Math.max(...scored.map((t) => t.scoreNum))
        winnerTeams = scored.filter((t) => t.scoreNum === extreme)
      }
    }
    const winnerSet = new Set(winnerTeams.map((t) => t.tn))
    const built = []
    data.forEach((t) => {
      t.members.forEach((m) => {
        const rec = { name: m.name, team: t.tn }
        if (!noPoints && t.scoreNum != null) rec.total = t.scoreNum
        if (m.variant) rec.variant = m.variant
        if (variantPerPlay && playVariant.trim()) rec.playVariant = playVariant.trim()
        built.push(rec)
      })
    })
    const winnerNames = built.filter((p) => winnerSet.has(p.team)).map((p) => p.name)
    onSavePlay({
      players: built,
      winner: winnerNames.join(', '),
      trigger: instantTrigger || null,
      scenario: scenarioVal(),
      extensions: [...activeExts],
      notes: notesVal(),
    })
  }
  // Une équipe « utilisée » = au moins un membre nommé. On peut enregistrer dès qu'une
  // équipe utilisée a son résultat (victoire cochée en « pas de points », sinon un score).
  const teamUsed = (t) => t.players.some((p) => (p.name || '').trim())
  const canSaveTeams =
    noPoints || hasInstant
      ? // une équipe gagnante cochée suffit (victoire directe : il n'y a pas de score à saisir)
        teams.some((t) => teamUsed(t) && (t.win || t.score.trim() !== ''))
      : teams.some((t) => teamUsed(t) && t.score.trim() !== '')
  const saveLabel = isEdit ? 'Enregistrer les modifications' : 'Enregistrer la partie'

  // Départage d'égalité + barre d'enregistrement du compétitif à points : réutilisés par le
  // récapitulatif (multi-pages) ET par la page unique (un seul item / un seul joueur → pas de récap).
  // Deux équipes au même score : sans ça, saveTeams les déclarait TOUTES gagnantes en silence.
  // ⚠️ Le bloc reste tant que l'égalité dure, et la puce choisie porte `on`. Le masquer dès qu'une
  // équipe était cochée en faisait un VERROU À SENS UNIQUE : sur une fiche à points sans « victoire
  // directe », plus aucun autre contrôle ne porte `t.win` (le 🏆 d'en-tête est réservé à `noPoints ||
  // hasInstant`) → un tap par erreur était définitif, et `saveTeams` donne priorité absolue à la coche
  // sur le score : l'équipe à 501 était enregistrée gagnante contre 502.
  const teamTieBreak = () =>
    tiedTeams.length >= 2 ? (
      <div className="field">
        <label className="field-label">Égalité — qui l’emporte ?</label>
        <div className="chips">
          {tiedTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`fchip ${t.win ? 'on' : ''}`}
              onClick={() => toggleTeamWin(t.id)}
            >
              {teamName(t)}
            </button>
          ))}
        </div>
        {!teams.some((t) => t.win) && (
          <p className="field-hint">Sans choix, les deux équipes sont enregistrées gagnantes.</p>
        )}
      </div>
    ) : null

  // ⚠️ rend un .field NU, comme teamTieBreak : c'est l'appelant qui fournit le .coop-form.
  // S'auto-envelopper l'imbriquait dans celui de la liste plate, avec 6 px de plus.
  const renderTieBreak = () =>
    tiedPlayers.length >= 2 && instantWinnerId == null ? (
      <>
        <div className="field">
          <label className="field-label">Égalité — vainqueur <span className="field-opt">(départage secondaire)</span></label>
          <div className="chips">
            {tiedPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`fchip ${forcedWinner === p.id ? 'on' : ''}`}
                onClick={() => setForcedWinnerId((cur) => (cur === p.id ? null : p.id))}
              >
                <CrownIcon size={14} /> {nameOf(p, players.indexOf(p))}
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>Laissez vide = tous ex æquo gagnent.</p>
        </div>
      </>
    ) : null

  // Barre d'enregistrement COMMUNE : le résultat en direct au-dessus du bouton. Seul le mode
  // à points en avait une ; les trois autres avaient un bouton nu, sans rien dire de ce qui
  // allait être enregistré ni de ce qui manquait pour pouvoir le faire.
  // Ce que la barre annonce, selon le mode. Avant, seul le mode à points disait quelque chose.
  const coopLive =
    outcome === 'win' ? (
      <><CrownIcon size={14} /> Gagné{!noPoints && anyGroupScore ? <> · <b>{groupTotal}</b></> : null}</>
    ) : outcome === 'loss' ? (
      <>Perdu</>
    ) : null
  const noPointsLive = winnerIds.size ? (
    <><CrownIcon size={14} /> {players.filter((p) => winnerIds.has(p.id)).map((p) => nameOf(p, players.indexOf(p))).join(", ")}</>
  ) : null
  const teamName = (t) => t.name.trim() || `Équipe ${teams.indexOf(t) + 1}`
  // Les équipes à égalité au score : on ne peut pas les départager toutes seules.
  const tiedTeams = (() => {
    if (!isTeams || noPoints) return []
    const scored = teams.filter((t) => teamUsed(t) && t.score.trim() !== '' && Number.isFinite(Number(t.score)))
    if (scored.length < 2) return []
    const ex = scoring === 'low' ? Math.min(...scored.map((t) => Number(t.score))) : Math.max(...scored.map((t) => Number(t.score)))
    const ties = scored.filter((t) => Number(t.score) === ex)
    return ties.length >= 2 ? ties : []
  })()
  const teamLive = (() => {
    if (!isTeams) return null
    const used = teams.filter(teamUsed)
    const crowned = used.filter((t) => t.win)
    if (crowned.length) return <><CrownIcon size={14} /> {crowned.map(teamName).join(", ")}</>
    if (noPoints) return null
    const scored = used.filter((t) => t.score.trim() !== '' && Number.isFinite(Number(t.score)))
    if (!scored.length) return null
    const ex = scoring === 'low' ? Math.min(...scored.map((t) => Number(t.score))) : Math.max(...scored.map((t) => Number(t.score)))
    const tetes = scored.filter((t) => Number(t.score) === ex)
    return <><CrownIcon size={14} /> {tetes.map(teamName).join(", ")} · <b>{ex}</b></>
  })()

  // ⚠️ Plus d'argument `aide` : un bouton grisé se comprend seul (retour user du 30/08).
  // La barre ne porte que le RÉSULTAT EN DIRECT — le meneur, le vainqueur désigné : c'est une
  // donnée, pas l'explication d'un bouton mort.
  const saveBar = (onSave, disabled, live) =>
    onSavePlay ? (
      <div className="sheet-editor-actions sheet-save-bar">
        {live ? <div className="sheet-leader">{live}</div> : null}
        <button type="button" className="btn-primary sheet-cta" onClick={onSave} disabled={saving || disabled}>
          {saving ? '…' : saveLabel}
        </button>
      </div>
    ) : null

  // Résultat en direct du mode à points : le meneur, ou le vainqueur direct désigné.
  const scoredLive = (() => {
    const leaders = players.filter((p) => isTopWinner(p))
    if (!leaders.length) return null
    const noms = leaders.map((p) => nameOf(p, players.indexOf(p))).join(', ')
    // Sur une victoire directe il n'y a pas de score à annoncer — la barre restait muette
    // alors que son bouton était actif.
    if (!anyScore) return <><CrownIcon size={14} /> {noms}</>
    return <><CrownIcon size={14} /> {noms} · <b>{totals[players.indexOf(leaders[0])]}</b></>
  })()

  const renderSaveBar = () => {
    if (!onSavePlay || visibleCats.length === 0) return null
    const bloque = !anyScore && !instantWinnerId
    return saveBar(saveScored, bloque, scoredLive)
  }

  const titleHead = (
    <>
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        <h2 className="sheet-title">{game?.name}{isEdit ? ' — modifier' : ''}</h2>
        {/* Modifier la fiche PENDANT la saisie change la longueur du parcours et fait
            disparaître des points déjà saisis, sans un mot. Le bouton reste à sa place (le
            masquer faisait sauter l'en-tête au premier caractère tapé) mais devient
            inopérant, et dit pourquoi. */}
        {onEdit && !isEdit && (
          <button
            type="button"
            className="back-btn sheet-edit-btn"
            onClick={onEdit}
            disabled={dirtyEntry}
            title={dirtyEntry ? 'Terminez ou quittez la saisie pour modifier la fiche' : 'Modifier la fiche'}
            aria-label="Modifier la fiche"
          >
            <PencilIcon size={18} />
          </button>
        )}
      </div>
    </>
  )

  // Extensions jouées : LE MÊME champ dans les cinq parcours. C'était auparavant une carte
  // de puces sans libellé, collée sous le titre — on ne savait pas ce qu'étaient ces puces,
  // et elle occupait le haut de l'écran avant même qu'on ait nommé les joueurs.
  const extField = exts.length > 0 && (
    <div className="field">
      <label className="field-label"><ExtIcon size={13} /> Extensions jouées</label>
      <div className="chips">
        {exts.map((name) => (
          <button key={name} type="button" className={`fchip ${activeExts.has(name) ? 'on' : ''}`} onClick={() => toggleExt(name)}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )

  // Même question d'ouverture que le parcours, dans tous les modes.
  // ══ LA TABLE QUI SE RASSOIT ══ Retaper les mêmes trois ou quatre prénoms est le geste le
  // plus répété de l'app. Une ligne muette rappelle la dernière table saisie de CE jeu ; un
  // tap l'assoit. Ne rien toucher = l'écran d'avant, à l'identique.
  // ⚠️ Elle ne paraît QUE sur une table vierge (les joueurs par défaut, aucun nom saisi) et
  // disparaît au premier caractère tapé : elle ne peut donc jamais écraser une saisie.
  // ⚠️ Jamais en réédition (la table est celle de la partie qu'on corrige), jamais en
  // équipes (leur composition ne se rejoue pas d'une ligne de noms).
  const [derniereTable, setDerniereTable] = useState([])
  useEffect(() => {
    if (isEdit || isTeams || !game?.id) return
    let vivant = true
    fetchDerniereTable(game.id).then((noms) => { if (vivant) setDerniereTable(noms) }).catch(() => {})
    return () => { vivant = false }
  }, [game?.id, isEdit, isTeams])
  // ⚠️ « VIERGE » NE PEUT PAS VOULOIR DIRE « SANS NOMS » SEULEMENT : le score et la variante
  // vivent DANS l'objet joueur, et les couronnes le désignent par son id — or rasseoir()
  // reconstruit des joueurs NEUFS. Un tap sur une table déjà entamée effacerait donc des
  // scores tapés, et laisserait les désignations de vainqueur pointer dans le vide.
  // Même périmètre que la garde anti-perte (dirtyEntry).
  const tableVierge =
    players.every((p) => !(p.name || '').trim() && !(p.variant || '').trim() && !aUnScore(p)) &&
    winnerIds.size === 0 &&
    instantWinnerId == null
  // ⚠️ La ligne NE SE DÉMONTE PAS au premier caractère tapé : elle emporterait sa hauteur
  // dans le flux, champ focalisé et clavier ouvert — tout l'écran sauterait sous le doigt.
  // Elle reste en place et devient INERTE (atténuée, plus tapable), donc toujours incapable
  // d'écraser une saisie.
  const rappelTable = derniereTable.length > 0 && !isEdit && !isTeams
  // ⚠️ LES HABITUÉS DU COMPTE, tronqués à ce que le jeu accepte : une liste de 5 versée dans un
  // jeu à 2 y mettrait trois joueurs de trop. Le nombre vient de la liste, borné par le jeu.
  const frequents = joueursFrequents.slice(0, maxP)
  const rappelFrequents = frequents.length > 0 && !isEdit && !isTeams
  // ⚠️ Le même ménage pour les DEUX boutons, et pour la même raison qu'à `removePlayer` : les
  // joueurs posés ont des ids NEUFS, donc tout état qui désigne quelqu'un par son id
  // (couronnes, victoire directe, départage) doit repartir de zéro — sinon on enregistrerait
  // une partie dont le vainqueur ne pointe sur personne.
  const asseoir = (noms) => {
    if (!tableVierge) return
    setWinnerIds(new Set())
    setInstantWinnerId(null)
    setForcedWinnerId(null)
    setPlayers(noms.map((n) => makePlayer(n)))
    vibre('cran')
  }
  const rasseoir = () => asseoir(derniereTable)
  const playersLabel = (
    <>
      <label className="field-label"><PlayersIcon size={13} /> Qui joue ?</label>
      {rappelTable && (
        <button
          type="button"
          className={`table-rappel${tableVierge ? '' : ' inerte'}`}
          onClick={rasseoir}
          disabled={!tableVierge}
          aria-hidden={tableVierge ? undefined : 'true'}
        >
          <span className="table-rappel-txt">Reprendre la dernière table</span>
          <span className="table-rappel-noms">{derniereTable.join(' · ')}</span>
        </button>
      )}
      {/* Les habitués du compte. En SECOND : la dernière table de CE jeu est plus précise. */}
      {rappelFrequents && (
        <button
          type="button"
          className={`table-rappel${tableVierge ? '' : ' inerte'}`}
          onClick={() => asseoir(frequents)}
          disabled={!tableVierge}
          aria-hidden={tableVierge ? undefined : 'true'}
        >
          <span className="table-rappel-txt">Joueurs fréquents</span>
          <span className="table-rappel-noms">{frequents.join(' · ')}</span>
        </button>
      )}
    </>
  )
  // Le petit champ sous chaque nom perd son indication dès qu'il est rempli : on la rappelle.
  const variantHint = variantPerPlayer ? (
    <p className="field-hint">Sous chaque nom : son {variantCfg.label.toLowerCase()}.</p>
  ) : null

  const scenarioField = wantScenario && (
    <div className="field">
      <label className="field-label">Scénario / niveau <span className="field-opt">(facultatif)</span></label>
      <NameField
        id="scenario"
        className="input"
        value={scenario}
        onChange={setScenario}
        onPick={setScenario}
        placeholder="ex. Scénario 3, difficile…"
        playerNames={scenarioNames}
        focused={focusedPlayer}
        setFocused={setFocusedPlayer}
      />
    </div>
  )

  const notesField = (
    <div className="field">
      <label className="field-label">Notes</label>
      <textarea
        className="notes-area"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rappels de règles, variante maison…"
        rows={2}
      />
    </div>
  )

  // Sélecteur de déclencheur : en coop dès que le groupe gagne ; en équipes dès qu'une
  // équipe est désignée gagnante (ou si le jeu est sans points) ; sinon en « pas de points ».
  const teamWon = isTeams && teams.some((t) => t.win)
  const showTrigger =
    hasInstant && triggers.length > 0 && (isCoop ? outcome === 'win' : isTeams ? noPoints || teamWon : noPoints)

  // Un SEUL déclencheur possible → coché d'office dès que la question est posée (ici, ou
  // dans la section « victoire directe » du mode score individuel). On ne force qu'à la
  // bascule → décocher à la main reste possible.
  const triggerAsked =
    showTrigger || (hasInstant && !isCoop && !isTeams && !noPoints && triggers.length > 0 && instantWinnerId != null)
  useEffect(() => {
    if (triggerAsked && triggers.length === 1) setInstantTrigger((t) => t ?? triggers[0])
  }, [triggerAsked])
  // Réaligne la page affichée quand le parcours raccourcit (joueur retiré, extension
  // décochée). ⚠️ les pages, ce sont les JOUEURS en « par joueur » et les CATÉGORIES en
  // « item par item » : clamper sur players.length ramenait Abyss (9 catégories) à sa
  // page 1 dès qu'on repassait par l'étape 1.
  const pagesDuParcours = entry === 'byPlayer' ? players.length : visibleCats.length
  useEffect(() => {
    setCardIndex((k) => Math.min(k, Math.max(0, pagesDuParcours - 1)))
  }, [pagesDuParcours])
  // Glissé horizontal pour changer de page pendant le parcours (étape 2). Écouteurs tactiles natifs
  // non-passifs (les Pointer Events React sont passifs → preventDefault impossible). navRef reste frais.
  useEffect(() => {
    if (step !== 2) return
    const el = walkRef.current
    if (!el) return
    const st = swipeRef.current
    const onStart = (e) => {
      // Identité du toucher : un 2e doigt posé pendant le geste ne doit pas écraser l'état
      // (il rebasculerait surDots et ré-armerait le glissé sous un scrub de la réglette).
      if (st.id != null) return
      const t = e.changedTouches[0]
      st.id = t.identifier
      st.x = t.clientX; st.y = t.clientY; st.dragging = false; swipedRef.current = false
      // Un geste né sur les pointillés appartient à la RÉGLETTE, pas au glissé de page.
      st.surDots = Boolean(e.target.closest && e.target.closest('.pcard-dots'))
    }
    const onMove = (e) => {
      if (st.surDots) return
      const t = Array.from(e.touches).find((o) => o.identifier === st.id)
      if (!t) return
      const dx = t.clientX - st.x
      const dy = t.clientY - st.y
      if (!st.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 4) {
        st.dragging = true
        // Posé AVANT le seuil de navigation, SANS minuteur : un glissé peut durer plus de
        // 220 ms, et son clic de fin arrive APRÈS le relâché — c'est là que le minuteur part.
        swipedRef.current = true
      }
      if (st.dragging) e.preventDefault()
    }
    const onEnd = (e) => {
      const t = Array.from(e.changedTouches).find((o) => o.identifier === st.id)
      if (!t) return
      st.id = null
      if (st.surDots || !st.dragging) return
      st.dragging = false
      setTimeout(() => { swipedRef.current = false }, 220)
      const dx = t.clientX - st.x
      if (Math.abs(dx) > 50) (dx < 0 ? navRef.current.goNext : navRef.current.goPrev)()
    }
    // Sans lui, un geste repris par le système laisserait le drapeau posé pour toujours
    // (plus aucun tap ne marcherait sur l'écran).
    const onCancel = (e) => {
      if (!Array.from(e.changedTouches).some((o) => o.identifier === st.id)) return
      st.id = null
      if (!st.dragging) return
      st.dragging = false
      setTimeout(() => { swipedRef.current = false }, 220)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [step])

  // LA RÉGLETTE : les pointillés (des cibles de 44 px collées les unes aux autres) se
  // PARCOURENT sans lever le doigt — un glissé traverse les pages, un cran de vibration par
  // franchissement. Tout passe par navRef (jumpTo/idx frais à chaque rendu) : l'effet n'est
  // monté qu'une fois par entrée dans l'étape 2. Les positions sont relevées à l'engagement
  // puis RE-relevées après chaque franchissement : le pointillé actif est plus large
  // (20 → 36 px), ses voisins se décalent sous le doigt.
  useEffect(() => {
    if (step !== 2) return
    const el = dotsRef.current
    if (!el) return // page unique ou autre mode : pas de pointillés
    const st = { id: null, x: 0, y: 0, actif: false, rects: null, sale: false }
    const releve = () => { st.rects = Array.from(el.children, (c) => c.getBoundingClientRect()) }
    const sousLeDoigt = (x, y) => {
      let k = 0
      let meilleur = Infinity
      st.rects.forEach((r, i) => {
        const ex = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        const ey = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        const d = ex * ex + ey * ey
        if (d < meilleur) { meilleur = d; k = i }
      })
      return k
    }
    const onStart = (e) => {
      if (st.id != null) return // un 2e doigt n'écrase pas le scrub en cours
      const t = e.changedTouches[0]
      st.id = t.identifier
      st.x = t.clientX; st.y = t.clientY; st.actif = false
    }
    const onMove = (e) => {
      const t = Array.from(e.touches).find((o) => o.identifier === st.id)
      if (!t) return
      const dx = t.clientX - st.x
      const dy = t.clientY - st.y
      if (!st.actif && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) {
        st.actif = true
        // le clic de fin de geste tomberait sur un pointillé → il ne doit pas re-sauter.
        // Posé SANS minuteur (un scrub dure plus de 220 ms) : le minuteur part au relâché.
        swipedRef.current = true
        releve()
      }
      if (!st.actif) return
      e.preventDefault()
      if (st.sale) { releve(); st.sale = false }
      const k = sousLeDoigt(t.clientX, t.clientY)
      if (k !== navRef.current.idx) {
        st.sale = true // les largeurs vont changer avec la page active
        vibre('touche')
        navRef.current.jumpTo(k)
      }
    }
    const onEnd = (e) => {
      if (!Array.from(e.changedTouches).some((o) => o.identifier === st.id)) return
      st.id = null
      if (st.actif) setTimeout(() => { swipedRef.current = false }, 220)
      st.actif = false
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [step])
  const triggerField = showTrigger && (
    <div className="field">
      <label className="field-label"><FlagIcon size={13} /> {isCoop ? 'Comment le groupe a gagné' : 'Comment le jeu a été gagné'} <span className="field-opt">(facultatif)</span></label>
      <div className="chips">
        {triggers.map((t) => (
          <button key={t} type="button" className={`fchip ${instantTrigger === t ? 'on' : ''}`} onClick={() => setInstantTrigger((cur) => (cur === t ? null : t))}>{t}</button>
        ))}
      </div>
    </div>
  )

  // Section « victoire directe » (branche AU SCORE individuelle : on désigne un joueur).
  const instantField = hasInstant && !isCoop && !isTeams && !noPoints && (
    <div className="field">
      <label className="field-label"><FlagIcon size={13} /> Victoire directe ? <span className="field-opt">(sinon au score)</span></label>
      <div className="chips">
        {players.map((p, i) => (
          <button key={p.id} type="button" className={`fchip ${instantWinnerId === p.id ? 'on' : ''}`} onClick={() => setInstantWinnerId((cur) => (cur === p.id ? null : p.id))}>
            <CrownIcon size={14} /> {nameOf(p, i)}
          </button>
        ))}
      </div>
      {instantWinnerId != null && triggers.length > 0 && (
        <>
          <label className="field-label" style={{ marginTop: 8 }}>Par quel déclencheur ?</label>
          <div className="chips">
            {triggers.map((t) => (
              <button key={t} type="button" className={`fchip ${instantTrigger === t ? 'on' : ''}`} onClick={() => setInstantTrigger((cur) => (cur === t ? null : t))}>{t}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  // Champ « variante par joueur » (héros, faction…). Réutilise NameField : liste de la
  // fiche + saisie libre + auto-complétion. Rien si la fiche n'a pas de variante.
  const variantField = (p) =>
    variantPerPlayer ? (
      <NameField
        id={`v:${p.id}`}
        className="input variant-input"
        value={p.variant || ''}
        onChange={(v) => setVariant(p.id, v)}
        onPick={(v) => setVariant(p.id, v)}
        placeholder={variantCfg.label}
        playerNames={variantOptions}
        focused={focusedPlayer}
        setFocused={setFocusedPlayer}
      />
    ) : null

  // Champ UNIQUE quand la variante vaut pour toute la partie (ex. la carte de Toy Battle).
  const playVariantField = variantPerPlay ? (
    <div className="field">
      <label className="field-label">{playVariantCfg.label}</label>
      <NameField
        id="playVariant"
        className="input"
        value={playVariant}
        onChange={setPlayVariant}
        onPick={setPlayVariant}
        placeholder={playVariantOptions[0] ? `ex. ${playVariantOptions[0]}` : ''}
        playerNames={playVariantOptions}
        focused={focusedPlayer}
        setFocused={setFocusedPlayer}
      />
    </div>
  ) : null

  // Liste de noms de joueurs (utilisée en coop et en « pas de points »).
  const playerList = (withWinnerToggle) => (
    <div className="coop-players">
      {players.map((p, i) => (
        <div key={p.id} className="coop-player">
          <div className="coop-player-row">
            {withWinnerToggle && (
              <button
                type="button"
                className={`win-toggle ${winnerIds.has(p.id) ? 'on' : ''}`}
                onClick={() => toggleWinner(p.id)}
                aria-label="Désigner vainqueur"
                title="Vainqueur"
              >
                <CrownIcon size={17} />
              </button>
            )}
            <NameField
              id={p.id}
              className="input"
              value={p.name}
              onChange={(v) => setName(p.id, v)}
              onPick={(n) => setName(p.id, n)}
              placeholder={`Joueur ${i + 1}`}
              playerNames={playerNames}
              focused={focusedPlayer}
              setFocused={setFocusedPlayer}
            />
            {players.length > minP && (
              <button type="button" className="sheet-del" onClick={() => removePlayer(p.id)} aria-label="Retirer ce joueur">×</button>
            )}
          </div>
          {variantField(p)}
        </div>
      ))}
      {players.length < maxP && (
        <button type="button" className="btn-ghost btn-add coop-add" onClick={addPlayer}><PlusIcon size={14} /> Ajouter un joueur</button>
      )}
    </div>
  )

  // ---------- COOPÉRATIF ----------
  if (isCoop) {
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="coop-form">
          {/* Même ordre partout : ce qu'on remplit toujours d'abord, l'optionnel ensuite. */}
          <div className="field">
            {playersLabel}
            {playerList(false)}
            {variantHint}
          </div>
          {extField}
          {playVariantField}
          <div className="field">
            <label className="field-label">Résultat</label>
            <div className="chips">
              <button type="button" className={`fchip coop-win ${outcome === 'win' ? 'on' : ''}`} onClick={() => setOutcome('win')}>Gagné</button>
              <button type="button" className={`fchip coop-loss ${outcome === 'loss' ? 'on' : ''}`} onClick={() => setOutcome('loss')}>Perdu</button>
            </div>
          </div>
          {triggerField}
          {/* Score du groupe, détaillé par catégorie (total = somme). */}
          {!noPoints && (
            <div className="field">
              <label className="field-label">Score du groupe <span className="field-opt">(facultatif)</span></label>
              <table className="sheet-table">
                <tbody>
                  {visibleCats.map((c) => (
                    <tr key={c.label}>
                      <th className="sheet-cat" scope="row">
                        <span className="sheet-cat-label">
                          {c.label}
                          {c.value != null ? <span className="sheet-cat-val">{c.value > 0 ? `+${c.value}` : c.value}</span> : null}
                        </span>
                        {c.hint ? <span className="sheet-cat-hint">{c.hint}</span> : null}
                        {c.ext ? <span className="sheet-cat-ext"><ExtIcon size={11} /> {c.ext}</span> : null}
                      </th>
                      <td>
                        {c.value != null ? (
                          <input
                            className="sheet-check"
                            type="checkbox"
                            checked={String(groupScores[c.label] ?? '') === String(c.value)}
                            onChange={(e) => setGroupScoreCat(c.label, e.target.checked ? String(c.value) : '')}
                            aria-label={`${c.label} — ${c.value} points`}
                          />
                        ) : (
                          <input
                            className="sheet-cell"
                            type="number"
                            inputMode="numeric"
                            placeholder="0"
                            value={groupScores[c.label] ?? ''}
                            onChange={(e) => setGroupScoreCat(c.label, e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleCats.length > 1 && (
                    <tr className="sheet-total-row">
                      <th className="sheet-cat" scope="row">Total</th>
                      <td className="sheet-total">{groupTotal}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {notesField}
        </div>
        {saveBar(saveCoop, !outcome, coopLive)}
      </div>
    )
  }

  // ---------- EN ÉQUIPES ----------
  if (isTeams) {
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="coop-form">
          {/* Même question d'ouverture que partout — et dans un .field, comme ses jumelles. */}
          <div className="field">
          {playersLabel}
          {teams.map((t, ti) => (
            <div key={t.id} className="team-block">
              <div className="team-block-head">
                {/* 🏆 = équipe gagnante. Sans points c'est le seul moyen de désigner le
                    vainqueur ; avec points, il sert à marquer une victoire directe. */}
                {(noPoints || hasInstant) && (
                  <button
                    type="button"
                    className={`win-toggle ${t.win ? 'on' : ''}`}
                    onClick={() => toggleTeamWin(t.id)}
                    aria-label={noPoints ? 'Équipe gagnante' : 'Victoire directe de cette équipe'}
                    title={noPoints ? 'Équipe gagnante' : 'Victoire directe de cette équipe'}
                  ><CrownIcon size={17} /></button>
                )}
                {predefined ? (
                  <span className="team-name-fixed">{t.name || `Équipe ${ti + 1}`}</span>
                ) : (
                  <input
                    className="input team-name-input"
                    value={t.name}
                    onChange={(e) => setTeamField(t.id, 'name', e.target.value)}
                    placeholder={`Équipe ${ti + 1}`}
                  />
                )}
                {!noPoints && (
                  <input
                    className="input team-score-input"
                    type="number"
                    inputMode="numeric"
                    value={t.score}
                    onChange={(e) => setTeamField(t.id, 'score', e.target.value)}
                    placeholder="score"
                  />
                )}
                {!predefined && teams.length > 1 && (
                  <button type="button" className="sheet-del" onClick={() => removeTeam(t.id)} aria-label="Retirer l'équipe">×</button>
                )}
              </div>
              <div className="team-members">
                {t.players.map((p, i) => (
                  <Fragment key={p.id}>
                    <div className="coop-player-row">
                      <NameField
                        id={p.id}
                        className="input"
                        value={p.name}
                        onChange={(v) => setMemberName(t.id, p.id, v)}
                        onPick={(n) => setMemberName(t.id, p.id, n)}
                        placeholder={`Joueur ${i + 1}`}
                        playerNames={playerNames}
                        focused={focusedPlayer}
                        setFocused={setFocusedPlayer}
                      />
                    {t.players.length > 1 && (
                      <button type="button" className="sheet-del" onClick={() => removeMember(t.id, p.id)} aria-label="Retirer ce joueur">×</button>
                    )}
                    </div>
                    {variantPerPlayer && (
                      <NameField
                        id={`tv:${p.id}`}
                        className="input variant-input"
                        value={p.variant || ''}
                        onChange={(v) => setMemberVariant(t.id, p.id, v)}
                        onPick={(v) => setMemberVariant(t.id, p.id, v)}
                        placeholder={variantCfg.label}
                        playerNames={variantOptions}
                        focused={focusedPlayer}
                        setFocused={setFocusedPlayer}
                      />
                    )}
                  </Fragment>
                ))}
                {(!t.size || t.players.length < t.size) && t.players.length < 8 && (
                  <button type="button" className="btn-ghost btn-add coop-add" onClick={() => addMember(t.id)}><PlusIcon size={14} /> Ajouter un joueur</button>
                )}
              </div>
            </div>
          ))}
          {!predefined && teams.length < 8 && (
            <button type="button" className="btn-ghost btn-add team-add" onClick={addTeam}><PlusIcon size={14} /> Ajouter une équipe</button>
          )}
          </div>
          {extField}
          {playVariantField}
          {triggerField}
          {teamTieBreak()}
          {notesField}
        </div>
        {saveBar(saveTeams, !canSaveTeams, teamLive)}
      </div>
    )
  }

  // ---------- COMPÉTITIF, PAS DE POINTS ----------
  if (noPoints) {
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="coop-form">
          <div className="field">
            {playersLabel}
            {playerList(true)}
            <p className="field-hint">Touchez la couronne du vainqueur. Plusieurs si la victoire est partagée.</p>
            {variantHint}
          </div>
          {extField}
          {playVariantField}
          {triggerField}
          {notesField}
        </div>
        {saveBar(saveNoPoints, !winnerIds.size, noPointsLive)}
      </div>
    )
  }

  // ---------- COMPÉTITIF À POINTS, UNE SEULE COLONNE DE SCORE ----------
  // (ex. Tarot) : on saisit joueur + score final sur UNE page — comme une belote en « équipes
  // de 1 » — puis on enregistre directement. Pas de parcours ni de récapitulatif (inutiles quand
  // il n'y a qu'un score par joueur). Vaut aussi bien pour byItem que byPlayer (1 colonne = pareil).
  if (!isCoop && !isTeams && !noPoints && visibleCats.length === 1) {
    const cat = visibleCats[0]
    const nomColonne = cat.label && cat.label !== COL_DEFAUT ? cat.label : null
    const sensInverse = scoring === 'low'
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="coop-form">
          <div className="field">
            {playersLabel}
            {/* ⚠️ CETTE LIGNE NE PARAÎT QUE SI ELLE APPREND QUELQUE CHOSE. Elle annonçait le nom
                de la colonne en toutes circonstances — or au-dessus d'une colonne UNIQUE, et
                quand ce nom est « Points » (le défaut, ou le mot que la fiche emploie), elle
                répète exactement ce qu'on lit déjà. Mesuré sur la base : 18 fiches à une
                colonne sur 23. Restent les deux cas où elle dit quelque chose : la colonne
                porte un vrai nom de jeu (« Points de contrat », « Châteaux »), ou le sens du
                score est inversé — et ça, rien à l'écran ne le montre. */}
            {(nomColonne || sensInverse) && (
              <p className="field-hint sheet-col-name">
                {nomColonne && <>Colonne : <b>{nomColonne}</b></>}
                {nomColonne && sensInverse && ' · '}
                {sensInverse && (nomColonne ? 'le plus petit score gagne' : 'Le plus petit score gagne.')}
              </p>
            )}
            {cat.hint ? <p className="field-hint">{cat.hint}</p> : null}
            <div className="coop-players" ref={listeRef}>
              {players.map((p, i) => (
                <div key={p.id} className="coop-player">
                  <div className="coop-player-row score-row">
                    <span className="score-crown" data-joueur={p.id} data-couronne={anyScore && porteCouronne(p) ? 'on' : 'off'} aria-hidden="true"><CrownIcon size={16} /></span>
                    <NameField
                      id={p.id}
                      className="input"
                      value={p.name}
                      onChange={(v) => setName(p.id, v)}
                      onPick={(n) => setName(p.id, n)}
                      placeholder={`Joueur ${i + 1}`}
                      playerNames={playerNames}
                      focused={focusedPlayer}
                      setFocused={setFocusedPlayer}
                    />
                    <input
                      className="input score-input"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={p.scores[cat.label] ?? ''}
                      onChange={(e) => setScore(p.id, cat.label, e.target.value)}
                    />
                    {players.length > minP && (
                      <button type="button" className="sheet-del" onClick={() => removePlayer(p.id)} aria-label="Retirer ce joueur">×</button>
                    )}
                  </div>
                  {variantField(p)}
                </div>
              ))}
              {players.length < maxP && (
                <button type="button" className="btn-ghost btn-add coop-add" onClick={addPlayer}><PlusIcon size={14} /> Ajouter un joueur</button>
              )}
            </div>
          </div>
          {extField}
          {playVariantField}
          {instantField}
          {renderTieBreak()}
          {notesField}
        </div>
        {renderSaveBar()}
      </div>
    )
  }

  // ---------- COMPÉTITIF AVEC POINTS, PLUSIEURS COLONNES (assistant : noms → parcours → récap) ----------
  const pageCount = pagesDuParcours
  const idx = Math.min(cardIndex, Math.max(0, pageCount - 1))
  // Une seule page dans le parcours (byPlayer avec 1 seul joueur, plusieurs catégories → le
  // byItem à 1 colonne passe par la liste plate plus haut) : le récapitulatif ferait doublon,
  // on enregistre directement depuis la page unique.
  const singlePage = pageCount === 1
  // ⚠️ En page unique le récapitulatif n'existe pas (goNext ne s'y rend jamais) : ouvrir la
  // réédition dessus menait dans une impasse dès qu'on touchait « Modifier les scores ».
  // Ajustement PENDANT le rendu (pas dans un effet) → pas d'affichage transitoire du récap.
  if (singlePage && step === 3) setStep(2)

  // Champ de saisie d'une case : cochable si la catégorie a une valeur fixe, sinon compteur −/+ (et clavier).
  const inputFor = (p, c) =>
    c.value != null ? (
      <input
        className="sheet-check pcard-check"
        type="checkbox"
        checked={String(p.scores[c.label] ?? '') === String(c.value)}
        onChange={(e) => setScore(p.id, c.label, e.target.checked ? String(c.value) : '')}
        aria-label={`${c.label} — ${c.value} points`}
      />
    ) : (
      <div className="pcard-stepper">
        <button
          type="button"
          className="pcard-pm"
          onClick={() => { if (swipedRef.current || tenueRef.current.tenu) return; bump(p.id, c.label, -1) }}
          onPointerDown={() => demarreTenue(p.id, c.label, -1)}
          onPointerUp={arreteTenue}
          onPointerLeave={arreteTenue}
          onPointerCancel={arreteTenue}
          aria-label="Moins 1"
        >−</button>
        <input
          className="pcard-value"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={p.scores[c.label] ?? ''}
          onChange={(e) => setScore(p.id, c.label, e.target.value)}
        />
        <button
          type="button"
          className="pcard-pm"
          onClick={() => { if (swipedRef.current || tenueRef.current.tenu) return; bump(p.id, c.label, +1) }}
          onPointerDown={() => demarreTenue(p.id, c.label, +1)}
          onPointerUp={arreteTenue}
          onPointerLeave={arreteTenue}
          onPointerCancel={arreteTenue}
          aria-label="Plus 1"
        >+</button>
      </div>
    )

  const catValueTag = (c) => (c.value != null ? <span className="sheet-cat-val">{c.value > 0 ? `+${c.value}` : c.value}</span> : null)

  // Une page du parcours : soit un joueur (toutes ses catégories), soit une catégorie (tous les joueurs).
  // SANS mention de l'extension d'origine (retirée de la fiche de décompte).
  const walkPage =
    pageCount === 0 ? null : entry === 'byPlayer' ? (
      (() => {
        const p = players[idx]
        return (
          <div className="pcard" data-dir={navDirRef.current} key={`p${idx}`}>
            <div className="pcard-head">
              <span className="pcard-name">{isTopWinner(p) ? <><CrownIcon size={12} />{' '}</> : ''}{nameOf(p, idx)}</span>
              {variantPerPlayer && p.variant ? <span className="pcard-variant">{p.variant}</span> : null}
            </div>
            {visibleCats.map((c) => (
              <div key={c.label} className="pcard-row">
                <div className="pcard-cat">
                  <span className="pcard-cat-label">{c.label}{catValueTag(c)}</span>
                  {c.hint ? <span className="sheet-cat-hint">{c.hint}</span> : null}
                </div>
                {inputFor(p, c)}
              </div>
            ))}
            <div className="pcard-total"><span>Total</span><b>{totals[idx]}</b></div>
          </div>
        )
      })()
    ) : (
      (() => {
        const c = visibleCats[idx]
        return (
          <div className="pcard" data-dir={navDirRef.current} key={`c${idx}`} ref={listeRef}>
            <div className="pcard-head">
              <span className="pcard-name">{c.label}{catValueTag(c)}</span>
            </div>
            {c.hint ? <p className="pcard-item-hint">{c.hint}</p> : null}
            {players.map((p, i) => (
              <div key={p.id} className="pcard-row">
                <div className="pcard-cat">
                  {/* La couronne est PERSISTANTE (une place réservée, allumée ou non) : le
                      ternaire qui la faisait apparaître décalait le nom horizontalement, et
                      surtout il n'y avait aucun nœud à faire voyager. */}
                  <span className="pcard-cat-label">
                    <span className="score-crown score-crown-inline" data-joueur={p.id} data-couronne={porteCouronne(p) ? 'on' : 'off'} aria-hidden="true"><CrownIcon size={12} /></span>
                    {nameOf(p, i)}
                  </span>
                  {variantPerPlayer && p.variant ? <span className="hist-variant">{p.variant}</span> : null}
                </div>
                {inputFor(p, c)}
              </div>
            ))}
          </div>
        )
      })()
    )

  // Navigation du parcours : ← recule (ou revient aux noms) / → avance (ou va au récap). navDirRef pilote l'animation.
  const goPrev = () => { navDirRef.current = -1; if (idx > 0) setCardIndex(idx - 1); else setStep(1) }
  const goNext = () => {
    navDirRef.current = 1
    if (idx < pageCount - 1) setCardIndex(idx + 1)
    // Page unique : le récapitulatif ferait doublon et son retour ne ramène qu'à l'étape 1.
    // Les boutons sont déjà masqués ; le glissé, lui, restait actif et y menait quand même.
    else if (!singlePage) setStep(3)
  }
  const jumpTo = (k) => { navDirRef.current = k >= idx ? 1 : -1; setCardIndex(k) }
  navRef.current = { goPrev, goNext, jumpTo, idx }

  const prevLabel = idx > 0 ? (entry === 'byPlayer' ? nameOf(players[idx - 1], idx - 1) : visibleCats[idx - 1].label) : 'Joueurs'
  const nextLabel = idx < pageCount - 1 ? (entry === 'byPlayer' ? nameOf(players[idx + 1], idx + 1) : visibleCats[idx + 1].label) : 'Récapitulatif'

  // Visualiseur : un pointillé court par page, un long sur la page active ; doré = gagnant (mode joueur).
  const walkDots = (
    <div className="pcard-dots" ref={dotsRef}>
      {Array.from({ length: pageCount }).map((_, k) => (
        <button
          key={k}
          type="button"
          className={`pcard-dot ${k === idx ? 'on' : ''} ${entry === 'byPlayer' && players[k] && isTopWinner(players[k]) ? 'win' : ''}`}
          onClick={() => { if (swipedRef.current) return; jumpTo(k) }}
          aria-label={`Page ${k + 1} sur ${pageCount}`}
        />
      ))}
    </div>
  )

  // Tableau récapitulatif éditable (colonnes = joueurs), SANS mention d'extension.
  const recapTable = (
    <div className="sheet-scroll recap-anim">
      <table className="sheet-table">
        <thead>
          <tr>
            <th className="sheet-cat-head">Catégorie</th>
            {players.map((p, i) => (
              <th key={p.id} className={isTopWinner(p) ? 'sheet-winner' : ''}>
                <span className="sheet-name-fixed">{isTopWinner(p) ? <><CrownIcon size={12} />{' '}</> : ''}{nameOf(p, i)}</span>
                {variantPerPlayer && p.variant ? <span className="hist-variant">{p.variant}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleCats.map((c) => (
            <tr key={c.label}>
              <th className="sheet-cat" scope="row">
                <span className="sheet-cat-label">{c.label}{catValueTag(c)}</span>
                {c.hint ? <span className="sheet-cat-hint">{c.hint}</span> : null}
              </th>
              {players.map((p) => (
                <td key={p.id}>
                  {c.value != null ? (
                    <input
                      className="sheet-check"
                      type="checkbox"
                      checked={String(p.scores[c.label] ?? '') === String(c.value)}
                      onChange={(e) => setScore(p.id, c.label, e.target.checked ? String(c.value) : '')}
                      aria-label={`${c.label} — ${c.value} points`}
                    />
                  ) : (
                    <input
                      className="sheet-cell"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={p.scores[c.label] ?? ''}
                      onChange={(e) => setScore(p.id, c.label, e.target.value)}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="sheet-total-row">
            <th className="sheet-cat" scope="row">Total</th>
            {players.map((p, i) => (
              <td key={p.id} className={`sheet-total ${isTopWinner(p) ? 'sheet-winner' : ''}`}>
                {isTopWinner(p) ? <><CrownIcon size={12} />{' '}</> : ''}
                {totals[i]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )

  // ÉTAPE 1 : noms des joueurs + extensions jouées (+ victoire directe : une partie qui
  // s'arrête sur un déclencheur n'a aucun score à saisir → on l'enregistre depuis ici).
  if (step === 1) {
    const goScores = () => { setCardIndex(0); navDirRef.current = 1; setStep(2) }
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="coop-form">
          <div className="field">
            {playersLabel}
            {playerList(false)}
            {variantHint}
          </div>
          {extField}
          {playVariantField}
          {instantField}
          {/* La note est le seul champ qui manquait ici, alors qu'une victoire directe
              s'enregistre depuis cet écran sans jamais passer par le récapitulatif. */}
          {instantWinnerId != null && notesField}
        </div>
        {instantWinnerId != null ? (
          // Vainqueur désigné : on peut enregistrer tout de suite — mais rien n'empêche
          // d'aller quand même compter les points.
          <div className="sheet-editor-actions sheet-actions-stack">
            <button type="button" className="btn-ghost" onClick={goScores}>Saisir les scores</button>
            <button type="button" className="btn-primary sheet-cta" onClick={saveScored} disabled={saving}>
              {saving ? '…' : saveLabel}
            </button>
          </div>
        ) : (
          <div className="sheet-editor-actions">
            <button type="button" className="btn-primary sheet-cta" onClick={goScores}>Saisir les scores →</button>
          </div>
        )}
      </div>
    )
  }

  // ÉTAPE 3 : récapitulatif (tableau éditable) + champs de partie + notes + enregistrement.
  if (step === 3) {
    return (
      <div className={`sheet${closing ? ' closing' : ''}`}>
        {titleHead}
        <div className="entry-bar">
          <button type="button" className="entry-back" onClick={() => { navDirRef.current = -1; setStep(2) }}><BackIcon />Modifier les scores</button>
        </div>

        {recapTable}

        {(scenarioField || instantField || playVariantField) && (
          <div className="coop-form">
            {scenarioField}
            {playVariantField}
            {instantField}
          </div>
        )}

        <div className="coop-form">
          {renderTieBreak()}
          {notesField}
        </div>

        {renderSaveBar()}
      </div>
    )
  }

  // ÉTAPE 2 : parcours page par page (joueur par joueur OU item par item, selon la fiche) + glissé.
  // Cas particulier : une seule page (1 joueur) → pas de récap, on enregistre directement ici.
  return (
    <div className={`sheet sheet-walk${closing ? ' closing' : ''}`}>
      {titleHead}
      {singlePage && (
        <div className="entry-bar">
          <button type="button" className="entry-back" onClick={() => { navDirRef.current = -1; setStep(1) }}><BackIcon />Joueurs</button>
        </div>
      )}
      <div className={`pcard-wrap${singlePage ? ' pcard-wrap-single' : ''}`} ref={walkRef}>
        {!singlePage && walkDots}
        {walkPage}
        {!singlePage && (
          <div className="pcard-nav">
            <button type="button" className="pcard-navbtn" onClick={goPrev}>← {prevLabel}</button>
            <button type="button" className={`pcard-navbtn ${idx === pageCount - 1 ? 'pcard-navbtn-recap' : ''}`} onClick={goNext}>{nextLabel} →</button>
          </div>
        )}
      </div>
      {singlePage && (
        <>
          {(playVariantField || instantField) && (
            <div className="coop-form">
              {playVariantField}
              {instantField}
            </div>
          )}
          <div className="coop-form">
            {renderTieBreak()}
            {notesField}
          </div>
          {renderSaveBar()}
        </>
      )}
    </div>
  )
}
