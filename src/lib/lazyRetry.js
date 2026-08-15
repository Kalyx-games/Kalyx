import { lazy } from 'react'

// Vide le service worker et ses caches, puis recharge la page. Indispensable après un
// déploiement : sans ça, l'ancien service worker peut resservir l'ancienne page (et ses
// anciens morceaux) → le simple reload ne corrige rien (voire boucle).
export async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if (window.caches) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* on recharge quand même */
  }
  window.location.reload()
}

// Charge un composant « à la demande » (code-splitting), mais de façon RÉSILIENTE.
//
// Problème visé : après un déploiement, une page déjà ouverte contient l'ancien code, qui
// référence des morceaux (chunks) aux anciens noms de fichiers. En changeant d'onglet, le
// téléchargement du morceau échoue (l'ancien fichier n'existe plus → 404). Sans filet, cette
// erreur n'est pas rattrapée par <Suspense> → tout l'écran devient blanc « définitivement ».
//
// Solution : si l'import échoue, on repart proprement de la version à jour (hardReload). Un
// horodatage en sessionStorage empêche toute boucle (au plus une tentative toutes les 10 s) ;
// au-delà, on laisse remonter l'erreur vers l'Error Boundary (écran « Recharger »).
export default function lazyRetry(factory) {
  return lazy(() =>
    factory().catch((err) => {
      try {
        const KEY = 'kx-chunk-reload'
        const last = Number(sessionStorage.getItem(KEY)) || 0
        // Seulement en ligne : hors ligne, on ne vide pas le cache (l'app doit rester lisible).
        if (navigator.onLine && Date.now() - last > 10000) {
          sessionStorage.setItem(KEY, String(Date.now()))
          hardReload()
          return new Promise(() => {}) // ne se résout jamais : la page se recharge
        }
      } catch {
        /* sessionStorage indisponible : on laisse l'erreur remonter */
      }
      throw err
    })
  )
}
