// Sélecteur "nombre de joueurs" : une rangée de cases (1 à 12+) qu'on coche.
// `value` est une liste de nombres cochés ; `onChange` reçoit la nouvelle liste.
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export default function PlayerPicker({ value = [], onChange }) {
  const toggle = (n) => {
    const set = new Set(value)
    if (set.has(n)) set.delete(n)
    else set.add(n)
    onChange([...set].sort((a, b) => a - b))
  }

  return (
    <div className="ppick">
      {COUNTS.map((n) => (
        <button
          type="button"
          key={n}
          className={`ppick-chip ${value.includes(n) ? 'on' : ''}`}
          onClick={() => toggle(n)}
          aria-pressed={value.includes(n)}
        >
          {n === 12 ? '12+' : n}
        </button>
      ))}
    </div>
  )
}
