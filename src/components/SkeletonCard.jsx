// Carte "fantôme" scintillante affichée pendant le chargement de la liste,
// à la même forme qu'une vraie carte de jeu (donne une impression de rapidité).
export default function SkeletonCard() {
  return (
    <article className="game skeleton-card" aria-hidden="true">
      <div className="game-thumb sk" />
      <div className="game-body">
        <div className="sk sk-line sk-name" />
        <div className="sk sk-line sk-meta" />
        <div className="sk sk-line sk-meta sk-short" />
      </div>
    </article>
  )
}
