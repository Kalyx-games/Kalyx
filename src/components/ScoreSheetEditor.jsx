import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BackIcon, PlusIcon } from './icons'
import { messageUtilisateur } from '../lib/messages'
import { parseExtensions } from '../lib/games'

// ÉDITEUR D'UNE FICHE DE SCORE — la page qui décrit comment un jeu se compte.
//
// ⚠️ REFONTE (retour user : « je le trouve très fouilli »). La règle qui tient tout :
//
//    LA PAGE A TOUJOURS EXACTEMENT TROIS CARTES, DANS LE MÊME ORDRE, AVEC LES MÊMES
//    TITRES. Rien n'apparaît, rien ne disparaît : une carte qui n'a rien à demander
//    devient une PHRASE. Rempli ⇒ ouvert ; vide ⇒ replié, mais nommé, avec sa valeur.
//
// Ce que ça corrige, mesuré sur la vraie base (62 fiches) : l'écran faisait 3,7 écrans de
// défilement et 52 contrôles ; « Variantes » occupait 28 % de la page alors que 43 fiches
// n'en ont aucune ; et surtout des CARTES ENTIÈRES s'évaporaient quand on changeait un
// réglage (taper « Pas de points » faisait disparaître les catégories, sans un mot).
//
// ⚠️⚠️ RÈGLE D'ÉCRITURE (retour user après la 1re version : « il y a encore beaucoup trop de
// texte partout […] tu l'as alourdi avec plein de surexplication, de redondance malvenue et de
// libellés trop longs ») :
//    LE LIBELLÉ PORTE LE SENS. On n'explique pas ce que l'interface montre déjà ; on ne redit
//    pas le contexte au début de chaque ligne ; un exemple vit DANS le champ, jamais à côté.
// Un texte n'est gardé que s'il apprend quelque chose qu'on ne peut PAS déduire de l'écran.
//
// ⚠️ AUCUNE MIGRATION : le template écrit est strictement le même qu'avant. Seul
// `extensions` change de source — il est DÉDUIT des lignes qui s'y rattachent au lieu
// d'être saisi à part (vérifié : cette liste ne servait qu'à remplir son propre menu).

let cid = 0
// `orig` = nom de la ligne tel qu'il était en base à l'ouverture. Sert à détecter un
// RENOMMAGE au moment d'enregistrer (les scores des parties sont rangés par nom de
// catégorie → il faut les renommer aussi, sinon les stats gardent l'ancien nom).
// `value` (facultatif) = la ligne vaut TOUJOURS ce nombre de points → à la saisie d'une
// partie, il n'y a qu'une case à cocher au lieu d'un score à taper.
const mkCat = (c = {}) => ({
  id: ++cid,
  label: c.label || '',
  hint: c.hint || '',
  ext: c.ext || '',
  value: c.value != null ? String(c.value) : '',
  orig: c.label || '',
})
let teid = 0
const mkTeam = (t = {}) => ({ id: ++teid, name: t.name || '', size: t.size != null ? String(t.size) : '' })
let trid = 0
const mkTrigger = (name = '') => ({ id: ++trid, name })
let oid = 0
const mkOption = (name = '') => ({ id: ++oid, name })

// Les trois façons de gagner, en une seule question. ⚠️ Elles remplacent DEUX puces
// (compétitif / coopératif) PLUS une case à cocher de 18 px (« En équipes ») perdue au
// milieu — la plus petite cible de l'écran, contre une norme maison à 44. Et elles
// rendent l'état absurde « coopératif + équipes » structurellement impossible, là où il
// était seulement empêché par un effet de bord.
const QUI = [
  { cle: 'solo', titre: 'Un joueur seul' },
  { cle: 'equipe', titre: 'Une équipe' },
  { cle: 'groupe', titre: 'Tout le monde ensemble' },
]

