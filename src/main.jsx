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
