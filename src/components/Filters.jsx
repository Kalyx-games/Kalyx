import RangeSlider from './RangeSlider'
import PlayerPicker from './PlayerPicker'

// Panneau de filtres repliable de la Collection.
// L'état des filtres est géré par le parent (App) ; ici on ne fait que l'afficher.

const COMPLEXITIES = [
  { value: 'simple', label: 'Simple' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'complexe', label: 'Corsé' },
]

// Durée : un seul seuil "≤ X" à la fois (ou aucun). Le filtre garde les jeux dont la
// durée est INFÉRIEURE OU ÉGALE au seuil. Libellés courts pour tenir sur une ligne.
const DURATIONS = [
  { value: 15, label: '≤ 15 min' },
  { value: 30, label: '≤ 30 min' },
  { value: 60, label: '≤ 60 min' },
]

const fmtPrice = (v) => (v >= 150 ? '150 €+' : `${v} €`)

export default function Filters({ owners, tags, filters, setFilters, showPrice, onReset }) {
  const toggleOwner = (o) =>
    setFilters((f) => ({ ...f, owners: f.owners.includes(o) ? f.owners.filter((x) => x !== o) : [...f.owners, o] }))
  const toggleTag = (t) =>
    setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))
  const toggleTagsOnly = () => setFilters((f) => ({ ...f, tagsOnly: !f.tagsOnly }))
  const toggleOptimal = () => setFilters((f) => ({ ...f, playerOptimal: !f.playerOptimal }))
  const setPlayers = (arr) => setFilters((f) => ({ ...f, players: arr }))
  // Re-cliquer sur la durée déjà choisie la désélectionne (retour à "aucun").
  const setDuration = (v) => setFilters((f) => ({ ...f, duration: f.duration === v ? null : v }))
  const setPriceRange = (r) => setFilters((f) => ({ ...f, priceRange: r }))
  const toggleComplexity = (c) =>
    setFilters((f) => ({ ...f, complexity: f.complexity.includes(c) ? f.complexity.filter((x) => x !== c) : [...f.complexity, c] }))

  return (
    <div className="filters">
      {owners.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Propriétaire</span>
          <div className="chips">
            {owners.map((o) => (
              <button type="button" key={o} className={`fchip ${filters.owners.includes(o) ? 'on' : ''}`} onClick={() => toggleOwner(o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-group">
        <span className="filter-label">👥 Nombre de joueurs</span>
        <PlayerPicker value={filters.players} onChange={setPlayers} />
        <label className="filter-check">
          <input type="checkbox" checked={filters.playerOptimal} onChange={toggleOptimal} />
          Seulement si c'est le nombre idéal
        </label>
      </div>

      <div className="filter-group">
        <span className="filter-label">🕑 Durée</span>
        <div className="chips">
          {DURATIONS.map((d) => (
            <button type="button" key={d.value} className={`fchip ${filters.duration === d.value ? 'on' : ''}`} onClick={() => setDuration(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {showPrice && (
        <div className="filter-group">
          <span className="filter-label">💶 Prix</span>
          <RangeSlider min={0} max={150} step={5} value={filters.priceRange} onChange={setPriceRange} format={fmtPrice} />
        </div>
      )}

      <div className="filter-group">
        <span className="filter-label">🧠 Complexité</span>
        <div className="chips">
          {COMPLEXITIES.map((c) => (
            <button type="button" key={c.value} className={`fchip ${filters.complexity.includes(c.value) ? 'on' : ''}`} onClick={() => toggleComplexity(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">🏷️ Tags</span>
          <div className="chips">
            {tags.map((t) => (
              <button type="button" key={t} className={`fchip ${filters.tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
          <label className="filter-check">
            <input type="checkbox" checked={filters.tagsOnly} onChange={toggleTagsOnly} />
            N'afficher que les jeux ayant les tags sélectionnés
          </label>
        </div>
      )}

      <button type="button" className="filter-reset" onClick={onReset}>
        Réinitialiser les filtres
      </button>
    </div>
  )
}