export default function ScoreSheetEditor({ game, template, online, closing = false, onSave, onClose, dirtyRef }) {
  const isNew = !template
  // Extensions ENREGISTRÉES pour ce jeu (choix possibles).
  const availableExts = parseExtensions(game?.extensions).map((e) => e.name).filter(Boolean)

  const [win, setWin] = useState(() => template?.win || (template?.mode === 'coop' ? 'coop' : 'competitive'))
  const [scoring, setScoring] = useState(() => template?.scoring || 'high')
  const [teamsOn, setTeamsOn] = useState(() => !!template?.teams?.on)
  const isCoop = win === 'coop'
  const qui = isCoop ? 'groupe' : teamsOn ? 'equipe' : 'solo'
  // Une seule réponse à la fois : c'est ce qui remplace deux bascules indépendantes qui
  // pouvaient se contredire.
  const choisirQui = (cle) => {
    setWin(cle === 'groupe' ? 'coop' : 'competitive')
    setTeamsOn(cle === 'equipe')
  }

  // Mode de saisie d'une partie (compétitif à points, ≥ 2 lignes) : 'byPlayer' = une page
  // par joueur, 'byItem' = une page par catégorie.
  // ⚠️ GARDÉ malgré 0 fiche sur 62 en « par joueur » — décision user, mot pour mot :
  // « ce n'est pas parce que ce n'est pas encore utilisé que ça ne le sera jamais ».
  // Il descend simplement au bas de sa carte, replié.
  const [entry, setEntry] = useState(() => (template?.entry === 'byPlayer' ? 'byPlayer' : 'byItem'))
  const [instant, setInstant] = useState(() => template?.instant ?? template?.scoring === 'none')
  const [triggers, setTriggers] = useState(() => (template?.triggers || []).map((n) => mkTrigger(n)))

  // Deux variantes indépendantes (nom + valeurs), chacune optionnelle :
  //  · PAR JOUEUR (héros, faction… — Dice Throne) ; · POUR TOUTE LA PARTIE (carte — Toy Battle).
  // Rétrocompat : une ancienne fiche avec `variant.scope === 'play'` = variante de partie.
  const legacyPlay = template?.variant?.scope === 'play' ? template.variant : null
  const perPlayerVariant = legacyPlay ? null : template?.variant || null
  const perPlayVariant = template?.playVariant || legacyPlay || null
  const [variantLabel, setVariantLabel] = useState(() => perPlayerVariant?.label || '')
  const [variantOptions, setVariantOptions] = useState(() => (perPlayerVariant?.options || []).map((n) => mkOption(n)))
  const [playVariantLabel, setPlayVariantLabel] = useState(() => perPlayVariant?.label || '')
  const [playVariantOptions, setPlayVariantOptions] = useState(() => (perPlayVariant?.options || []).map((n) => mkOption(n)))
  const [teamList, setTeamList] = useState(() => (template?.teams?.list || []).map(mkTeam))

  // ⚠️ TOUT EST REPLIÉ À L'OUVERTURE, sans exception. J'avais d'abord ouvert d'office les
  // lignes déjà renseignées (« rempli ⇒ ouvert ») ; sur une fiche comme Abyss cela en
  // déployait quatre d'un coup, et l'user a tranché : « j'aimerais qu'ils soient tous
  // repliés ». Une page qui s'ouvre calme vaut mieux qu'une page qui devine.
  const [cats, setCats] = useState(() => (template?.categories || []).map(mkCat))
  const [lignesOuvertes, setLignesOuvertes] = useState(() => new Set())
  const basculeLigne = (id) =>
    setLignesOuvertes((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // Extensions cochées d'avance (saisie d'une partie + filtre des stats).
  // Compat : ancien 'all' → toutes, 'none'/absent → aucune.
  const [extDefault, setExtDefault] = useState(() => {
    const d = template?.extDefault
    if (Array.isArray(d)) return d.filter((n) => availableExts.includes(n))
    if (d === 'all') return [...availableExts]
    return []
  })
  const toggleExtDefault = (n) =>
    setExtDefault((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))

  const [notes, setNotes] = useState(() => template?.notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(() => (template?.categories || []).length > 0)

  // Les lignes de « Autres réglages » : repliées elles aussi, et sans rien perdre — elles
  // portent leur VALEUR à droite (« Héros, par joueur »), donc on sait ce qu'il y a dedans
  // sans ouvrir.
  const [ouverts, setOuverts] = useState(() => new Set())
  const bascule = (k) =>
    setOuverts((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  const addVariantOption = () => setVariantOptions((o) => [...o, mkOption()])
  const updVariantOption = (id, name) => setVariantOptions((o) => o.map((x) => (x.id === id ? { ...x, name } : x)))
  const delVariantOption = (id) => setVariantOptions((o) => o.filter((x) => x.id !== id))
  const addPlayVariantOption = () => setPlayVariantOptions((o) => [...o, mkOption()])
  const updPlayVariantOption = (id, name) => setPlayVariantOptions((o) => o.map((x) => (x.id === id ? { ...x, name } : x)))
  const delPlayVariantOption = (id) => setPlayVariantOptions((o) => o.filter((x) => x.id !== id))
  const addTeam = () => setTeamList((t) => [...t, mkTeam()])
  const updTeam = (id, field, val) => setTeamList((t) => t.map((x) => (x.id === id ? { ...x, [field]: val } : x)))
  const delTeam = (id) => setTeamList((t) => t.filter((x) => x.id !== id))
  const addTrigger = () => setTriggers((t) => [...t, mkTrigger()])
  const updTrigger = (id, name) => setTriggers((t) => t.map((x) => (x.id === id ? { ...x, name } : x)))
  const delTrigger = (id) => setTriggers((t) => t.filter((x) => x.id !== id))
  const addCat = () => {
    setDetail(true)
    setCats((c) => [...c, mkCat()])
  }
  const updCat = (id, field, val) => setCats((c) => c.map((x) => (x.id === id ? { ...x, [field]: val } : x)))
  const delCat = (id) => setCats((c) => c.filter((x) => x.id !== id))

  // --- Réordonner les lignes en les glissant par leur poignée (⠿) ---
  // Écouteurs tactiles NATIFS : ceux de React sont passifs → impossible de bloquer le
  // défilement de la page pendant le glissé (même piège que le glissé des cartes).
  const catsRef = useRef(cats)
  catsRef.current = cats
  const listRef = useRef(null)
  const dragRef = useRef(null)
  const [dragId, setDragId] = useState(null)

  // --- Animation FLIP : les lignes GLISSENT vers leur nouvelle place ---
  const flipRef = useRef(null)
  const snapshot = () => {
    const el = listRef.current
    if (!el) return
    const map = new Map()
    el.querySelectorAll('[data-cat]').forEach((r) => map.set(r.dataset.cat, r.getBoundingClientRect().top))
    flipRef.current = map
  }
  useLayoutEffect(() => {
    const el = listRef.current
    const prev = flipRef.current
    flipRef.current = null
    if (!el || !prev) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.querySelectorAll('[data-cat]').forEach((r) => {
      const before = prev.get(r.dataset.cat)
      if (before == null) return
      const delta = before - r.getBoundingClientRect().top
      if (!delta) return
      r.style.transition = 'none'
      r.style.transform = `translateY(${delta}px)`
      requestAnimationFrame(() => {
        r.style.transition = 'transform 180ms ease'
        r.style.transform = ''
      })
    })
  }, [cats])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const yOf = (e) => (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY)
    const start = (e) => {
      const grip = e.target.closest('.cat-grip')
      if (!grip || !el.contains(grip)) return
      const row = grip.closest('[data-cat]')
      if (!row) return
      dragRef.current = Number(row.dataset.cat)
      setDragId(dragRef.current)
      if (e.cancelable) e.preventDefault() // pas de défilement / sélection pendant le glissé
    }
    const move = (e) => {
      if (dragRef.current == null) return
      if (e.cancelable) e.preventDefault()
      const y = yOf(e)
      const from = catsRef.current.findIndex((c) => c.id === dragRef.current)
      if (from < 0) return
      let to = from
      ;[...el.querySelectorAll('[data-cat]')].forEach((r, i) => {
        const b = r.getBoundingClientRect()
        const mid = b.top + b.height / 2
        if (i < from && y < mid) to = Math.min(to, i)
        if (i > from && y > mid) to = Math.max(to, i)
      })
      if (to === from) return
      snapshot() // positions AVANT le réordonnancement → animation FLIP après le rendu
      setCats((list) => {
        const next = [...list]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item)
        return next
      })
    }
    const end = () => {
      if (dragRef.current == null) return
      dragRef.current = null
      setDragId(null)
    }
    el.addEventListener('touchstart', start, { passive: false })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('mousedown', start)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('mousedown', start)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
    }
  }, [])

  // ── Ce que la fiche donnera À LA PARTIE ──────────────────────────────────────────
  // La seule ligne de la page qui traduit les réglages en CONSÉQUENCE, au lieu de
  // répéter ce qui est coché. C'est elle qui garantit qu'une page repliée ne peut pas
  // mentir sur ce qu'elle contient.
  const catsNommees = cats.filter((c) => c.label.trim())
  const detailActif = detail && scoring !== 'none' && !teamsOn
  const phrase = (() => {
    if (qui === 'groupe') {
      return scoring === 'none'
        ? <>Vous direz si le groupe a <b>gagné ou perdu</b>.</>
        : <>Vous direz si le groupe a gagné ou perdu, <b>et son score</b>.</>
    }
    if (qui === 'equipe') {
      return scoring === 'none'
        ? <>Vous <b>désignerez l’équipe gagnante</b>.</>
        : <>Un score <b>par équipe</b>, {scoring === 'low' ? 'le plus petit' : 'le plus haut'} gagne.</>
    }
    if (scoring === 'none') return <>Vous <b>désignerez le gagnant</b>, sans compter de points.</>
    return <>Chacun tape ses points, <b>{scoring === 'low' ? 'le plus petit' : 'le plus haut'} gagne</b>.</>
  })()
  // ⚠️ PAS de compléments (« Score détaillé en 9 lignes », « Une partie peut se gagner d'un
  // coup »…) : ils redisent ce que la case cochée et les lignes montrent à trois centimètres.
  // La phrase ne garde que ce qu'on ne peut lire nulle part ailleurs — la CONSÉQUENCE.

  // ── Ce qui manque, dit dans la barre du bas ──────────────────────────────────────
  // ⚠️ Avant, l'erreur naissait en DERNIER élément d'une page de 2 400 px alors que le
  // bouton flotte en bas : on tapait Enregistrer et rien ne semblait bouger.
  const comptes = new Map()
  catsNommees.forEach((c) => comptes.set(c.label.trim(), (comptes.get(c.label.trim()) || 0) + 1))
  const doublons = new Set([...comptes].filter(([, n]) => n > 1).map(([l]) => l))
  const ref0 = useRef(null)
  const instantane = JSON.stringify([
    win, scoring, teamsOn, entry, instant,
    triggers.map((t) => t.name), variantLabel, variantOptions.map((o) => o.name),
    playVariantLabel, playVariantOptions.map((o) => o.name),
    teamList.map((t) => [t.name, t.size]), notes, extDefault,
    cats.map((c) => [c.label, c.hint, c.ext, c.value]),
  ])
  if (ref0.current === null) ref0.current = instantane
  const modifie = instantane !== ref0.current
  // La garde anti-perte d'App lit ce drapeau : replier des sections rend la perte plus
  // facile encore, puisqu'on ne voit plus ce qu'on a saisi.
  useEffect(() => {
    if (!dirtyRef) return
    dirtyRef.current = modifie
    return () => {
      dirtyRef.current = false
    }
  })

  const aide = !online
    ? 'Hors ligne : impossible d’enregistrer une fiche.'
    : doublons.size
      ? 'Deux lignes portent le même nom.'
      : err || ''
  const bloque = busy || !online || doublons.size > 0 || (!isNew && !modifie)

  const save = async () => {
    const categories = cats
      .map((c) => {
        const v = Number(c.value)
        return {
          label: c.label.trim(),
          hint: c.hint.trim() || null,
          ext: c.ext || null,
          // Valeur fixe → case à cocher à la saisie. Vide / illisible = score libre.
          value: c.value.trim() !== '' && Number.isFinite(v) ? v : null,
        }
      })
      .filter((c) => c.label)
    // ⚠️ `extensions` est désormais DÉDUIT : c'est l'ensemble des extensions réellement
    // rattachées à une ligne. La section « Qui modifient le score » disparaît donc, sans
    // rien perdre — vérifié, cette liste n'avait aucun lecteur ailleurs dans l'app.
    const extList = [...new Set(categories.map((c) => c.ext).filter(Boolean))]
    const vLabel = variantLabel.trim()
    const variant = vLabel
      ? { label: vLabel, options: variantOptions.map((o) => o.name.trim()).filter(Boolean) }
      : null
    const pvLabel = playVariantLabel.trim()
    const playVariant = pvLabel
      ? { label: pvLabel, options: playVariantOptions.map((o) => o.name.trim()).filter(Boolean) }
      : null
    // Lignes renommées → les parties déjà enregistrées doivent suivre (leurs scores sont
    // rangés par nom). On ignore un renommage vers un nom déjà pris.
    const taken = new Set(categories.map((c) => c.label))
    const renames = cats
      .map((c) => ({ from: c.orig.trim(), to: c.label.trim() }))
      .filter((r) => r.from && r.to && r.from !== r.to && !cats.some((c) => c.orig.trim() === r.to))
      .filter((r) => taken.has(r.to))
    const teams = {
      on: teamsOn,
      list: teamList
        .map((t) => ({ name: t.name.trim(), size: t.size.trim() !== '' && Number(t.size) > 0 ? Number(t.size) : null }))
        .filter((t) => t.name),
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(
        game.id,
        {
          win,
          scoring,
          entry,
          // « Sans compter de points » implique la victoire directe : c'est la même idée.
          // Cela rend inatteignable l'ancienne erreur « choisissez au moins… ».
          instant: scoring === 'none' ? true : instant,
          triggers: scoring === 'none' || instant ? triggers.map((t) => t.name.trim()).filter(Boolean) : [],
          scenario: false, // paramètre retiré de l'app (voir ScoreSheet) — nettoyé à chaque enregistrement
          teams,
          notes: notes.trim(),
          categories,
          extensions: extList,
          extDefault,
          variant,
          playVariant,
        },
        renames
      )
      // ⚠️ La fiche est enregistrée : plus rien à perdre. Sans cette ligne, `onClose` —
      // qui passe par la garde anti-perte — demanderait « Quitter sans enregistrer ? »
      // juste après un enregistrement réussi. La lecture du drapeau est synchrone, les
      // rendus qui suivent ne peuvent plus changer la décision.
      if (dirtyRef) dirtyRef.current = false
      onClose()
    } catch (e) {
      setErr(messageUtilisateur(e))
    } finally {
      setBusy(false)
    }
  }

  // Une rangée de choix : pleine largeur, 48 px, exclusive. Remplace les puces qu'on
  // pouvait toutes éteindre — d'où des cartes qui disparaissaient sans explication.
  const rangee = (actif, titre, onClick) => (
    <button type="button" className={`fs-rang${actif ? ' on' : ''}`} onClick={onClick} aria-pressed={actif}>
      <span className="fs-rond" aria-hidden="true" />
      <span className="fs-rang-t">{titre}</span>
    </button>
  )

  const ligneRepli = (cle, titre, valeur, contenu) => (
    <div className={`fs-repli${ouverts.has(cle) ? ' on' : ''}`}>
      <button type="button" className="fs-repli-tete" onClick={() => bascule(cle)} aria-expanded={ouverts.has(cle)}>
        <span className="fs-repli-t">{titre}</span>
        <span className="fs-repli-v">{valeur}</span>
        <span className="hist-toggle-chev" aria-hidden="true">▾</span>
      </button>
      {ouverts.has(cle) && <div className="fs-repli-corps">{contenu}</div>}
    </div>
  )

  const valeurVariantes = (() => {
    const v = []
    if (variantLabel.trim()) v.push(`${variantLabel.trim()}, par joueur`)
    if (playVariantLabel.trim()) v.push(`${playVariantLabel.trim()}, pour la table`)
    return v.length ? v.join(' · ') : 'Aucune'
  })()

  return (
    <div className={`sheet${closing ? ' closing' : ''}`}>
      <div className="settings-head">
        <button type="button" className="back-btn" onClick={onClose} aria-label="Retour"><BackIcon /></button>
        {/* Le nom du jeu passe en sous-titre : en titre, il était tronqué par l'ellipse. */}
        <div className="fs-tete">
          <h2 className="sheet-title">Fiche de score</h2>
          <p className="fs-jeu">{game?.name}</p>
        </div>
      </div>

      <p className="fs-phrase">{phrase}</p>

      <section className="settings-card">
        <h3>Comment on gagne</h3>

        <p className="fs-lab">Qui peut gagner</p>
        {QUI.map((q) => rangee(qui === q.cle, q.titre, () => choisirQui(q.cle)))}

        {qui === 'equipe' && (
          <div className="fs-sous">
            <p className="fs-lab">Vos équipes <span className="field-opt">(facultatif)</span></p>
            {teamList.map((t) => (
              <div key={t.id} className="team-edit">
                <input className="cat-edit-label" value={t.name} onChange={(e) => updTeam(t.id, 'name', e.target.value)} placeholder="ex. Rouge" />
                <input className="team-size" type="number" inputMode="numeric" min="1" value={t.size} onChange={(e) => updTeam(t.id, 'size', e.target.value)} placeholder="effectif" />
                <button type="button" className="ext-row-x" onClick={() => delTeam(t.id)} aria-label="Retirer l’équipe">×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-add" onClick={addTeam}><PlusIcon size={14} /> Ajouter une équipe</button>
          </div>
        )}

        <p className="fs-lab fs-lab-2">Comment on le désigne</p>
        {qui === 'groupe' ? (
          <>
            {rangee(scoring !== 'none', 'Le groupe marque des points', () => setScoring('high'))}
            {rangee(scoring === 'none', 'Il n’y a pas de points à compter', () => setScoring('none'))}
          </>
        ) : (
          <>
            {rangee(scoring === 'high', 'Le plus de points gagne', () => setScoring('high'))}
            {rangee(scoring === 'low', 'Le moins de points gagne', () => setScoring('low'))}
            {rangee(scoring === 'none', 'Sans compter de points', () => setScoring('none'))}
          </>
        )}

        {scoring !== 'none' && (
          <button type="button" className={`fs-case${instant ? ' on' : ''}`} onClick={() => setInstant((v) => !v)} aria-pressed={instant}>
            <span className="fs-carre" aria-hidden="true" />
            <span className="fs-rang-t">La partie peut se gagner d’un coup</span>
          </button>
        )}

        {(instant || scoring === 'none') && (
          <div className="fs-sous">
            {/* « Déclencheur » était du vocabulaire d'ingénieur ; le placeholder donne l'exemple. */}
            <p className="fs-lab">Façons de gagner <span className="field-opt">(facultatif)</span></p>
            {triggers.map((t) => (
              <div key={t.id} className="ext-chip-row">
                <input className="cat-edit-label" value={t.name} onChange={(e) => updTrigger(t.id, e.target.value)} placeholder="ex. 4 pions alignés" />
                <button type="button" className="ext-row-x" onClick={() => delTrigger(t.id)} aria-label="Retirer cette façon de gagner">×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-add" onClick={addTrigger}><PlusIcon size={14} /> Ajouter une façon de gagner</button>
          </div>
        )}
      </section>

      {/* ⚠️ CETTE CARTE NE DISPARAÎT JAMAIS. Avant, elle s'évaporait dès qu'on passait en
          équipes ou sans points — l'écran changeait de hauteur sans un mot. Elle a
          quatre visages ; trois d'entre eux sont une simple phrase. */}
      <section className="settings-card">
        <h3>Ce qu’on compte</h3>

        {qui === 'equipe' ? (
          <p className="field-hint fs-seule">Un score par équipe.</p>
        ) : scoring === 'none' ? (
          <p className="field-hint fs-seule">Rien à compter.</p>
        ) : qui === 'groupe' && !detail ? (
          <>
            <p className="field-hint fs-seule">Une seule case pour le groupe.</p>
            <button type="button" className="btn-ghost fs-detailler" onClick={addCat}>Détailler le score</button>
          </>
        ) : !detail || cats.length === 0 ? (
          <>
            <p className="field-hint fs-seule">Une seule case « Points » par joueur.</p>
            <button type="button" className="btn-ghost fs-detailler" onClick={addCat}>Détailler le score</button>
          </>
        ) : (
          <>
            <div ref={listRef}>
              {cats.map((c) => {
                const ouverte = lignesOuvertes.has(c.id)
                const enDouble = c.label.trim() && doublons.has(c.label.trim())
                return (
                  <div key={c.id} data-cat={c.id} className={`cat-edit ${dragId === c.id ? 'dragging' : ''}`}>
                    <div className="cat-edit-row">
                      {/* Réordonner n'a de sens qu'à partir de deux lignes — et la poignée
                          vole 24 px et le doigt (touch-action: none). */}
                      {cats.length > 1 && (
                        <span className="cat-grip" role="button" tabIndex={-1} aria-label="Déplacer la ligne" title="Glisser pour réordonner">
                          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
                            {[3, 8, 13].map((y) => (
                              <g key={y}>
                                <circle cx="2.5" cy={y} r="1.4" fill="currentColor" />
                                <circle cx="7.5" cy={y} r="1.4" fill="currentColor" />
                              </g>
                            ))}
                          </svg>
                        </span>
                      )}
                      <input
                        className="cat-edit-label"
                        value={c.label}
                        onChange={(e) => updCat(c.id, 'label', e.target.value)}
                        placeholder="ex. Seigneurs"
                      />
                      <button type="button" className={`fs-plus${ouverte ? ' on' : ''}`} onClick={() => basculeLigne(c.id)} aria-label="Réglages de cette ligne" aria-expanded={ouverte}>▾</button>
                      <button type="button" className="ext-row-x" onClick={() => delCat(c.id)} aria-label="Retirer la ligne">×</button>
                    </div>

                    {enDouble && <p className="fs-err">Ce nom est déjà pris par une autre ligne.</p>}
                    {c.orig.trim() && c.label.trim() && c.label.trim() !== c.orig.trim() && (
                      <p className="field-hint fs-info">Les parties déjà enregistrées suivront ce nouveau nom.</p>
                    )}

                    {ouverte && (
                      <div className="fs-ligne-detail">
                        <p className="fs-lab">Explication <span className="field-opt">(facultatif)</span></p>
                        <input
                          className="cat-edit-label"
                          value={c.hint}
                          onChange={(e) => updCat(c.id, 'hint', e.target.value)}
                          placeholder="ex. 2 points par seigneur allié"
                        />

                        <label className="fs-mini">
                          <input type="checkbox" checked={c.value !== ''} onChange={(e) => updCat(c.id, 'value', e.target.checked ? '0' : '')} />
                          <span>Nombre de points fixe</span>
                        </label>
                        {c.value !== '' && (
                          <>
                            <input
                              className="cat-edit-value"
                              type="number"
                              inputMode="numeric"
                              value={c.value}
                              onChange={(e) => updCat(c.id, 'value', e.target.value)}
                              placeholder="0"
                            />
                          </>
                        )}

                        {availableExts.length > 0 && (
                          <>
                            <label className="fs-mini">
                              <input type="checkbox" checked={!!c.ext} onChange={(e) => updCat(c.id, 'ext', e.target.checked ? availableExts[0] : '')} />
                              <span>Réservée à une extension</span>
                            </label>
                            {c.ext && (
                              <>
                                {/* ⚠️ Des puces, pas un <select> : le menu natif d'Android s'ouvre en
                                    plein écran, un objet étranger à l'app — qui a banni le natif
                                    partout ailleurs (voir SortMenu). Et c'est déjà le motif des
                                    extensions, dans la même page. */}
                                <div className="chips">
                                  {availableExts.map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      className={`fchip ${c.ext === n ? 'on' : ''}`}
                                      onClick={() => updCat(c.id, 'ext', n)}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button type="button" className="btn-ghost btn-add" onClick={addCat}><PlusIcon size={14} /> Ajouter une ligne</button>

            {/* Le réglage de saisie descend ici, replié, et seulement quand il peut agir. */}
            {qui === 'solo' && catsNommees.length >= 2 &&
              ligneRepli(
                'saisie',
                'Saisie des scores',
                entry === 'byPlayer' ? 'Par joueur' : 'Par catégorie',
                <>
                  {rangee(entry === 'byItem', 'Une page par catégorie', () => setEntry('byItem'))}
                  {rangee(entry === 'byPlayer', 'Une page par joueur', () => setEntry('byPlayer'))}
                </>
              )}
          </>
        )}
      </section>

      <section className="settings-card">
        <h3>Autres réglages</h3>

        {ligneRepli(
          'variantes',
          'Variantes',
          valeurVariantes,
          <>
            <p className="fs-lab">Une par joueur</p>
            <input className="cat-edit-label" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="ex. Héros" />
            {variantLabel.trim() && (
              <div className="fs-sous">
                <p className="fs-lab">Valeurs proposées <span className="field-opt">(facultatif)</span></p>
                {variantOptions.map((o) => (
                  <div key={o.id} className="ext-chip-row">
                    <input className="cat-edit-label" value={o.name} onChange={(e) => updVariantOption(o.id, e.target.value)} placeholder="ex. Barbare" />
                    <button type="button" className="ext-row-x" onClick={() => delVariantOption(o.id)} aria-label="Retirer la valeur">×</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost btn-add" onClick={addVariantOption}><PlusIcon size={14} /> Ajouter une valeur</button>
              </div>
            )}
            <p className="fs-lab fs-lab-2">Une pour toute la partie</p>
            <input className="cat-edit-label" value={playVariantLabel} onChange={(e) => setPlayVariantLabel(e.target.value)} placeholder="ex. Mission" />
            {playVariantLabel.trim() && (
              <div className="fs-sous">
                <p className="fs-lab">Valeurs proposées <span className="field-opt">(facultatif)</span></p>
                {playVariantOptions.map((o) => (
                  <div key={o.id} className="ext-chip-row">
                    <input className="cat-edit-label" value={o.name} onChange={(e) => updPlayVariantOption(o.id, e.target.value)} placeholder="ex. Évasion" />
                    <button type="button" className="ext-row-x" onClick={() => delPlayVariantOption(o.id)} aria-label="Retirer la valeur">×</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost btn-add" onClick={addPlayVariantOption}><PlusIcon size={14} /> Ajouter une valeur</button>
              </div>
            )}
          </>
        )}

        {availableExts.length > 0 &&
          ligneRepli(
            'extensions',
            'Extensions',
            extDefault.length ? `${extDefault.length} cochée${extDefault.length > 1 ? 's' : ''} d’avance` : 'Aucune cochée d’avance',
            <>
              <div className="chips">
                {availableExts.map((n) => (
                  <button key={n} type="button" className={`fchip ${extDefault.includes(n) ? 'on' : ''}`} onClick={() => toggleExtDefault(n)}>{n}</button>
                ))}
              </div>
            </>
          )}

        {ligneRepli(
          'notes',
          'Notes',
          notes.trim() ? 'Renseignées' : 'Aucune',
          <>
            <textarea
              className="notes-area"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Rappels de règles, variante maison…"
              rows={4}
            />
          </>
        )}
      </section>

      <div className="sheet-editor-actions">
        {/* Ce qui manque se dit ICI, à 20 px du pouce — plus au bas d'une page longue. */}
        {aide && <p className={`fs-barre-aide${err ? ' err' : ''}`}>{aide}</p>}
        <div className="fs-barre-btns">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="btn-primary" onClick={save} disabled={bloque}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
