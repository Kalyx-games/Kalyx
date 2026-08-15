import { Component } from 'react'

// Filet de sécurité global : si un composant plante au rendu (ou si un morceau de code ne
// se charge pas), au lieu d'un écran blanc « définitif », on affiche un message clair avec un
// bouton « Recharger ». Rien ne peut donc casser l'appli sans porte de sortie.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    // Trace utile en cas d'analyse (visible dans la console du navigateur).
    // eslint-disable-next-line no-console
    console.error('Kalyx — erreur de rendu :', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const msg = String((error && error.message) || error || '')
    const isChunk = /chunk|dynamically imported|importing a module|failed to fetch|load failed/i.test(msg)

    const reload = () => {
      try {
        sessionStorage.removeItem('kx-chunk-reload')
      } catch {
        /* ignore */
      }
      window.location.reload()
    }

    return (
      <div className="crash">
        <p className="crash-emoji">😵</p>
        <h1 className="crash-title">Oups, un souci est survenu</h1>
        <p className="crash-msg">
          {isChunk
            ? "Une nouvelle version de l'appli est disponible. Recharge pour continuer."
            : "L'appli a rencontré une erreur. Recharge pour repartir — tes données sont en sécurité."}
        </p>
        <button type="button" className="btn-primary" onClick={reload}>
          Recharger l'appli
        </button>
      </div>
    )
  }
}
