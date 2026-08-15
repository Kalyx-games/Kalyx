import { lazy } from 'react'

// Charge un composant « à la demande » (code-splitting), mais de façon RÉSILIENTE.
//
// Problème visé : après un déploiement, une page déjà ouverte contient l'ancien code, qui
// référence des morceaux (chunks) aux anciens noms de fichiers. En changeant d'onglet, le
// téléchargement du morceau échoue (l'ancien fichier n'existe plus → 404). Sans filet, cette
// erreur n'est pas rattrapée par <Suspense> → tout l'écran devient blanc « définitivement ».
//
// Solution : si l'import échoue, on RECHARGE la page une fois pour récupérer la version à
// jour. Un horodatage en sessionStorage empêche toute boucle de rechargement (au plus une
// tentative toutes les 10 s) ; au-delà, on laisse remonter l'erreur vers l'Error Boundary.
export default function lazyRetry(factory) {
  return lazy(() =>
    factory().catch((err) => {
      try {
        const KEY = 'kx-chunk-reload'
        const last = Number(sessionStorage.getItem(KEY)) || 0
        if (Date.now() - last > 10000) {
          sessionStorage.setItem(KEY, String(Date.now()))
          window.location.reload()
          return new Promise(() => {}) // ne se résout jamais : la page se recharge
        }
      } catch {
        /* sessionStorage indisponible : on laisse l'erreur remonter */
      }
      throw err
    })
  )
}
