// Petites icônes SVG de l'app.
// Collection = bibliothèque verte, Wishlist = cœur rouge, Réglages = engrenage.

export function CollectionIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="#16a34a">
        <rect x="4.3" y="5.5" width="3" height="14" rx="1" />
        <rect x="8.3" y="7.5" width="3" height="12" rx="1" />
        <rect x="12.3" y="4.5" width="3" height="15" rx="1" />
        <rect x="16" y="8" width="2.9" height="11.5" rx="1" transform="rotate(11 17.45 13.75)" />
        <rect x="3" y="19.2" width="18" height="2.3" rx="1.15" />
      </g>
    </svg>
  )
}

export function WishlistIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="#ef4444"
        d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.15 2 7.5 2 4.9 4.1 3 6.7 3c1.5 0 2.9.7 3.8 1.8L12 6.1l1.5-1.3C14.4 3.7 15.8 3 17.3 3 19.9 3 22 4.9 22 7.5c0 3.65-3.4 6.74-8.55 11.48L12 20.3z"
      />
    </svg>
  )
}

export function StatsIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="#6366f1">
        <rect x="3.5" y="13" width="4" height="7" rx="1.2" />
        <rect x="10" y="9" width="4" height="11" rx="1.2" />
        <rect x="16.5" y="5" width="4" height="15" rx="1.2" />
      </g>
    </svg>
  )
}

// Code-barres (bouton scan).
export function BarcodeIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="#fff">
        <rect x="3" y="5" width="1.6" height="14" />
        <rect x="6" y="5" width="2.6" height="14" />
        <rect x="10" y="5" width="1.4" height="14" />
        <rect x="13" y="5" width="2.6" height="14" />
        <rect x="17" y="5" width="1.4" height="14" />
        <rect x="19.6" y="5" width="1.4" height="14" />
      </g>
    </svg>
  )
}

// Chwazi : trois doigts colorés posés sur l'écran.
export function ChwaziIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="7" cy="8.5" r="3.2" fill="#ef4444" />
      <circle cx="16.5" cy="7" r="3.2" fill="#2f6df6" />
      <circle cx="12" cy="16" r="3.2" fill="#22c55e" />
    </svg>
  )
}

export function SettingsIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.3 7.3 0 00-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.14.24.42.32.61.22l2.49-1c.52.39 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.24.09.5 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"
      />
    </svg>
  )
}
