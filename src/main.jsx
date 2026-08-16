import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { watchAutoThemeColor } from './lib/theme'

// En mode « auto », suit le thème du téléphone même s'il change pendant l'utilisation.
watchAutoThemeColor()

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
