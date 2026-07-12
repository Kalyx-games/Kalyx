import { StatsIcon, CollectionIcon, WishlistIcon } from './icons'

// Barre d'onglets fixée en bas : Stats · Collection · Wishlist (tailles égales).
// L'onglet actif est mis en avant dynamiquement (pastille glissante + zoom via le CSS).
// (Chwazi a déménagé en haut à droite, à côté de l'engrenage.)
const TABS = [
  { key: 'stats', label: 'Stats', Icon: StatsIcon },
  { key: 'collection', label: 'Collection', Icon: CollectionIcon },
  { key: 'wishlist', label: 'Wishlist', Icon: WishlistIcon },
]

export default function NavBar({ view, onChange }) {
  const activeIndex = TABS.findIndex((t) => t.key === view)
  return (
    <nav className="navbar">
      {activeIndex >= 0 && (
        <span className="navbar-pill" style={{ transform: `translateX(calc(${activeIndex} * (100% + 12px)))` }} />
      )}
      {TABS.map(({ key, label, Icon }) => (
        <button
          type="button"
          key={key}
          className={`navtab ${view === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
          aria-current={view === key ? 'page' : undefined}
        >
          <Icon size={24} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
