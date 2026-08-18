// Thème clair / sombre. Trois choix : 'auto' (suit le téléphone), 'light', 'dark'.
// Mémorisé dans le navigateur (localStorage). Appliqué via l'attribut data-theme
// sur <html> ; 'auto' = pas d'attribut → le CSS suit prefers-color-scheme.

const KEY = 'kalyx-theme'
// ⚠️ Ces deux couleurs de barre doivent rester identiques au script anti-FOUC de index.html
// (qui pose la couleur AVANT le chargement du bundle, on ne peut donc pas partager la constante).
// La barre du haut se fond dans la page (chantier 7) → la barre système prend le fond
// de PAGE, pas celui des cartes ; sinon un liseré d'une autre teinte la surplombe.
const DARK_BG = '#0b0b0c' // = --bg sombre
const LIGHT_BG = '#f4f4f5' // = --bg clair

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(t) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* stockage indispo : tant pis */
  }
  const root = document.documentElement
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t)
  else root.removeAttribute('data-theme')

  // Couleur de la barre du navigateur (Android) selon le thème réellement affiché.
  let resolved = t
  if (t === 'auto') {
    resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? DARK_BG : LIGHT_BG)
}

// À appeler UNE fois au démarrage. En mode 'auto' (aucun attribut data-theme), si le téléphone
// bascule clair/sombre pendant que l'app est ouverte, garde la couleur de la barre du navigateur
// synchronisée (le CSS suit déjà prefers-color-scheme ; seule la meta theme-color restait figée).
export function watchAutoThemeColor() {
  if (!window.matchMedia) return
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (document.documentElement.hasAttribute('data-theme')) return // choix explicite : on ne suit pas l'OS
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', e.matches ? DARK_BG : LIGHT_BG)
  })
}
