// Thème clair / sombre. Trois choix : 'auto' (suit le téléphone), 'light', 'dark'.
// Mémorisé dans le navigateur (localStorage). Appliqué via l'attribut data-theme
// sur <html> ; 'auto' = pas d'attribut → le CSS suit prefers-color-scheme.

const KEY = 'kalyx-theme'
const DARK_BG = '#10151d'
const LIGHT_BG = '#ffffff'

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
