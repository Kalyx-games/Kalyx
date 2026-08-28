// « Le saviez-vous ? » — l'anecdote du jour, en haut de l'onglet Statistiques.
//
// TROIS RÈGLES qui expliquent tout le fichier :
//  1. AUCUN hasard. La liste est construite de façon strictement déterministe (aucun
//     Math.random, aucune graine du jour dans les textes) : deux appareils qui regardent
//     le même jour voient la même chose, et deux visites le même jour aussi.
//  2. PAS DE BOUCLE AVANT UN MOIS. Le choix du jour n'est pas un tirage : c'est un
//     PARCOURS. Les anecdotes sont rangées dans un ordre fixe et servies une par jour,
//     en boucle — donc TOUTE fenêtre de N jours consécutifs les contient chacune une fois
//     et une seule. Tant que la liste en compte 30, rien ne se répète en un mois.
//  3. NE JAMAIS AFFIRMER PLUS QUE CE QU'ON SAIT. La table des parties ne contient que ce
//     que l'utilisateur a pris le temps de saisir, et `played_at` est l'heure de SAISIE,
//     pas celle de la soirée. Les phrases parlent donc de « parties enregistrées », et
//     les chiffres qui mesureraient la saisie plutôt que le jeu sont plafonnés ou taus.
//
// La matière vient de DEUX sources : les tierlists (qui aime quoi) et les parties
// enregistrées (qui joue à quoi, qui gagne, quand). La seconde est de loin la plus riche.

import { playWinners, scoreCounts } from './plays'

// ---------- petits outils ----------

const NBSP = ' '
const nb = (n) => String(n).replace(/ /g, NBSP)
const pluriel = (n, mot, plur) => `${nb(n)}${NBSP}${n > 1 ? plur || mot + 's' : mot}`

// Hachage stable (FNV-1a) : sert à ranger sans jamais tirer au sort.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const jourDe = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}
// En français, le premier jour du mois s'écrit « 1er », jamais « 1 ».
const dateCourte = (d) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
const cleJour = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Un nom qui contient un chiffre n'est pas un prénom : c'est soit un code tapé de travers
// (il y en a cinq en base), soit le « Joueur 2 » de remplacement d'une partie saisie sans
// nommer personne.
const vraiNom = (n) => Boolean(n) && !/\d/.test(n)

// Une partie coopérative n'a pas de vainqueur au sens habituel : `playWinners` y renvoie
// TOUT LE MONDE. Elle n'a donc rien à faire dans un taux de victoire ni dans une série.
const estCoop = (p) => Boolean(p?.outcome)
// En équipes, le score de l'équipe est recopié sur chaque membre : les écarts entre joueurs
// n'y veulent rien dire (les deux plus hauts totaux sont deux coéquipiers).
const estEquipes = (p) => (p?.players || []).some((x) => x && x.team)

// ---------- la liste ----------

/**
 * Construit TOUTES les anecdotes disponibles, à plat, dans un ordre stable.
 * Chaque entrée : { key, text }. `key` identifie l'anecdote indépendamment de sa
 * formulation → c'est elle qui sert au rangement, pas la position dans le tableau.
 */
