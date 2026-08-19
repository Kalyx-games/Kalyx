import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { watchAutoThemeColor } from './lib/theme'

// En mode « auto », suit le thème du téléphone même s'il change pendant l'utilisation.
watchAutoThemeColor()

// App installée (PWA) : mise à jour AUTOMATIQUE fiable. Le service worker (skipWaiting +
// clientsClaim) s'active dès qu'une nouvelle version est déployée, MAIS la page déjà chargée
// continuait de faire tourner l'ANCIEN code (aucun rechargement automatique n'était branché →
// l'app installée restait longtemps sur une vieille version). On corrige :
//  1) quand le nouveau SW prend le contrôle → on recharge (sauf à la toute 1re installation) ;
//  2) on vérifie s'il y a une MAJ à chaque retour sur l'app (résume depuis l'arrière-plan).
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return // pas de rechargement à la 1re install (pas de contrôleur avant)
    refreshing = true
    window.location.reload()
  })
  const checkForUpdate = () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', checkForUpdate)
  window.addEventListener('focus', checkForUpdate)

  // 3) FILET : un service worker peut se coincer et resservir l'ancienne page indéfiniment,
  //    sans que rien ne le signale (vécu). Au démarrage, on compare donc nous-mêmes le bundle
  //    référencé par l'index.html EN LIGNE à celui que la page a chargé ; s'ils diffèrent, on
  //    renouvelle de force. Un verrou de session interdit toute boucle de rechargement, et on
  //    attend le premier rendu pour ne pas ralentir l'ouverture.
  const SELF_HEAL = 'kx-selfheal'
  window.addEventListener('load', () => {
    setTimeout(async () => {
      if (!navigator.onLine) return
      try {
        if (sessionStorage.getItem(SELF_HEAL)) return
        const { checkForUpdate: check, forceUpdate } = await import('./lib/update')
        const { aJour } = await check()
        if (aJour) return
        sessionStorage.setItem(SELF_HEAL, '1') // posé AVANT le rechargement → une seule tentative
        await forceUpdate()
      } catch {
        /* hors ligne, réseau capricieux… : on réessaiera au prochain démarrage */
      }
    }, 2500)
  })
}

// Point d'entrée : React prend le contrôle de la <div id="root"> du index.html.
// ErrorBoundary = filet global : une erreur de rendu affiche un écran « Recharger »
// au lieu de vider l'appli.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
