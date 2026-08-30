import { useMemo } from 'react'

// Champ « nom » avec auto-complétion maison (le <datalist> natif ne marche pas partout
// sur mobile). Partagé par la saisie de partie et les tierlists.
// `playerNames` = liste de suggestions (joueurs déjà utilisés), les plus assidus d'abord.
export default function NameField({ id, value, onChange, onPick, onKeyDown, enterKeyHint, placeholder, playerNames, focused, setFocused, className, style }) {
  const v = (value || '').trim().toLowerCase()
  // Propositions : celles qui COMMENCENT par ce qui est tapé d'abord, puis celles qui le
  // contiennent ailleurs. Chaque groupe garde l'ordre reçu (les plus assidus en tête).
  const suggestions = useMemo(() => {
    if (focused !== id) return []
    const hits = playerNames.filter((n) => n.toLowerCase() !== v && (v === '' || n.toLowerCase().includes(v)))
    if (v === '') return hits.slice(0, 6)
    const starts = hits.filter((n) => n.toLowerCase().startsWith(v))
    const rest = hits.filter((n) => !n.toLowerCase().startsWith(v))
    return [...starts, ...rest].slice(0, 6)
  }, [focused, id, playerNames, v])
  return (
    <div className="sheet-name-wrap">
      <input
        className={className}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint={enterKeyHint}
        onFocus={() => setFocused(id)}
        onBlur={() => setTimeout(() => setFocused((cur) => (cur === id ? null : cur)), 150)}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <ul className="name-suggest">
          {suggestions.map((n) => (
            <li key={n}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(n)
                  setFocused(null)
                }}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