export function buildAnecdotes({ plays = [], games = [], playsTous = null, repById = null, tierAnecdotes = [], scoringById = null } = {}) {
  const out = []
  // Deux anecdotes au texte identique feraient double emploi — et, si elles partagent leur
  // clé (cas des tierlists, dont la clé DÉRIVE du texte), la même phrase pourrait sortir
  // deux fois dans un tour. On ne garde que la première.
  const dejaDit = new Set()
  const add = (key, text) => {
    if (!text || dejaDit.has(text)) return
    dejaDit.add(text)
    out.push({ key, text })
  }
  const ajouteTierlists = () => tierAnecdotes.forEach((t) => add(`tier-${hash(t)}`, t))

  const nameById = new Map(games.map((g) => [g.id, g.name]))
  const gname = (id) => nameById.get(id) || null

  // Un jeu que deux propriétaires possèdent existe en double en base : on ramène chaque
  // partie au jeu « représentant », sinon elle serait ignorée (et le total, faux).
  const memeJeu = (id) => (repById && repById.get ? repById.get(id) : null) || id
  const remap = (p) => (p && memeJeu(p.game_id) !== p.game_id ? { ...p, game_id: memeJeu(p.game_id) } : p)
  // `parties` : ce qui a été joué SUR LES JEUX DU PÉRIMÈTRE (le compte actif). Toutes les
  // sections qui NOMMENT un jeu s appuient dessus.
  const parties = plays.map(remap).filter((p) => p && nameById.has(p.game_id))
  // `partiesJoueurs` : TOUTES les parties connues, sans filtre de collection — la matière
  // des anecdotes qui parlent de personnes. Le remappage reste nécessaire pour ne pas
  // compter deux fois un jeu que deux foyers possèdent (« a touché à N jeux »).
  const partiesJoueurs = (playsTous || plays).map(remap).filter(Boolean)

  // ===== 1. Les joueurs =====
  // ⚠️⚠️ CETTE SECTION SE CALCULE SUR **TOUTES** LES PARTIES, jamais sur le périmètre d un
  // compte — et elle est donc placée AVANT la garde ci-dessous. Ses sept phrases ne citent
  // AUCUN jeu : ce sont des affirmations sur des PERSONNES, et cinq d entre elles sont des
  // superlatifs (« le plus assidu », « le meilleur taux », « le duo »). Restreintes à un
  // foyer, elles ne seraient pas seulement partielles : elles désigneraient QUELQU UN
  // D AUTRE. Elles se contrediraient en plus avec le « Bilan d un joueur » du même écran,
  // qui compte, lui, toutes les parties.
  // RÈGLE : le périmètre d une anecdote suit son SUJET (un jeu → le compte ; une personne →
  // tout le monde), pas sa SOURCE.
  const stats = new Map() // nom → { parties, duels, gagnes, jeux:Set }
  const ensemble = new Map() // "A|B" → nb de parties en commun
  partiesJoueurs.forEach((p) => {
    const noms = [...new Set((p.players || []).map((x) => (x?.name || '').trim()).filter(vraiNom))]
    const gagnants = new Set(playWinners(p))
    const coop = estCoop(p)
    noms.forEach((n) => {
      const s = stats.get(n) || { parties: 0, duels: 0, gagnes: 0, jeux: new Set() }
      s.parties++
      // ⚠️ le taux de victoire ne compte QUE les parties où il y avait quelqu'un à battre :
      // en coopératif `playWinners` couronne toute la table, ce qui ferait remonter au
      // sommet du classement ceux qui jouent surtout en coop.
      if (!coop) {
        s.duels++
        if (gagnants.has(n)) s.gagnes++
      }
      s.jeux.add(p.game_id)
      stats.set(n, s)
    })
    for (let i = 0; i < noms.length; i++)
      for (let j = i + 1; j < noms.length; j++) {
        const k = [noms[i], noms[j]].sort((a, b) => a.localeCompare(b, 'fr')).join('|')
        ensemble.set(k, (ensemble.get(k) || 0) + 1)
      }
  })

  const joueurs = [...stats.entries()].sort((a, b) => b[1].parties - a[1].parties || a[0].localeCompare(b[0], 'fr'))
  if (joueurs.length >= 2) add('nb-joueurs', `${nb(joueurs.length)}${NBSP}personnes différentes ont déjà joué.`)
  if (joueurs.length && joueurs[0][1].parties >= 3) {
    add('plus-assidu', `${joueurs[0][0]} a joué le plus de parties : ${nb(joueurs[0][1].parties)}.`)
  }
  if (joueurs.length >= 2) {
    // Taux de victoire, hors coopératif, à partir de 5 parties (sinon un coup de chance gagne).
    const assez = joueurs.filter(([, s]) => s.duels >= 5)
    if (assez.length >= 2) {
      const taux = ([, s]) => s.gagnes / s.duels
      const meilleur = assez.reduce((b, x) => (taux(x) > taux(b) ? x : b))
      add('meilleur-taux', `${meilleur[0]} gagne ${nb(Math.round(taux(meilleur) * 100))}${NBSP}% de ses parties.`)
      const dernier = assez.reduce((b, x) => (taux(x) < taux(b) ? x : b))
      if (dernier[0] !== meilleur[0])
        add('moins-bon-taux', `${dernier[0]} gagne ${nb(Math.round(taux(dernier) * 100))}${NBSP}% de ses parties : la chance finira bien par tourner.`)
    }
    const curieux = joueurs.reduce((b, x) => (x[1].jeux.size > b[1].jeux.size ? x : b))
    if (curieux[1].jeux.size >= 5) add('plus-curieux', `${curieux[0]} a touché à ${pluriel(curieux[1].jeux.size, 'jeu', 'jeux')} différents — le record.`)
  }
  if (ensemble.size) {
    const [k, n] = [...ensemble.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (n >= 3) {
      const [a, b] = k.split('|')
      add('duo', `${a} et ${b} sont le duo le plus assidu : ${pluriel(n, 'partie')} ensemble.`)
    }
  }
  if (partiesJoueurs.length >= 5) {
    const moy = partiesJoueurs.reduce((s, p) => s + (p.players || []).length, 0) / partiesJoueurs.length
    add('taille-table', `Autour de la table : ${moy.toFixed(1).replace('.', ',')}${NBSP}joueurs en moyenne.`)
  }

  // ⚠️ Aucune partie CONNUE ≠ aucune partie JOUÉE : hors ligne, ou tant que le chargement
  // n'a pas abouti, la liste est vide. On se tait plutôt que d'affirmer que rien n'a jamais
  // été joué (une version antérieure annonçait « toute la collection n'a jamais été jouée »).
  if (!parties.length) {
    // On sort AVANT les sections qui nomment un jeu, mais la §1 ci-dessus a déjà parlé des
    // personnes : un compte sans partie sur SES jeux n est pas un monde sans parties.
    ajouteTierlists()
    return out
  }

  // ===== 2. Ce qu'on joue =====
  const parJeu = new Map()
  parties.forEach((p) => {
    const e = parJeu.get(p.game_id) || { n: 0, dates: [], plays: [] }
    e.n++
    const d = jourDe(p.played_at)
    if (d) e.dates.push(d)
    e.plays.push(p)
    parJeu.set(p.game_id, e)
  })

  const classement = [...parJeu.entries()].sort((a, b) => b[1].n - a[1].n || String(a[0]).localeCompare(String(b[0])))

  // ⚠️ Ni « dans Kalyx » ni « de la collection » : depuis que le périmètre suit le compte,
  // ces mentions affirmeraient un total GLOBAL qu on ne mesure plus. On les retire plutôt
  // que de les nuancer — la phrase reste vraie quel que soit le périmètre.
  add('total-parties', parties.length > 1
    ? `${nb(parties.length)}${NBSP}parties enregistrées.`
    : 'La toute première partie est enregistrée.')

  // Les trois jeux les plus joués, chacun sa propre anecdote.
  classement.slice(0, 3).forEach(([id, e], i) => {
    if (e.n < 2) return
    const rang = ['le jeu le plus joué', 'le deuxième jeu le plus joué', 'le troisième jeu le plus joué'][i]
    add(`plus-joue-${i}`, `${gname(id)} est ${rang} : ${pluriel(e.n, 'partie')}.`)
  })

  // Les jeux sans aucune partie enregistrée. ⚠️ formulation : on ne sait pas s'ils ont été
  // joués, seulement qu'aucune partie n'a été notée.
  const jamais = games.filter((g) => !parJeu.has(g.id))
  if (jamais.length && games.length) {
    add('jamais-joues', jamais.length > 1
      ? `${nb(jamais.length)}${NBSP}jeux n'ont encore aucune partie enregistrée.`
      : "Un seul jeu n'a encore aucune partie enregistrée.")
    // Un jeu qui attend, choisi de façon stable (le premier par ordre alphabétique).
    const attente = [...jamais].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))[0]
    add('jeu-en-attente', `${attente.name} n'a encore aucune partie enregistrée.`)
  }

  // Le jeu dont la dernière partie enregistrée est la plus ancienne (au moins 3 mois).
  const derniereDe = (e) => e.dates.reduce((m, d) => (d > m ? d : m), new Date(0))
  const oublies = classement
    .map(([id, e]) => ({ id, quand: derniereDe(e) }))
    .filter((x) => x.quand.getTime() > 0)
    .sort((a, b) => a.quand - b.quand)
  if (oublies.length) {
    const mois = Math.floor((Date.now() - oublies[0].quand.getTime()) / (1000 * 60 * 60 * 24 * 30))
    if (mois >= 3) add('oublie', `Aucune partie de ${gname(oublies[0].id)} depuis ${pluriel(mois, 'mois', 'mois')}.`)
  }

  const uneFois = classement.filter(([, e]) => e.n === 1)
  if (uneFois.length >= 2) add('une-seule-fois', `${nb(uneFois.length)}${NBSP}jeux n'ont qu'une seule partie enregistrée.`)

  // ===== 3. Le temps =====
  // ⚠️ `played_at` est l'heure de SAISIE : tous les chiffres de cette section sont plafonnés
  // à ce qui reste plausible pour une vraie soirée.
  const parJour = new Map()
  const parMois = new Map()
  const parAnnee = new Map()
  parties.forEach((p) => {
    const d = jourDe(p.played_at)
    if (!d) return
    parJour.set(cleJour(d), (parJour.get(cleJour(d)) || 0) + 1)
    const km = `${d.getFullYear()}-${d.getMonth()}`
    parMois.set(km, (parMois.get(km) || 0) + 1)
    parAnnee.set(d.getFullYear(), (parAnnee.get(d.getFullYear()) || 0) + 1)
  })
  if (parJour.size) {
    const [kj, n] = [...parJour.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    // Au-delà, ce n'est plus une soirée, c'est une saisie d'historique.
    if (n >= 3 && n <= 12) {
      const [y, m, j] = kj.split('-').map(Number)
      add('plus-grosse-soiree', `Record de la journée : ${pluriel(n, 'partie')} le ${j} ${MOIS[m]} ${y}.`)
    }
  }
  if (parMois.size >= 2) {
    const [km, n] = [...parMois.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const [y, m] = km.split('-').map(Number)
    if (n <= 60) add('plus-gros-mois', `Le mois le plus joueur : ${MOIS[m]} ${y}, ${pluriel(n, 'partie')}.`)
  }
  const dates = parties.map((p) => jourDe(p.played_at)).filter(Boolean).sort((a, b) => a - b)
  if (dates.length >= 2) {
    add('premiere-partie', `La toute première partie enregistrée date du ${dateCourte(dates[0])}.`)
    const jours = Math.max(1, Math.round((dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)))
    // Seulement avec du recul : sur quelques semaines, ce chiffre mesure la saisie.
    const parSemaine = (dates.length / jours) * 7
    if (jours >= 120 && parSemaine >= 0.5 && parSemaine <= 14)
      add('rythme', `En moyenne, ${parSemaine.toFixed(1).replace('.', ',')}${NBSP}parties par semaine.`)
  }
  // L'année en cours n'a d'intérêt QUE s'il existe une autre année : sinon « cette année »
  // et « en tout » désignent la même chose, et les deux anecdotes font doublon.
  const annee = new Date().getFullYear()
  if (parAnnee.size >= 2 && (parAnnee.get(annee) || 0) >= 3) {
    const cetteAnnee = parties.filter((p) => { const d = jourDe(p.played_at); return d && d.getFullYear() === annee })
    const parJeuAn = new Map()
    cetteAnnee.forEach((p) => parJeuAn.set(p.game_id, (parJeuAn.get(p.game_id) || 0) + 1))
    const [id, n] = [...parJeuAn.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]
    add('roi-de-lannee', `Le jeu de ${annee} : ${gname(id)}, ${pluriel(n, 'partie')}.`)
    add('total-annee', `${pluriel(cetteAnnee.length, 'partie')} enregistrées depuis le début de ${annee}.`)
  }


  // ===== 4. Les scores =====
  // ⚠️ Le sens du score, jeu par jeu. À défaut : « le plus haut gagne », le cas des 33 fiches
  // sur 61. La table est interrogée APRÈS le remappage des doublons (`memeJeu`), avec repli.
  const sensDe = (id) => (scoringById && scoringById.get ? scoringById.get(id) : null) || 'high'
  // ⚠️ Un score n'est comparable que s'il désigne QUELQU'UN et qu'il y avait quelqu'un à
  // battre : ni en coopératif (c'est le groupe), ni en équipes (le total de l'équipe est
  // recopié sur chaque membre → on couronnerait un joueur pour le score de son binôme —
  // la partie de Belote en base porte le même 1010 sur deux joueurs), ni en solo.
  const partiesScorables = (e) =>
    e.plays.filter((p) => scoreCounts(p) && !estCoop(p) && !estEquipes(p) && (p.players || []).length >= 2)
  const records = []
  parJeu.forEach((e, id) => {
    const sens = sensDe(id)
    if (sens === 'none') return
    let best = null
    partiesScorables(e).forEach((p) => {
      ;(p.players || []).forEach((pl) => {
        const t = Number(pl?.total)
        const n = (pl?.name || '').trim()
        if (!Number.isFinite(t) || !vraiNom(n)) return
        if (!best || (sens === 'low' ? t < best.t : t > best.t)) best = { t, nom: n }
      })
    })
    if (best && e.n >= 3) records.push({ id, sens, ...best })
  })
  records.sort((a, b) => b.t - a.t || String(a.id).localeCompare(String(b.id)))
  records.slice(0, 3).forEach((r, i) =>
    add(`record-${i}`, r.sens === 'low'
      ? `Record à ${gname(r.id)} : ${nb(r.t)}${NBSP}points, par ${r.nom} — le plus petit score gagne.`
      : `Record à ${gname(r.id)} : ${nb(r.t)}${NBSP}points, par ${r.nom}.`)
  )

  // ── Le record qui TIENT ────────────────────────────────────────────────────────────────
  // Elle compte des PARTIES, pas des jours : elle est donc immunisée contre `played_at`,
  // qui est l'heure de saisie. Et elle se tait si le record vient de tomber.
  let tenu = null
  parJeu.forEach((e, id) => {
    const sens = sensDe(id)
    if (sens === 'none') return
    const chrono = partiesScorables(e)
      .map((p) => {
        const t = (p.players || [])
          .filter((x) => vraiNom((x?.name || '').trim()))
          .map((x) => Number(x?.total))
          .filter(Number.isFinite)
        return t.length ? { p, v: sens === 'low' ? Math.min(...t) : Math.max(...t) } : null
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.p.played_at) - new Date(b.p.played_at))
    if (chrono.length < 6) return
    const meilleur = sens === 'low'
      ? Math.min(...chrono.map((x) => x.v))
      : Math.max(...chrono.map((x) => x.v))
    const pos = chrono.findIndex((x) => x.v === meilleur)
    const depuis = chrono.length - 1 - pos
    if (depuis >= 5 && (!tenu || depuis > tenu.depuis)) tenu = { id, v: meilleur, depuis }
  })
  if (tenu) {
    add('record-tenu', `Le record à ${gname(tenu.id)} (${nb(tenu.v)}${NBSP}points) tient depuis ${pluriel(tenu.depuis, 'partie')}.`)
  }

  // ── La revanche : combien de défaites avant la première victoire ───────────────────────
  // ⚠️ hors coopératif : `playWinners` y couronne toute la table, tout le monde aurait
  // « gagné sa première partie » d'un coup. Elle ne parle d'aucune date : l'ordre de saisie
  // peut la décaler, jamais la contredire.
  let revanche = null
  parJeu.forEach((e, id) => {
    const chrono = e.plays
      .filter((p) => !estCoop(p) && playWinners(p).length > 0)
      .sort((a, b) => new Date(a.played_at) - new Date(b.played_at))
    const defaites = new Map()
    const gagne = new Set()
    chrono.forEach((p) => {
      const gagnants = new Set(playWinners(p))
      ;[...new Set((p.players || []).map((x) => (x?.name || '').trim()).filter(vraiNom))].forEach((n) => {
        if (gagne.has(n)) return
        if (gagnants.has(n)) {
          const d = defaites.get(n) || 0
          if (d >= 3 && (!revanche || d > revanche.d)) revanche = { id, nom: n, d }
          gagne.add(n)
        } else {
          defaites.set(n, (defaites.get(n) || 0) + 1)
        }
      })
    })
  })
  if (revanche) {
    add('revanche', `${revanche.nom} a perdu ${pluriel(revanche.d, 'fois', 'fois')} à ${gname(revanche.id)} avant de gagner sa première partie.`)
  }

  // Écart entre le 1er et le 2e. ⚠️ ni en coopératif (personne à battre) ni en équipes (le
  // score de l'équipe est recopié sur chaque membre → les deux premiers sont coéquipiers).
  const ecarts = []
  parties.filter((p) => scoreCounts(p) && !estCoop(p) && !estEquipes(p)).forEach((p) => {
    // ⚠️⚠️ LE SENS DU SCORE DÉCIDE QUI EST PREMIER. Trier toujours en décroissant mesurait, sur une
    // fiche « le plus petit gagne » (Odin), l'écart entre les DEUX PERDANTS : « la partie la plus
    // serrée : 2 points » là où la victoire s'est jouée à 58, et « égalité parfaite » alors que
    // quelqu'un avait gagné de 60. Et sur une fiche sans points, le total ne désigne personne.
    const sens = sensDe(p.game_id)
    if (sens === 'none') return
    const tot = (p.players || []).map((x) => Number(x?.total)).filter(Number.isFinite)
      .sort((a, b) => (sens === 'low' ? a - b : b - a))
    if (tot.length >= 2) ecarts.push({ p, e: Math.abs(tot[0] - tot[1]) })
  })
  if (ecarts.length >= 3) {
    const serre = ecarts.reduce((b, x) => (x.e < b.e ? x : b))
    const large = ecarts.reduce((b, x) => (x.e > b.e ? x : b))
    const d1 = jourDe(serre.p.played_at)
    add('plus-serree', serre.e === 0
      ? `Déjà une égalité parfaite à ${gname(serre.p.game_id)}.`
      : `La partie la plus serrée : ${nb(serre.e)}${NBSP}point${serre.e > 1 ? 's' : ''} d'écart à ${gname(serre.p.game_id)}${d1 ? `, le ${dateCourte(d1)}` : ''}.`)
    if (large.e >= 20) add('plus-large', `La plus large victoire : ${nb(large.e)}${NBSP}points d'écart à ${gname(large.p.game_id)}.`)
  }

  // ===== 5. Les coopératifs =====
  const coops = parties.filter(estCoop)
  if (coops.length >= 3) {
    const gagnees = coops.filter((p) => p.outcome === 'win').length
    add('coop-global', `Les jeux coopératifs sont réussis ${nb(Math.round((gagnees / coops.length) * 100))}${NBSP}% du temps.`)
    const parJeuCoop = new Map()
    coops.forEach((p) => {
      const e = parJeuCoop.get(p.game_id) || { n: 0, w: 0 }
      e.n++
      if (p.outcome === 'win') e.w++
      parJeuCoop.set(p.game_id, e)
    })
    const durs = [...parJeuCoop.entries()].filter(([, e]) => e.n >= 3)
    if (durs.length) {
      const dur = durs.reduce((b, x) => (x[1].w / x[1].n < b[1].w / b[1].n ? x : b))
      // « résiste » n'a de sens que s'il a effectivement résisté.
      if (dur[1].w / dur[1].n < 0.6)
        add('coop-dur', `${gname(dur[0])} résiste : ${nb(dur[1].w)}${NBSP}victoire${dur[1].w > 1 ? 's' : ''} sur ${pluriel(dur[1].n, 'tentative')}.`)
    }
  }

  // ===== 6. Les séries =====
  // ⚠️ DEUX précautions. (a) Hors coopératif : une victoire collective couronne toute la
  // table, ce qui donnerait la même « série » à tout le monde. (b) La série doit s'étaler
  // sur au moins trois JOURNÉES différentes : `played_at` étant l'heure de saisie, une
  // rafale d'historique tapée en trois minutes produirait sinon des séries fantômes.
  let serie = null
  parJeu.forEach((e, id) => {
    const chrono = e.plays.filter((p) => !estCoop(p)).sort((a, b) => new Date(a.played_at) - new Date(b.played_at))
    const encours = new Map() // nom → { n, jours:Set }
    chrono.forEach((p) => {
      const gagnants = new Set(playWinners(p))
      const d = jourDe(p.played_at)
      const presents = new Set((p.players || []).map((x) => (x?.name || '').trim()).filter(vraiNom))
      presents.forEach((n) => {
        if (!gagnants.has(n)) { encours.set(n, { n: 0, jours: new Set() }); return }
        const c = encours.get(n) || { n: 0, jours: new Set() }
        c.n++
        if (d) c.jours.add(cleJour(d))
        encours.set(n, c)
        if (c.n >= 3 && c.jours.size >= 3 && (!serie || c.n > serie.n)) serie = { n: c.n, nom: n, id }
      })
    })
  })
  if (serie) add('serie', `${serie.nom} a enchaîné ${pluriel(serie.n, 'victoire')} d'affilée à ${gname(serie.id)}.`)

  // ===== 7. Les goûts (tierlists) =====
  ajouteTierlists()

  return out
}

/**
 * L'anecdote du jour. PAS un tirage : un PARCOURS.
 * Les anecdotes sont rangées dans un ordre fixe (le haché de leur clé) et servies une par
 * jour, en boucle : toute fenêtre de N jours consécutifs les contient chacune une fois et
 * une seule. Avec au moins 30 entrées, rien ne se répète en un mois. Et comme tout est
 * déterministe, deux appareils voient la même chose le même jour.
 */
export function anecdoteDuJour(liste, date = new Date()) {
  if (!liste || !liste.length) return null
  // Numéro du jour (heure LOCALE : le changement se fait à minuit chez soi).
  const jour = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  const n = liste.length
  // ⚠️ ne PAS re-mélanger à chaque tour : une anecdote de la fin d'un tour pourrait
  // ressortir au début du suivant (mesuré). L'ordre fixe donne la garantie pour TOUTE
  // fenêtre de n jours, pas seulement pour les tours alignés.
  const ordre = [...liste].sort((a, b) => hash(a.key) - hash(b.key) || a.key.localeCompare(b.key))
  return ordre[((jour % n) + n) % n]
}
