import { useEffect, useRef, useState } from 'react'
import PlayerPicker from './PlayerPicker'
import { CollectionIcon, WishlistIcon } from './icons'
import { expandRange, parseCounts, countsToText, parseOwners, ownersToText, parseTags, tagsToText, parseExtensions, serializeExtensions } from '../lib/games'
import { philibertSearchUrl } from '../lib/philibert'

// Formulaire d'ajout / modification d'un jeu (fenêtre modale).
// Propriétaires : cases multi-sélection (un jeu peut en avoir plusieurs) + ajout.
// Nombre de joueurs / idéal : cases à cocher. Statut : cases (Collection / Wishlist).

const EMPTY = { name: '', status: 'collection', duration: '', complexity: '', price: '', image_url: '', bgg_id: '' }

function toForm(game, defaultStatus, prefill) {
  if (!game) return { ...EMPTY, status: defaultStatus || 'collection', ...(prefill || {}) }
  const s = (v) => (v === null || v === undefined ? '' : String(v))
  return {
    name: s(game.name), status: game.status || 'collection',
    // Une seule durée par jeu : on affiche le maximum existant (les jeux importés ont min = max).
    duration: s(game.duration_max ?? game.duration_min),
    complexity: s(game.complexity), price: s(game.price), image_url: s(game.image_url), bgg_id: s(game.bgg_id),
  }
}

// Minuscules + sans accents/espaces superflus, pour comparer deux noms de jeu.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const normName = (s) => (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()

