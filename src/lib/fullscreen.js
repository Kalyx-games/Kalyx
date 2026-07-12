// Plein écran (masque la barre du navigateur/système). À appeler DANS un geste
// utilisateur (tap), sinon le navigateur refuse. Tout est protégé : si le plein
// écran n'est pas dispo, on ignore silencieusement.
export function enterFullscreen() {
  try {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {})
  } catch {
    /* plein écran refusé : tant pis */
  }
}
export function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
  } catch {
    /* rien */
  }
}