export default function GameForm({ game, owners, tags, existingGames = [], saving, onSave, onCancel, onDelete, defaultStatus, prefill }) {
  const [form, setForm] = useState(() => toForm(game, defaultStatus, prefill))
  const [playersSet, setPlayersSet] = useState(() =>
    game?.players ? parseCounts(game.players) : expandRange(game?.players_min, game?.players_max)
  )
  const [bestSet, setBestSet] = useState(() => parseCounts(game?.players_best))
  const [ownerSet, setOwnerSet] = useState(() => parseOwners(game?.owner))
  const [tagSet, setTagSet] = useState(() => parseTags(game?.tags))
  // Extensions : liste éditable (nom + nombre de joueurs facultatif), triée par nom
  // à l'ouverture et à l'enregistrement. Les joueurs d'une extension élargissent la
  // plage effective du jeu (filtre) sans écraser les données de base.
  const extIdRef = useRef(0)
  const [extList, setExtList] = useState(() =>
    parseExtensions(game?.extensions)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((e) => ({ id: extIdRef.current++, name: e.name, players: e.players, best: e.best }))
  )
  const addExtRow = () => setExtList((l) => [...l, { id: extIdRef.current++, name: '', players: '', best: '' }])
  const updateExt = (id, field, value) => setExtList((l) => l.map((x) => (x.id === id ? { ...x, [field]: value } : x)))
  const removeExt = (id) => setExtList((l) => l.filter((x) => x.id !== id))
  const [priceLoading, setPriceLoading] = useState(false)
  const [pricePhil, setPricePhil] = useState(null) // résultat du remplissage PRIX depuis Philibert (wishlist)
  const [imgLoading, setImgLoading] = useState(false)
  const [imgPhil, setImgPhil] = useState(null) // résultat de la recherche d'IMAGE Philibert (null | {found})
  // Import BoardGameGeek : recherche → liste de résultats → fiche pré-remplie.
  const [bggLoading, setBggLoading] = useState(false)
  const [bggResults, setBggResults] = useState(null) // null | [] | [{id,name,year}]
  const [bggPrev, setBggPrev] = useState(null) // snapshot (form + pickers) avant import, pour annuler
  const [bggFilled, setBggFilled] = useState(null) // { name } du jeu importé (pour le message)
  const [bggError, setBggError] = useState('') // message renvoyé par BGG (ex. 202 "prépare la réponse")

  // Glissé-pour-fermer + animation de fermeture (glisse vers le bas).
  const [dragY, setDragY] = useState(0)
  const [closing, setClosing] = useState(false)
  const draggingRef = useRef(false)
  const dragYRef = useRef(0)
  const setDrag = (v) => {
    dragYRef.current = v
    setDragY(v)
  }
  const animateClose = (action) => {
    if (closing) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      if (action) action()
      return
    }
    setClosing(true)
    setTimeout(() => action && action(), 260) // laisse le temps à la feuille de glisser
  }
  const requestCancel = () => animateClose(onCancel)

  // Glissé-pour-fermer depuis N'IMPORTE OÙ sur la feuille. On utilise des écouteurs
  // tactiles NATIFS non-passifs (React ne permet pas de bloquer le défilement) : on
  // n'engage le glissé que si on part de la poignée, OU si la zone de champs est déjà
  // tout en haut ; sinon un geste vers le bas fait défiler normalement.
  const scrollRef = useRef(null)
  const modalRef = useRef(null)
  const requestCloseRef = useRef(null)
  requestCloseRef.current = () => animateClose(onCancel)
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    let startY = 0
    let decided = false
    let fromGrip = false
    let fromNested = false
    let curDy = 0
    const onTS = (e) => {
      if (e.touches.length !== 1) return
      startY = e.touches[0].clientY
      draggingRef.current = false
      decided = false
      curDy = 0
      fromGrip = Boolean(e.target.closest && e.target.closest('.modal-grip'))
      // Si le doigt part d'une liste défilante interne (résultats BGG), on ne
      // déclenche PAS le glissé-pour-fermer → elle défile normalement.
      fromNested = Boolean(e.target.closest && e.target.closest('.bgg-results'))
    }
    const onTM = (e) => {
      if (e.touches.length !== 1) return
      const dy = e.touches[0].clientY - startY
      if (!decided) {
        if (Math.abs(dy) < 6) return
        const atTop = (scrollRef.current ? scrollRef.current.scrollTop : 0) <= 0
        decided = true
        draggingRef.current = dy > 0 && !fromNested && (fromGrip || atTop)
      }
      if (draggingRef.current) {
        e.preventDefault() // bloque le défilement natif pendant le glissé de fermeture
        curDy = dy > 0 ? dy : 0
        setDrag(curDy)
      }
    }
    const onTE = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        if (curDy > 110) requestCloseRef.current()
        else setDrag(0)
      }
      decided = false
    }
    el.addEventListener('touchstart', onTS, { passive: true })
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE)
    el.addEventListener('touchcancel', onTE)
    return () => {
      el.removeEventListener('touchstart', onTS)
      el.removeEventListener('touchmove', onTM)
      el.removeEventListener('touchend', onTE)
      el.removeEventListener('touchcancel', onTE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Cases proposées = propriétaires gérés (Réglages) + ceux déjà sur ce jeu.
  const ownerChoices = (() => {
    const set = new Set([...(owners || []), ...parseOwners(game?.owner)])
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  })()
  // Cases proposées pour les tags = tags gérés (Réglages) + ceux déjà sur ce jeu.
  const tagChoices = (() => {
    const set = new Set([...(tags || []), ...parseTags(game?.tags)])
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  })()
  const isEdit = Boolean(game)

  // Alerte doublon (seulement à l'AJOUT) : un jeu déjà présent avec le même identifiant
  // BoardGameGeek, ou à défaut le même nom. On PRÉVIENT sans bloquer l'enregistrement.
  const duplicate = (() => {
    if (isEdit) return null
    const bggId = form.bgg_id ? String(form.bgg_id).trim() : ''
    const nm = normName(form.name)
    if (!bggId && !nm) return null
    return (
      existingGames.find((g) => bggId && g.bgg_id != null && String(g.bgg_id) === bggId) ||
      existingGames.find((g) => nm && normName(g.name) === nm) ||
      null
    )
  })()

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggleOwner = (o) => setOwnerSet((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]))
  const toggleTag = (t) => setTagSet((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))

  const openPhilibert = () => {
    if (!form.name.trim()) return
    window.open(philibertSearchUrl(form.name.trim()), '_blank', 'noopener')
  }

  // Remplit UNIQUEMENT le prix depuis Philibert (wishlist). Pas d'annulation : le prix
  // se corrige à la main, et « vérifier » ouvre la page Philibert pour contrôler.
  const fetchPhilibertPrice = async () => {
    const q = form.name.trim()
    if (!q) return
    setPriceLoading(true)
    setPricePhil(null)
    try {
      const r = await fetch(`/api/price?name=${encodeURIComponent(q)}`)
      const data = await r.json()
      if (data && data.found && data.price != null) {
        setForm((f) => ({ ...f, price: String(data.price) }))
        setPricePhil({ found: true, price: data.price })
      } else {
        setPricePhil({ found: false })
      }
    } catch {
      setPricePhil({ found: false })
    } finally {
      setPriceLoading(false)
    }
  }

  // Cherche l'IMAGE sur Philibert (secours si l'image BGG ne marche pas).
  const fetchPhilibertImage = async () => {
    const q = form.name.trim()
    if (!q) return
    setImgLoading(true)
    setImgPhil(null)
    try {
      const r = await fetch(`/api/price?name=${encodeURIComponent(q)}`)
      const data = await r.json()
      if (data && data.found && data.image) {
        setForm((f) => ({ ...f, image_url: data.image }))
        setImgPhil({ found: true })
      } else {
        setImgPhil({ found: false })
      }
    } catch {
      setImgPhil({ found: false })
    } finally {
      setImgLoading(false)
    }
  }

  // BoardGameGeek — recherche : renvoie une liste de jeux (nom + année) à choisir.
  const searchBgg = async () => {
    const query = form.name.trim()
    if (!query) return
    setBggLoading(true)
    setBggResults(null)
    setBggFilled(null)
    setBggError('')
    try {
      const r = await fetch(`/api/bgg?q=${encodeURIComponent(query)}`)
      const data = await r.json()
      setBggResults(Array.isArray(data.results) ? data.results : [])
      if (data.error) setBggError(data.error)
    } catch {
      setBggResults([])
      setBggError('Recherche impossible (pas de connexion ?).')
    } finally {
      setBggLoading(false)
    }
  }

  // BGG — sélection d'un résultat : récupère la fiche et pré-remplit le formulaire.
  const pickBgg = async (result) => {
    setBggLoading(true)
    setBggError('')
    try {
      const r = await fetch(`/api/bgg?id=${result.id}`)
      const d = await r.json()
      if (d && d.found) {
        setBggPrev({ form: { ...form }, playersSet, bestSet }) // pour pouvoir annuler
        setForm((f) => ({
          ...f,
          // On garde le nom TEL QU'AFFICHÉ dans la liste (français si la recherche était
          // en français) plutôt que le nom primaire anglais de la fiche BGG.
          name: result.name || d.name || f.name,
          image_url: d.image || f.image_url,
          complexity: d.complexity != null ? String(d.complexity) : f.complexity,
          duration: d.duration != null ? String(d.duration) : f.duration,
          bgg_id: d.bgg_id != null ? String(d.bgg_id) : f.bgg_id,
        }))
        if (d.players_min || d.players_max) setPlayersSet(expandRange(d.players_min, d.players_max))
        if (d.players_best) setBestSet(parseCounts(d.players_best))
        setBggFilled({ name: result.name || d.name })
        setBggResults(null) // referme la liste de résultats
      } else if (d && d.error) {
        setBggError(d.error)
      }
    } catch {
      setBggError('Import impossible (pas de connexion ?).')
    } finally {
      setBggLoading(false)
    }
  }

  // Annule l'import BGG : restaure le formulaire + les cases joueurs d'avant.
  const undoBgg = () => {
    if (!bggPrev) return
    setForm(bggPrev.form)
    setPlayersSet(bggPrev.playersSet)
    setBestSet(bggPrev.bestSet)
    setBggPrev(null)
    setBggFilled(null)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const players = countsToText(playersSet)
    const players_min = playersSet.length ? Math.min(...playersSet) : ''
    const players_max = playersSet.length ? Math.max(...playersSet) : ''
    const players_best = countsToText(bestSet)
    const owner = ownersToText(ownerSet)
    const tags = tagsToText(tagSet)
    const extensions = serializeExtensions(extList)
    // Une seule durée saisie → on remplit min ET max avec la même valeur (schéma inchangé).
    onSave({ ...form, owner, tags, players, players_min, players_max, players_best, extensions, duration_min: form.duration, duration_max: form.duration })
  }

  return (
    <div
      className="modal-backdrop"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 0.26s ease' }}
      onClick={requestCancel}
    >
      <div
        ref={modalRef}
        className={`modal ${closing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: closing
            ? `translateY(${typeof window !== 'undefined' ? window.innerHeight : 800}px)`
            : dragY
            ? `translateY(${dragY}px)`
            : undefined,
          transition: draggingRef.current ? 'none' : 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="modal-grip" aria-hidden="true" />
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            // Entrée sur un champ texte/nombre → on masque le clavier (blur) au lieu
            // de valider tout le formulaire ; on enregistre via le bouton dédié.
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault()
              e.target.blur()
            }
          }}
        >
          <div className="modal-scroll" ref={scrollRef}>
          <div className="modal-head">
            <h2>{isEdit ? 'Modifier le jeu' : 'Ajouter un jeu'}</h2>
            {isEdit && onDelete && (
              <button type="button" className="modal-del" onClick={onDelete} disabled={saving} title="Supprimer ce jeu" aria-label="Supprimer ce jeu">
                🗑️
              </button>
            )}
          </div>

          <label>
            Nom du jeu *
            <input value={form.name} onChange={set('name')} required placeholder="ex. Terraforming Mars" />
          </label>

          {duplicate && (
            <p className="dup-warn">
              « {duplicate.name} » est déjà dans ta {duplicate.status === 'wishlist' ? 'wishlist' : 'collection'}. Tu peux quand même l'ajouter.
            </p>
          )}

          <div className="autofill">
            <button type="button" className="price-btn bgg-btn" onClick={searchBgg} disabled={!form.name.trim() || bggLoading}>
              🎲 {bggLoading && !bggResults && !bggFilled ? 'Recherche…' : 'Chercher sur BoardGameGeek'}
            </button>
            {bggResults && bggResults.length > 0 && (
              <div className="bgg-results">
                {bggResults.map((res) => (
                  <button type="button" key={res.id} className="bgg-result" onClick={() => pickBgg(res)} disabled={bggLoading}>
                    <span className="bgg-result-name">{res.name}</span>
                    {res.year ? <span className="bgg-result-year">{res.year}</span> : null}
                  </button>
                ))}
              </div>
            )}
            {bggError && (
              <div className="price-found price-none"><span>{bggError}</span></div>
            )}
            {!bggError && bggResults && bggResults.length === 0 && (
              <div className="price-found price-none"><span>Aucun jeu trouvé sur BoardGameGeek.</span></div>
            )}
            {bggFilled && (
              <div className="price-found">
                <span>Fiche « {bggFilled.name} » importée (joueurs, durée, complexité, image).</span>
                <button type="button" className="price-verify" onClick={undoBgg}>↩ annuler</button>
              </div>
            )}
          </div>

          <div className="field">
            <span className="field-label">Propriétaire(s)</span>
            {ownerChoices.length > 0 ? (
              <div className="chips">
                {ownerChoices.map((o) => (
                  <button type="button" key={o} className={`fchip ${ownerSet.includes(o) ? 'on' : ''}`} onClick={() => toggleOwner(o)}>
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <p className="field-hint">Ajoute des propriétaires depuis l'écran Réglages ⚙️</p>
            )}
          </div>

          {form.status !== 'wishlist' && (
            <div className="field">
              <span className="field-label">🏷️ Tags</span>
              {tagChoices.length > 0 ? (
                <div className="chips">
                  {tagChoices.map((t) => (
                    <button type="button" key={t} className={`fchip ${tagSet.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="field-hint">Ajoute des tags depuis l'écran Réglages ⚙️</p>
              )}
            </div>
          )}

          {form.status === 'wishlist' && (
            <div className="field">
              <span className="field-label">💶 Prix (€)</span>
              <div className="price-row">
                <div className="input-clear price-input">
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="ex. 39.90" />
                  {form.price !== '' && form.price != null && (
                    <button type="button" className="clear-btn" onClick={() => setForm((f) => ({ ...f, price: '' }))} aria-label="Effacer le prix">×</button>
                  )}
                </div>
                <button
                  type="button"
                  className="price-btn price-phil-btn"
                  onClick={fetchPhilibertPrice}
                  disabled={!form.name.trim() || priceLoading}
                  title="Remplir le prix depuis Philibert"
                  aria-label="Remplir le prix depuis Philibert"
                >
                  {priceLoading ? '…' : <img className="phil-logo" src="https://www.google.com/s2/favicons?domain=philibertnet.com&sz=64" alt="" width="18" height="18" />}
                </button>
              </div>
              {pricePhil && pricePhil.found && (
                <span className="price-phil-msg">
                  Prix {Number(pricePhil.price).toFixed(2).replace('.', ',')} € rempli
                  <button type="button" className="price-verify" onClick={openPhilibert}>vérifier ↗</button>
                </span>
              )}
              {pricePhil && !pricePhil.found && (
                <span className="price-phil-msg muted">
                  Prix introuvable
                  <button type="button" className="price-verify" onClick={openPhilibert}>chercher ↗</button>
                </span>
              )}
            </div>
          )}

          <div className="field">
            <span className="field-label">👥 Nombre de joueurs</span>
            <PlayerPicker value={playersSet} onChange={setPlayersSet} />
          </div>

          <div className="field">
            <span className="field-label">⭐ Nombre de joueurs idéal</span>
            <PlayerPicker value={bestSet} onChange={setBestSet} />
          </div>

          <div className="row2">
            <label>
              🕑 Durée (min)
              <input type="number" inputMode="numeric" min="0" value={form.duration} onChange={set('duration')} placeholder="ex. 45" />
            </label>
            <label>
              🧠 Complexité (1 à 5)
              <input type="number" inputMode="decimal" step="any" min="1" max="5" value={form.complexity} onChange={set('complexity')} placeholder="ex. 2.7" />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Adresse de l'image</span>
            <div className="price-row">
              <div className="input-clear price-input">
                <input value={form.image_url} onChange={set('image_url')} placeholder="https://…" />
                {form.image_url.trim() && (
                  <button type="button" className="clear-btn" onClick={() => setForm((f) => ({ ...f, image_url: '' }))} aria-label="Effacer l'image">×</button>
                )}
              </div>
              <button
                type="button"
                className="price-btn price-phil-btn"
                onClick={fetchPhilibertImage}
                disabled={!form.name.trim() || imgLoading}
                title="Chercher l'image sur Philibert"
                aria-label="Chercher l'image sur Philibert"
              >
                {imgLoading ? '…' : <img className="phil-logo" src="https://www.google.com/s2/favicons?domain=philibertnet.com&sz=64" alt="" width="18" height="18" />}
              </button>
            </div>
            {imgPhil && !imgPhil.found && <span className="price-phil-msg muted">Image introuvable sur Philibert.</span>}
          </div>
          {form.image_url.trim() && (
            <img className="img-preview" src={form.image_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          )}

          {form.status !== 'wishlist' && (
            <div className="field">
              <span className="field-label">🧩 Extensions</span>
              {extList.map((x) => (
                <div className="ext-item" key={x.id}>
                  <div className="ext-row">
                    <input
                      value={x.name}
                      onChange={(e) => updateExt(x.id, 'name', e.target.value)}
                      placeholder="Nom de l'extension…"
                    />
                    <button type="button" className="ext-row-x" onClick={() => removeExt(x.id)} aria-label="Retirer cette extension">×</button>
                  </div>
                  <div className="ext-players-group">
                    <div className="ext-field">
                      <span className="ext-field-icon" title="Joueurs ajoutés par l'extension" aria-hidden="true">👥</span>
                      <input
                        className="ext-players"
                        value={x.players}
                        onChange={(e) => updateExt(x.id, 'players', e.target.value)}
                        placeholder="joueurs (ex. 5-6)"
                      />
                    </div>
                    <div className="ext-field">
                      <span className="ext-field-icon" title="Joueurs idéal ajoutés par l'extension" aria-hidden="true">⭐</span>
                      <input
                        className="ext-players"
                        value={x.best}
                        onChange={(e) => updateExt(x.id, 'best', e.target.value)}
                        placeholder="idéal (ex. 5)"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-ghost ext-add-btn" onClick={addExtRow}>
                ➕ Ajouter une extension
              </button>
            </div>
          )}

          <div className="field">
            <span className="field-label">Statut</span>
            <div className="chips">
              <button type="button" className={`fchip icon-chip ${form.status === 'collection' ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, status: 'collection' }))}>
                <CollectionIcon size={17} /> Collection
              </button>
              <button type="button" className={`fchip icon-chip ${form.status === 'wishlist' ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, status: 'wishlist' }))}>
                <WishlistIcon size={17} /> Wishlist
              </button>
            </div>
          </div>

          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={requestCancel} disabled={saving}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
